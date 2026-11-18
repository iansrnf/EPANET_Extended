import Flatbush from "flatbush";
import type { Feature, Position } from "geojson";
import {
  emptyNetworkData,
  type CustomAttributeValues,
  type JunctionData,
  type NetworkData,
  type NodeData,
  type PipeData,
  type PumpData,
  type ReservoirData,
  type SourceUnits,
  type TankData,
  type ValveData,
  type ValveKind,
} from "@epanet-js/converters";
import { convertTo } from "@epanet-js/quantity";
import { createTimeSlicer } from "src/infra/yield-to-main";
import {
  matchesNetworkFilter,
  readBooleanAttribute,
  readNetworkAttributes,
  readNumericAttribute,
  readTextAttribute,
} from "./attributes";
import {
  createMetricProjection,
  geographicLength,
  isGeographicPosition,
  pathPoint,
  projectOnSegment,
  segmentIntersection,
  squaredDistance,
  type MetricProjection,
  type XY,
} from "./geometry";
import type {
  NetworkBuildIssue,
  NetworkBuildOptions,
  NetworkBuildResult,
  NetworkBuildRuntimeOptions,
  NetworkBuildSummary,
  NetworkLayer,
  NetworkLayerRole,
  NetworkValue,
} from "./types";

type NodeKind = "junction" | "reservoir" | "tank";
type LinkKind = "pipe" | "pump" | "valve";
type LinkData = PipeData | PumpData | ValveData;
type NodeRecord = {
  kind: NodeKind;
  data: JunctionData & ReservoirData & TankData;
  generated: boolean;
  layerId?: string;
  allowedPath?: number;
};
type PathRecord = {
  role: LinkKind;
  layerId: string;
  data: LinkData;
  coordinates: Position[];
  xy: XY[];
  distances: number[];
  cuts: { distance: number; node: NodeRecord }[];
};
type Segment = { path: number; index: number; a: XY; b: XY };
type PointDevice = {
  role: "pump" | "valve";
  data: PumpData | ValveData;
  node: NodeRecord;
  layerId: string;
  reverse: boolean;
};
type BuiltPipe = {
  data: PipeData;
  coordinates: Position[];
  layerId: string;
  statedLength: boolean;
};

export { pipeStatus, pumpStatus, valveStatus, valveKind };

