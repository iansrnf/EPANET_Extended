import {
  buildModel,
  type BuildModelResult,
  type Issue,
  type NetworkData,
} from "@epanet-js/converters";
import type { Proj4Projection } from "@epanet-js/projections";
import { getElevationEngine, type ElevationSource } from "src/lib/elevations";
import { yieldToMain } from "src/infra/yield-to-main";
import {
  buildNetworkFromLayers,
  type NetworkLayer,
  type NetworkBuildOptions,
  type NetworkBuildIssue,
} from "./network";
import type {
  GisBuildIssue,
  GisBuildMetadata,
  GisBuildProgress,
  GisBuildResult,
  GisBuildStage,
} from "./build-types";

export type PreparedGisModel = {
  model: BuildModelResult;
  report: GisBuildResult;
  name: string;
};

type PrepareGisModelOptions = {
  projections: Map<string, Proj4Projection>;
  labelMaxLength: number;
  elevationSources: ElevationSource[];
  onProgress?: (progress: GisBuildProgress) => void;
  describeIssue?: (issue: Issue) => string;
};

export const prepareGisModel = async (
  layers: NetworkLayer[],
  options: NetworkBuildOptions,
  metadata: GisBuildMetadata,
  configuration: PrepareGisModelOptions,
): Promise<PreparedGisModel> => {
  const { signal } = metadata;
  const stages: GisBuildStage[] = [];
  let currentStage: { stage: string; startedAt: number } | null = null;
  const onProgress = (progress: GisBuildProgress) => {
    if (currentStage?.stage !== progress.stage) {
      const now = performance.now();
      if (currentStage)
        stages.push({
          stage: currentStage.stage,
          durationMs: now - currentStage.startedAt,
        });
      currentStage = { stage: progress.stage, startedAt: now };
    }
    configuration.onProgress?.({ ...progress, completedStages: [...stages] });
  };
  signal?.throwIfAborted();
  const { network, issues: networkIssues } = await buildNetworkFromLayers(
    layers,
    options,
    {
      signal,
      onProgress: ({ stage, completed, total }) => {
        const stages = {
          attributes: { name: "Reading mapped attributes", start: 0, end: 0.2 },
          topology: {
            name: "Building network connectivity",
            start: 0.2,
            end: 0.5,
          },
          devices: { name: "Building pumps and valves", start: 0.5, end: 0.65 },
          complete: {
            name: "Network geometry complete",
            start: 0.65,
            end: 0.65,
          },
        };
        const current = stages[stage];
        onProgress?.({
          stage: current.name,
          progress:
            current.start +
            (total > 0 ? completed / total : 1) * (current.end - current.start),
        });
      },
    },
  );
  const issues = describeNetworkIssues(networkIssues, layers);
  signal?.throwIfAborted();
  if (metadata.fetchElevations) {
    await populateElevations(
      network,
      metadata,
      { ...configuration, onProgress },
      issues,
    );
  }
  signal?.throwIfAborted();
  onProgress?.({ stage: "Creating hydraulic model", progress: 0.9 });
  await yieldToMain();
  const model = buildModel(network, {
    projections: configuration.projections,
    labelMaxLength: configuration.labelMaxLength,
  });
  for (const issue of model.issues) {
    issues.push({
      severity: issue.severity,
      message: configuration.describeIssue?.(issue) ?? describeIssue(issue),
    });
  }
  if (model.hydraulicModel.assets.size === 0) {
    throw new Error(
      "No network assets could be built. Check layer assignments and geometry.",
    );
  }
  const summary: Record<string, number> = {};
  for (const asset of model.hydraulicModel.assets.values()) {
    summary[asset.type] = (summary[asset.type] ?? 0) + 1;
  }
  summary.customerPoints = model.hydraulicModel.customerPoints.size;
  summary.zones = model.hydraulicModel.zones.size;
  signal?.throwIfAborted();
  onProgress?.({ stage: "Build complete", progress: 1 });
  return {
    model,
    name: sanitizeProjectName(metadata.name),
    report: {
      assetCount: model.hydraulicModel.assets.size,
      issues,
      summary,
      stages,
    },
  };
};