export const buildNetworkFromLayers = async (
  layers: NetworkLayer[],
  options: NetworkBuildOptions,
  runtime: NetworkBuildRuntimeOptions = {},
): Promise<NetworkBuildResult> => {
  throwIfAborted(runtime.signal);
  const network = emptyNetworkData();
  network.units = options.units;
  network.crs = { type: "epsg", code: 4326 };
  network.headlossFormula = options.headlossFormula;
  const issues: NetworkBuildIssue[] = [];
  const summary = initialSummary();
  const projection = createMetricProjection(firstLatitude(layers));
  const tolerance = Number.isFinite(options.snapTolerance)
    ? Math.max(0, options.snapTolerance)
    : 0.1;
  const nodeIndex = new NodeIndex(projection, tolerance);
  const paths: PathRecord[] = [];
  const devices: PointDevice[] = [];
  const customTypes = new Map<string, "number" | "text">();
  const customNames = new Set(
    layers.flatMap((layer) => layer.customAttributes ?? []),
  );
  const labelCounts = new Map<NetworkLayerRole, number>();
  const slice = createTimeSlicer();
  const allFeatures = layers.reduce(
    (total, layer) => total + layer.features.length,
    0,
  );
  const orderedLayers = [...layers].sort(
    (a, b) => layerPriority(a.role) - layerPriority(b.role),
  );

  for (const layer of orderedLayers) {
    for (let index = 0; index < layer.features.length; index++) {
      const feature = layer.features[index];
      summary.readFeatures++;
      if (summary.readFeatures % 256 === 0) {
        runtime.onProgress?.({
          stage: "attributes",
          completed: summary.readFeatures,
          total: allFeatures,
        });
        await slice();
        throwIfAborted(runtime.signal);
      }
      if (
        !(layer.filters ?? []).every((filter) =>
          matchesNetworkFilter(feature, filter),
        )
      ) {
        summary.excludedFeatures++;
        continue;
      }
      const ref = `${layer.id}:${index}`;
      const context = { layer, feature, ref, units: options.units, issues };
      const values = readNetworkAttributes(context);
      const label =
        readTextAttribute(values, "label") ??
        nextLabel(layer.role, options, labelCounts);
      const customAttributes = readCustomAttributes(
        feature,
        layer.customAttributes,
        customTypes,
      );
      const numeric = (property: string, quantity?: keyof SourceUnits) =>
        readNumericAttribute(values, property, context, quantity);
      const enumValue = <T extends string>(
        property: string,
        parse: (value: NetworkValue | undefined) => T | undefined,
      ): T | undefined => {
        const result = parse(values[property]);
        if (values[property] !== undefined && result === undefined)
          issues.push({
            code: "invalidValue",
            severity: "warning",
            layerId: layer.id,
            ref,
            context: {
              property,
              attribute: layer.mapping?.[property] ?? property,
            },
          });
        return result ?? parse(layer.defaults?.[property]);
      };
      const geometry = feature.geometry;
      const common = { ref, label, customAttributes };
      const invalidGeometry = () => {
        summary.invalidFeatures++;
        issues.push({
          code: "invalidGeometry",
          severity: "warning",
          layerId: layer.id,
          ref,
        });
      };

      if (layer.role === "zone") {
        if (geometry?.type !== "Polygon" && geometry?.type !== "MultiPolygon") {
          invalidGeometry();
          continue;
        }
        const sourcePolygons =
          geometry.type === "Polygon"
            ? [geometry.coordinates]
            : geometry.coordinates;
        const polygons = sourcePolygons
          .map((rings) =>
            rings
              .map(closeRing)
              .filter(
                (ring) => ring.length >= 4 && ring.every(isGeographicPosition),
              ),
          )
          .filter((rings) => rings.length > 0);
        if (polygons.length === 0) {
          invalidGeometry();
          continue;
        }
        network.zones.push({ ...common, polygons });
      } else if (layer.role === "customerPoint") {
        if (
          geometry?.type !== "Point" ||
          !isGeographicPosition(geometry.coordinates)
        ) {
          invalidGeometry();
          continue;
        }
        const demand = numeric(
          values.demand === undefined ? "baseDemand" : "demand",
          "customerDemand",
        );
        network.customerPoints.push({
          ...common,
          coordinates: [...geometry.coordinates],
          demands: demand === undefined ? undefined : [{ baseDemand: demand }],
        });
      } else if (isNodeRole(layer.role)) {
        if (
          geometry?.type !== "Point" ||
          !isGeographicPosition(geometry.coordinates)
        ) {
          invalidGeometry();
          continue;
        }
        const z = Number.isFinite(geometry.coordinates[2])
          ? geometry.coordinates[2]
          : undefined;
        const elevation =
          numeric("elevation", "elevation") ??
          normalizeElevation(z, layer.units, options.units);
        const coordinates = [...geometry.coordinates];
        if (z !== undefined)
          coordinates[2] = normalizeElevation(z, layer.units, options.units)!;
        const data: NodeRecord["data"] = { ...common, coordinates, elevation };
        if (layer.role === "junction") {
          const demand = numeric(
            values.demand === undefined ? "baseDemand" : "demand",
            "flow",
          );
          if (demand !== undefined) data.demands = [{ baseDemand: demand }];
        } else if (layer.role === "reservoir") {
          data.head = numeric("head", "elevation");
        } else {
          data.initialLevel = numeric("initialLevel", "level");
          data.minLevel = numeric("minLevel", "level");
          data.maxLevel = numeric("maxLevel", "level");
          data.diameter = numeric("diameter", "tankDiameter");
          data.minVolume = numeric("minVolume", "volume");
          data.overflow = readBooleanAttribute(values, "overflow");
          if (values.overflow !== undefined && data.overflow === undefined)
            issues.push({
              code: "invalidValue",
              severity: "warning",
              layerId: layer.id,
              ref,
              context: {
                property: "overflow",
                attribute: layer.mapping?.overflow ?? "overflow",
              },
            });
          data.overflow ??= readBooleanAttribute(
            layer.defaults ?? {},
            "overflow",
          );
        }
        const existing = nodeIndex.find(data.coordinates);
        if (existing) {
          summary.mergedNodes++;
          issues.push({
            code: "mergedNodes",
            severity: "warning",
            layerId: layer.id,
            ref,
          });
          if (existing.data.elevation === undefined)
            existing.data.elevation = data.elevation;
          if (data.demands && existing.kind === "junction")
            existing.data.demands = [
              ...(existing.data.demands ?? []),
              ...data.demands,
            ];
          if (customAttributes)
            existing.data.customAttributes = {
              ...customAttributes,
              ...existing.data.customAttributes,
            };
        } else
          nodeIndex.add({
            kind: layer.role,
            data,
            generated: false,
            layerId: layer.id,
          });
      } else {
        const role = layer.role;
        const base = {
          ...common,
          startNodeRef: "",
          endNodeRef: "",
          isActive: true,
        };
        let data: LinkData;
        if (role === "pipe") {
          data = {
            ...base,
            diameter: numeric("diameter", "diameter"),
            length: numeric("length", "length"),
            roughness: numeric("roughness"),
            minorLoss: numeric("minorLoss"),
            material: readTextAttribute(values, "material"),
            year: numeric("year"),
            initialStatus: enumValue("initialStatus", pipeStatus),
          };
        } else if (role === "pump") {
          data = {
            ...base,
            speed: numeric("speed"),
            initialStatus: enumValue("initialStatus", pumpStatus),
          };
        } else {
          const kind = enumValue("kind", valveKind) ?? "tcv";
          const quantity =
            kind === "fcv"
              ? "flow"
              : ["prv", "psv", "pbv"].includes(kind)
                ? "pressure"
                : undefined;
          const setting = numeric("setting", quantity);
          data = {
            ...base,
            kind,
            diameter: numeric("diameter", "diameter"),
            setting,
            minorLoss: numeric("minorLoss"),
            initialStatus:
              enumValue("initialStatus", valveStatus) ??
              (setting === undefined ? "open" : "active"),
          };
        }
        if (geometry?.type === "LineString") {
          const coordinates = cleanLine(geometry.coordinates).map((position) =>
            position.length > 2 && Number.isFinite(position[2])
              ? [
                  position[0],
                  position[1],
                  normalizeElevation(position[2], layer.units, options.units)!,
                ]
              : position,
          );
          if (
            coordinates.length < 2 ||
            !coordinates.every(isGeographicPosition)
          ) {
            invalidGeometry();
            continue;
          }
          if (geographicLength(coordinates) < 1e-7) {
            issues.push({
              code: "zeroLengthPipe",
              severity: "warning",
              layerId: layer.id,
              ref,
            });
            summary.invalidFeatures++;
            continue;
          }
          const xy = coordinates.map(projection.project);
          const distances = [0];
          for (let vertex = 1; vertex < xy.length; vertex++)
            distances.push(
              distances[vertex - 1] +
                Math.sqrt(squaredDistance(xy[vertex - 1], xy[vertex])),
            );
          paths.push({
            role,
            layerId: layer.id,
            data,
            coordinates,
            xy,
            distances,
            cuts: [],
          });
        } else if (
          role !== "pipe" &&
          geometry?.type === "Point" &&
          isGeographicPosition(geometry.coordinates)
        ) {
          const coordinates = [...geometry.coordinates];
          if (Number.isFinite(coordinates[2]))
            coordinates[2] = normalizeElevation(
              coordinates[2],
              layer.units,
              options.units,
            )!;
          const node =
            nodeIndex.find(coordinates) ??
            nodeIndex.add(generatedNode(coordinates, options, labelCounts));
          devices.push({
            role,
            data: data as PumpData | ValveData,
            node,
            layerId: layer.id,
            reverse: readBooleanAttribute(values, "reverse") === true,
          });
        } else {
          invalidGeometry();
          continue;
        }
      }
      summary.acceptedFeatures++;
    }
  }

  const segments: Segment[] = [];
  for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
    const path = paths[pathIndex];
    for (let index = 1; index < path.xy.length; index++)
      segments.push({
        path: pathIndex,
        index,
        a: path.xy[index - 1],
        b: path.xy[index],
      });
    for (const [side, position] of [
      path.coordinates[0],
      path.coordinates[path.coordinates.length - 1],
    ].entries()) {
      const node =
        nodeIndex.find(position) ??
        nodeIndex.add(generatedNode(position, options, labelCounts));
      path.cuts.push({
        distance: side === 0 ? 0 : path.distances[path.distances.length - 1],
        node,
      });
    }
    if (options.splitAtVertices) {
      for (const position of path.coordinates.slice(1, -1)) {
        if (!nodeIndex.find(position))
          nodeIndex.add(generatedNode(position, options, labelCounts));
      }
    }
    if (
      squaredDistance(path.xy[0], path.xy[path.xy.length - 1]) <=
        tolerance ** 2 &&
      path.distances[path.distances.length - 1] > tolerance
    ) {
      const position = pathPoint(
        path.coordinates,
        geographicLength(path.coordinates) / 2,
      ).position;
      if (!nodeIndex.find(position))
        nodeIndex.add(generatedNode(position, options, labelCounts));
    }
    if (pathIndex % 128 === 0) {
      await slice();
      throwIfAborted(runtime.signal);
    }
  }
  const segmentIndex = makeSegmentIndex(segments);
  for (const device of devices) {
    if (!device.node.generated || !segmentIndex) continue;
    const point = projection.project(device.node.data.coordinates);
    let nearest: { path: number; distance: number } | undefined;
    let atEndpoint = false;
    for (const index of segmentIndex.search(
      point[0] - tolerance,
      point[1] - tolerance,
      point[0] + tolerance,
      point[1] + tolerance,
    )) {
      const segment = segments[index];
      const distance = projectOnSegment(point, segment.a, segment.b).distance;
      if (distance <= tolerance && (!nearest || distance < nearest.distance))
        nearest = { path: segment.path, distance };
      if (
        (segment.index === 1 &&
          squaredDistance(point, segment.a) <= tolerance ** 2) ||
        (segment.index === paths[segment.path].coordinates.length - 1 &&
          squaredDistance(point, segment.b) <= tolerance ** 2)
      )
        atEndpoint = true;
    }
    device.node.allowedPath = atEndpoint ? undefined : nearest?.path;
  }
  if (options.splitAtIntersections && segmentIndex) {
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      const bounds = segmentBounds(segment);
      for (const candidate of segmentIndex.search(...bounds)) {
        if (candidate <= index || segments[candidate].path === segment.path)
          continue;
        const other = segments[candidate];
        const intersection = segmentIntersection(
          segment.a,
          segment.b,
          other.a,
          other.b,
        );
        if (intersection) {
          const position = projection.unproject(intersection);
          if (!nodeIndex.find(position))
            nodeIndex.add(generatedNode(position, options, labelCounts));
        }
      }
      if (index % 128 === 0) {
        await slice();
        throwIfAborted(runtime.signal);
      }
    }
  }

  const endpointDegrees = new Map<string, number>();
  for (const path of paths) {
    for (const { node } of path.cuts) {
      const ref = node.data.ref;
      endpointDegrees.set(ref, (endpointDegrees.get(ref) ?? 0) + 1);
    }
  }
  if (segmentIndex) {
    for (let index = 0; index < nodeIndex.nodes.length; index++) {
      const node = nodeIndex.nodes[index];
      if (
        (endpointDegrees.get(node.data.ref) ?? 0) > 1 &&
        !options.splitAtIntersections &&
        !options.splitAtVertices
      )
        continue;
      const point = projection.project(node.data.coordinates);
      const candidates = segmentIndex.search(
        point[0] - tolerance,
        point[1] - tolerance,
        point[0] + tolerance,
        point[1] + tolerance,
      );
      const nearestByPath = new Map<
        number,
        { distance: number; offset: number }
      >();
      for (const candidate of candidates) {
        const segment = segments[candidate];
        if (node.allowedPath !== undefined && node.allowedPath !== segment.path)
          continue;
        const projected = projectOnSegment(point, segment.a, segment.b);
        if (projected.distance > tolerance + 1e-8) continue;
        const path = paths[segment.path];
        const existing = nearestByPath.get(segment.path);
        if (!existing || projected.distance < existing.distance)
          nearestByPath.set(segment.path, {
            distance: projected.distance,
            offset:
              path.distances[segment.index - 1] +
              projected.t *
                (path.distances[segment.index] -
                  path.distances[segment.index - 1]),
          });
      }
      for (const [path, location] of nearestByPath)
        paths[path].cuts.push({ distance: location.offset, node });
      if (index % 128 === 0) {
        runtime.onProgress?.({
          stage: "topology",
          completed: index,
          total: nodeIndex.nodes.length,
        });
        await slice();
        throwIfAborted(runtime.signal);
      }
    }
  }

  const builtPipes: BuiltPipe[] = [];
  for (const path of paths) {
    const cuts = path.cuts
      .sort((a, b) => a.distance - b.distance)
      .filter(
        (cut, index, list) =>
          index === 0 ||
          Math.abs(cut.distance - list[index - 1].distance) > 1e-7,
      );
    const total = path.distances[path.distances.length - 1];
    for (let index = 1; index < cuts.length; index++) {
      const start = cuts[index - 1];
      const end = cuts[index];
      const coordinates = [
        start.node.data.coordinates,
        ...path.coordinates.filter(
          (_, vertex) =>
            path.distances[vertex] > start.distance + 1e-7 &&
            path.distances[vertex] < end.distance - 1e-7,
        ),
        end.node.data.coordinates,
      ];
      const meters = geographicLength(coordinates);
      if (
        meters < 1e-7 ||
        (start.node.data.ref === end.node.data.ref && meters <= tolerance)
      ) {
        issues.push({
          code: "zeroLengthPipe",
          severity: "warning",
          layerId: path.layerId,
          ref: path.data.ref,
        });
        continue;
      }
      const suffix = cuts.length > 2 ? `:${index}` : "";
      const data = {
        ...path.data,
        ref: `${path.data.ref}${suffix}`,
        label:
          path.data.label && suffix
            ? `${path.data.label}-${index}`
            : path.data.label,
        startNodeRef: start.node.data.ref,
        endNodeRef: end.node.data.ref,
        vertices: coordinates.slice(1, -1),
      };
      if (path.role === "pipe") {
        const pipe = data as PipeData;
        pipe.length =
          (path.data as PipeData).length === undefined
            ? convertTo(
                { value: meters, unit: "m" },
                options.units.length ?? "m",
              )
            : ((path.data as PipeData).length! *
                (end.distance - start.distance)) /
              total;
        builtPipes.push({
          data: pipe,
          coordinates,
          layerId: path.layerId,
          statedLength: (path.data as PipeData).length !== undefined,
        });
      } else if (path.role === "pump") network.pumps.push(data as PumpData);
      else network.valves.push(data as ValveData);
    }
    if (path.role === "pipe" && cuts.length > 2)
      summary.splitPipes += cuts.length - 2;
  }

  const seenPipes = new Set<string>();
  for (const pipe of builtPipes) {
    const key = canonicalGeometry(pipe.coordinates);
    if (options.removeDuplicatePipes && seenPipes.has(key)) {
      summary.duplicatePipesRemoved++;
      issues.push({
        code: "duplicatePipe",
        severity: "warning",
        layerId: pipe.layerId,
        ref: pipe.data.ref,
      });
    } else {
      seenPipes.add(key);
      network.pipes.push(pipe.data);
    }
  }
  const retainedPipeData = new Set(network.pipes);
  const retainedPipes = builtPipes.filter((pipe) =>
    retainedPipeData.has(pipe.data),
  );
  const pipeAdjacency = new Map<string, BuiltPipe[]>();
  for (const pipe of retainedPipes) {
    for (const ref of [pipe.data.startNodeRef, pipe.data.endNodeRef]) {
      const attached = pipeAdjacency.get(ref);
      if (attached) attached.push(pipe);
      else pipeAdjacency.set(ref, [pipe]);
    }
  }
  runtime.onProgress?.({
    stage: "devices",
    completed: 0,
    total: devices.length,
  });
  for (let index = 0; index < devices.length; index++) {
    insertDevice(
      devices[index],
      pipeAdjacency,
      nodeIndex,
      network,
      options,
      labelCounts,
      projection,
      issues,
    );
    if (index % 128 === 0) {
      await slice();
      throwIfAborted(runtime.signal);
    }
  }

  for (const node of nodeIndex.nodes) {
    if (node.kind === "junction") network.junctions.push(node.data);
    else if (node.kind === "reservoir") network.reservoirs.push(node.data);
    else network.tanks.push(node.data);
  }
  summary.generatedJunctions = nodeIndex.nodes.filter(
    (node) => node.generated,
  ).length;
  const components = connectedComponents(network);
  summary.components = components.length;
  if (components.length > 1)
    issues.push({
      code: "disconnectedNetwork",
      severity: "warning",
      context: { count: components.length },
    });
  if (options.keepLargestComponent && components.length > 1) {
    const kept = components.sort((a, b) => b.size - a.size)[0];
    const removed = nodeIndex.nodes.length - kept.size;
    network.junctions = network.junctions.filter((node) => kept.has(node.ref));
    network.reservoirs = network.reservoirs.filter((node) =>
      kept.has(node.ref),
    );
    network.tanks = network.tanks.filter((node) => kept.has(node.ref));
    network.pipes = network.pipes.filter(
      (link) => kept.has(link.startNodeRef) && kept.has(link.endNodeRef),
    );
    network.pumps = network.pumps.filter(
      (link) => kept.has(link.startNodeRef) && kept.has(link.endNodeRef),
    );
    network.valves = network.valves.filter(
      (link) => kept.has(link.startNodeRef) && kept.has(link.endNodeRef),
    );
    issues.push({
      code: "removedDisconnectedAssets",
      severity: "warning",
      context: { count: removed },
    });
    summary.components = 1;
  }
  network.customAttributes = [...customNames].map((name) => ({
    ref: name,
    name,
    type: customTypes.get(name) ?? "text",
  }));
  summary.counts = {
    pipe: network.pipes.length,
    junction: network.junctions.length,
    reservoir: network.reservoirs.length,
    tank: network.tanks.length,
    pump: network.pumps.length,
    valve: network.valves.length,
    customerPoint: network.customerPoints.length,
    zone: network.zones.length,
  };
  const nodesByRef = new Map<string, NodeData>(
    [...network.junctions, ...network.reservoirs, ...network.tanks].map(
      (node) => [node.ref, node],
    ),
  );
  for (const pipe of network.pipes) {
    const start = nodesByRef.get(pipe.startNodeRef);
    const end = nodesByRef.get(pipe.endNodeRef);
    if (start && end)
      summary.totalPipeLengthMeters += geographicLength([
        start.coordinates,
        ...(pipe.vertices ?? []),
        end.coordinates,
      ]);
  }
  if (Object.values(summary.counts).every((count) => count === 0))
    issues.push({ code: "emptyNetwork", severity: "error" });
  throwIfAborted(runtime.signal);
  runtime.onProgress?.({
    stage: "complete",
    completed: allFeatures,
    total: allFeatures,
  });
  return { network, issues, summary };
};

class NodeIndex {
  nodes: NodeRecord[] = [];
  private cells = new Map<string, NodeRecord[]>();
  private cellSize: number;
  constructor(
    private projection: MetricProjection,
    private tolerance: number,
  ) {
    this.cellSize = Math.max(tolerance, 0.001);
  }
  find(position: Position): NodeRecord | undefined {
    const point = this.projection.project(position);
    const x = Math.floor(point[0] / this.cellSize);
    const y = Math.floor(point[1] / this.cellSize);
    let nearest: NodeRecord | undefined;
    let distance = this.tolerance ** 2 + 1e-12;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        for (const node of this.cells.get(`${x + dx}:${y + dy}`) ?? []) {
          const squared = squaredDistance(
            point,
            this.projection.project(node.data.coordinates),
          );
          if (squared <= distance) {
            nearest = node;
            distance = squared;
          }
        }
      }
    return nearest;
  }
  add(node: NodeRecord): NodeRecord {
    this.nodes.push(node);
    const point = this.projection.project(node.data.coordinates);
    const key = `${Math.floor(point[0] / this.cellSize)}:${Math.floor(point[1] / this.cellSize)}`;
    const cell = this.cells.get(key);
    if (cell) cell.push(node);
    else this.cells.set(key, [node]);
    return node;
  }
}