const populateElevations = async (
  network: NetworkData,
  metadata: GisBuildMetadata,
  configuration: PrepareGisModelOptions,
  issues: GisBuildIssue[],
) => {
  const nodes = [
    ...network.junctions,
    ...network.reservoirs,
    ...network.tanks,
  ].filter((node) => node.elevation === undefined);
  if (!nodes.length) return;
  const sources = configuration.elevationSources.filter(
    (source) => source.enabled,
  );
  if (!sources.length) {
    issues.push({
      severity: "warning",
      message: `${nodes.length} nodes have no elevation because no terrain source is enabled.`,
    });
    return;
  }
  configuration.onProgress?.({
    stage: "Fetching terrain elevations",
    progress: 0.65,
  });
  try {
    const elevations = await getElevationEngine().fetchElevations(
      sources,
      nodes.map((node) => ({
        lng: node.coordinates[0],
        lat: node.coordinates[1],
      })),
      network.units.elevation ?? "m",
      {
        signal: metadata.signal,
        onProgress: (resolved, total) =>
          configuration.onProgress?.({
            stage: "Fetching terrain elevations",
            progress: 0.65 + (total > 0 ? resolved / total : 1) * 0.2,
          }),
      },
    );
    metadata.signal?.throwIfAborted();
    let unresolved = 0;
    for (let index = 0; index < nodes.length; index++) {
      const elevation = elevations[index];
      if (
        elevation === null ||
        elevation === undefined ||
        !Number.isFinite(elevation)
      )
        unresolved++;
      else nodes[index].elevation = elevation;
    }
    if (unresolved)
      issues.push({
        severity: "warning",
        message: `${unresolved} nodes have no terrain elevation. Check terrain coverage and connectivity, or enter elevations after opening the model.`,
      });
  } catch (error) {
    metadata.signal?.throwIfAborted();
    issues.push({
      severity: "warning",
      message: `Terrain elevations could not be fetched for ${nodes.length} nodes: ${error instanceof Error ? error.message : String(error)}.`,
    });
  }
};

const sanitizeProjectName = (name: string): string =>
  name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim() ||
  `GIS model ${new Date().toISOString().slice(0, 10)}`;

const describeIssue = (issue: Issue): string =>
  `${issue.code.replace(/([A-Z])/g, " $1")}${issue.ref ? `: ${issue.ref}` : ""}${issue.context ? ` (${Object.values(issue.context).join(", ")})` : ""}`;

const describeNetworkIssues = (
  issues: NetworkBuildIssue[],
  layers: NetworkLayer[],
): GisBuildIssue[] => {
  const descriptions: Record<NetworkBuildIssue["code"], string> = {
    invalidGeometry:
      "Records with invalid or incompatible geometry were skipped",
    invalidValue:
      "Mapped values could not be read; empty values or configured defaults were used",
    emptyNetwork: "No network assets were found",
    mergedNodes:
      "Coincident network points were merged within the connection tolerance",
    zeroLengthPipe: "Zero-length pipes were skipped",
    duplicatePipe: "Duplicate pipes were removed",
    unconnectedDevice: "Pumps or valves could not be connected to a pipe",
    ambiguousDevice:
      "Pumps or valves have ambiguous connections; review their connectivity",
    disconnectedNetwork: "The network contains disconnected components",
    removedDisconnectedAssets:
      "Assets outside the largest connected component were removed",
  };
  const grouped = new Map<
    string,
    { issue: NetworkBuildIssue; count: number; refs: string[] }
  >();
  for (const issue of issues) {
    const key = `${issue.code}:${issue.layerId ?? ""}`;
    const group = grouped.get(key) ?? { issue, count: 0, refs: [] };
    group.count++;
    if (issue.ref && group.refs.length < 5) group.refs.push(issue.ref);
    grouped.set(key, group);
  }
  return [...grouped.values()].map(({ issue, count, refs }) => {
    const layer = layers.find((candidate) => candidate.id === issue.layerId);
    return {
      severity: issue.severity,
      message: `${descriptions[issue.code]}${layer ? ` in ${layer.name}` : ""} (${count})${refs.length ? `: ${refs.join(", ")}` : ""}.`,
    };
  });
};