const insertDevice = (
  device: PointDevice,
  pipeAdjacency: Map<string, BuiltPipe[]>,
  nodes: NodeIndex,
  network: NetworkData,
  options: NetworkBuildOptions,
  labelCounts: Map<NetworkLayerRole, number>,
  projection: MetricProjection,
  issues: NetworkBuildIssue[],
) => {
  const anchor = device.node;
  const incident = pipeAdjacency.get(anchor.data.ref) ?? [];
  const other = nodes.add(
    generatedNode(anchor.data.coordinates, options, labelCounts),
  );
  other.data.elevation = anchor.data.elevation;
  const targetMeters = convertTo(
    { value: 1, unit: options.units.length ?? "m" },
    "m",
  );
  if (incident.length === 2) {
    const pipe = incident[1];
    if (pipe.data.startNodeRef === anchor.data.ref)
      pipe.data.startNodeRef = other.data.ref;
    else pipe.data.endNodeRef = other.data.ref;
    pipeAdjacency.set(anchor.data.ref, [incident[0]]);
    pipeAdjacency.set(other.data.ref, [pipe]);
  }
  if (incident.length === 0)
    issues.push({
      code: "unconnectedDevice",
      severity: "warning",
      layerId: device.layerId,
      ref: device.data.ref,
    });
  if (incident.length > 2)
    issues.push({
      code: "ambiguousDevice",
      severity: "warning",
      layerId: device.layerId,
      ref: device.data.ref,
      context: { count: incident.length },
    });
  for (const node of [anchor, other]) {
    const attached = incident.filter(
      ({ data }) =>
        data.startNodeRef === node.data.ref ||
        data.endNodeRef === node.data.ref,
    );
    if (attached.length !== 1 || node.kind !== "junction") continue;
    const pipe = attached[0];
    const atStart = pipe.data.startNodeRef === node.data.ref;
    const coordinates = atStart
      ? pipe.coordinates
      : [...pipe.coordinates].reverse();
    const oldMeters = geographicLength(coordinates);
    const trim = Math.min(targetMeters / 2, oldMeters / 3);
    const location = pathPoint(coordinates, trim);
    node.data.coordinates = location.position;
    if (node.generated && Number.isFinite(location.position[2]))
      node.data.elevation = location.position[2];
    const shortened = [location.position, ...coordinates.slice(location.index)];
    pipe.coordinates = atStart ? shortened : shortened.reverse();
    pipe.data.vertices = pipe.coordinates.slice(1, -1);
    const newMeters = geographicLength(pipe.coordinates);
    pipe.data.length =
      pipe.statedLength && pipe.data.length !== undefined
        ? (pipe.data.length * newMeters) / oldMeters
        : convertTo(
            { value: newMeters, unit: "m" },
            options.units.length ?? "m",
          );
  }
  const a = projection.project(anchor.data.coordinates);
  const b = projection.project(other.data.coordinates);
  if (Math.sqrt(squaredDistance(a, b)) < targetMeters * 0.1) {
    const original = projection.project(other.data.coordinates);
    other.data.coordinates = projection.unproject([
      original[0] + targetMeters,
      original[1],
    ]);
  }
  const data = {
    ...device.data,
    startNodeRef: device.reverse ? other.data.ref : anchor.data.ref,
    endNodeRef: device.reverse ? anchor.data.ref : other.data.ref,
  };
  if (device.role === "pump") network.pumps.push(data as PumpData);
  else network.valves.push(data as ValveData);
};

const generatedNode = (
  coordinates: Position,
  options: NetworkBuildOptions,
  labelCounts: Map<NetworkLayerRole, number>,
): NodeRecord => {
  const number = (labelCounts.get("junction") ?? 0) + 1;
  const label = nextLabel("junction", options, labelCounts);
  const defaults = options.junctionDefaults ?? {};
  const elevation =
    typeof defaults.elevation === "number"
      ? defaults.elevation
      : Number.isFinite(coordinates[2])
        ? coordinates[2]
        : undefined;
  const demand =
    typeof defaults.demand === "number"
      ? defaults.demand
      : typeof defaults.baseDemand === "number"
        ? defaults.baseDemand
        : undefined;
  return {
    kind: "junction",
    generated: true,
    data: {
      ref: `generated:junction:${number}`,
      label,
      coordinates: [...coordinates],
      elevation,
      demands: demand === undefined ? undefined : [{ baseDemand: demand }],
    },
  };
};

const nextLabel = (
  role: NetworkLayerRole,
  options: NetworkBuildOptions,
  counts: Map<NetworkLayerRole, number>,
): string | undefined => {
  const index = (counts.get(role) ?? 0) + 1;
  counts.set(role, index);
  const prefix = options.labelPrefixes?.[role];
  return prefix === undefined ? undefined : `${prefix}${index}`;
};

const connectedComponents = (network: NetworkData): Set<string>[] => {
  const neighbors = new Map<string, Set<string>>();
  for (const node of [
    ...network.junctions,
    ...network.reservoirs,
    ...network.tanks,
  ])
    neighbors.set(node.ref, new Set());
  for (const link of [...network.pipes, ...network.pumps, ...network.valves]) {
    neighbors.get(link.startNodeRef)?.add(link.endNodeRef);
    neighbors.get(link.endNodeRef)?.add(link.startNodeRef);
  }
  const visited = new Set<string>();
  const components: Set<string>[] = [];
  for (const ref of neighbors.keys()) {
    if (visited.has(ref)) continue;
    const component = new Set<string>();
    const pending = [ref];
    visited.add(ref);
    while (pending.length) {
      const current = pending.pop()!;
      component.add(current);
      for (const next of neighbors.get(current) ?? [])
        if (!visited.has(next)) {
          visited.add(next);
          pending.push(next);
        }
    }
    components.push(component);
  }
  return components;
};

const makeSegmentIndex = (segments: Segment[]): Flatbush | undefined => {
  if (!segments.length) return undefined;
  const index = new Flatbush(segments.length);
  for (const segment of segments) index.add(...segmentBounds(segment));
  index.finish();
  return index;
};

const segmentBounds = (segment: Segment): [number, number, number, number] => [
  Math.min(segment.a[0], segment.b[0]),
  Math.min(segment.a[1], segment.b[1]),
  Math.max(segment.a[0], segment.b[0]),
  Math.max(segment.a[1], segment.b[1]),
];
const cleanLine = (coordinates: Position[]): Position[] =>
  coordinates
    .filter(
      (position, index) =>
        index === 0 ||
        position[0] !== coordinates[index - 1][0] ||
        position[1] !== coordinates[index - 1][1],
    )
    .map((position) => [...position]);
const closeRing = (ring: Position[]): Position[] =>
  ring.length &&
  (ring[0][0] !== ring[ring.length - 1][0] ||
    ring[0][1] !== ring[ring.length - 1][1])
    ? [...ring, [...ring[0]]]
    : ring;
const canonicalGeometry = (coordinates: Position[]): string => {
  const forward = coordinates
    .map((position) => `${position[0].toFixed(8)},${position[1].toFixed(8)}`)
    .join(";");
  const reverse = [...coordinates]
    .reverse()
    .map((position) => `${position[0].toFixed(8)},${position[1].toFixed(8)}`)
    .join(";");
  return forward < reverse ? forward : reverse;
};
const readCustomAttributes = (
  feature: Feature,
  attributes: string[] | undefined,
  types: Map<string, "number" | "text">,
): CustomAttributeValues | undefined => {
  const values: CustomAttributeValues = {};
  for (const name of attributes ?? []) {
    const value: unknown = feature.properties?.[name];
    if (value === null || value === undefined || value === "") continue;
    if (typeof value === "number" && Number.isFinite(value)) {
      values[name] = value;
      if (!types.has(name)) types.set(name, "number");
    } else if (typeof value === "string" || typeof value === "boolean") {
      values[name] = String(value);
      types.set(name, "text");
    }
  }
  return Object.keys(values).length ? values : undefined;
};
const normalizeElevation = (
  value: number | undefined,
  source: SourceUnits | undefined,
  target: SourceUnits,
): number | undefined =>
  value === undefined
    ? undefined
    : convertTo(
        { value, unit: source?.elevation ?? target.elevation ?? "m" },
        target.elevation ?? "m",
      );
const isNodeRole = (role: NetworkLayerRole): role is NodeKind =>
  role === "junction" || role === "reservoir" || role === "tank";
const layerPriority = (role: NetworkLayerRole): number =>
  role === "reservoir"
    ? 0
    : role === "tank"
      ? 1
      : role === "junction"
        ? 2
        : role === "pump" || role === "valve"
          ? 4
          : 3;
const firstLatitude = (layers: NetworkLayer[]): number => {
  for (const layer of layers)
    for (const feature of layer.features) {
      const geometry = feature.geometry;
      if (
        geometry?.type === "Point" &&
        isGeographicPosition(geometry.coordinates)
      )
        return geometry.coordinates[1];
      if (
        geometry?.type === "LineString" &&
        geometry.coordinates.length &&
        isGeographicPosition(geometry.coordinates[0])
      )
        return geometry.coordinates[0][1];
    }
  return 0;
};
const pipeStatus = (
  value: NetworkValue | undefined,
): PipeData["initialStatus"] => {
  const status = String(value ?? "").toLowerCase();
  if (["open", "closed", "cv"].includes(status))
    return status as PipeData["initialStatus"];
  if (["check valve", "checkvalve"].includes(status)) return "cv";
  return undefined;
};
const pumpStatus = (
  value: NetworkValue | undefined,
): PumpData["initialStatus"] => {
  const status = String(value ?? "").toLowerCase();
  if (["open", "on", "1", "true"].includes(status)) return "on";
  if (["closed", "off", "0", "false"].includes(status)) return "off";
  return undefined;
};
const valveStatus = (
  value: NetworkValue | undefined,
): ValveData["initialStatus"] => {
  const status = String(value ?? "").toLowerCase();
  return ["active", "open", "closed"].includes(status)
    ? (status as ValveData["initialStatus"])
    : undefined;
};
const valveKind = (value: NetworkValue | undefined): ValveKind | undefined => {
  const kind = String(value ?? "").toLowerCase();
  return ["prv", "psv", "pbv", "fcv", "tcv", "gpv", "pcv"].includes(kind)
    ? (kind as ValveKind)
    : undefined;
};
const throwIfAborted = (signal: AbortSignal | undefined) => {
  if (signal?.aborted)
    throw new DOMException("Operation cancelled", "AbortError");
};
const initialSummary = (): NetworkBuildSummary => ({
  readFeatures: 0,
  acceptedFeatures: 0,
  excludedFeatures: 0,
  invalidFeatures: 0,
  generatedJunctions: 0,
  mergedNodes: 0,
  splitPipes: 0,
  duplicatePipesRemoved: 0,
  components: 0,
  counts: {
    pipe: 0,
    junction: 0,
    reservoir: 0,
    tank: 0,
    pump: 0,
    valve: 0,
    customerPoint: 0,
    zone: 0,
  },
  totalPipeLengthMeters: 0,
});
