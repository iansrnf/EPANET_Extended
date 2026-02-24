import { AssetId, AssetsMap, Pipe, Pump, Reservoir } from "src/hydraulic-model";
import { Link, findLargestSegment } from "src/hydraulic-model/asset-types/link";
import { Feature } from "src/types";
import calculateMidpoint from "@turf/midpoint";
import calculateBearing from "@turf/bearing";
import { Valve } from "src/hydraulic-model/asset-types";
import { controlKinds } from "src/hydraulic-model/asset-types/valve";
import { Tank } from "src/hydraulic-model/asset-types/tank";
import { LoggerPoint } from "src/hydraulic-model/asset-types/logger-point";
import type { ResultsReader } from "src/simulation/results-reader";
import type { NodeSymbology } from "src/map/symbology";
import { colorFor } from "src/map/symbology/range-color-rule";
import { convertTo } from "src/quantity";
import type { LiveLoggerReading } from "src/store/liveLoggerReadingsStore";

export const buildIconPointsSource = (
  assets: AssetsMap,
  selectedAssets: Set<AssetId>,
  simulationResults?: ResultsReader | null,
  nodeSymbology?: NodeSymbology,
  liveReadingsByDeviceId: Record<string, LiveLoggerReading> = {},
  loggerPanelStateById: Record<number, { wsDeviceId?: string }> = {},
): Feature[] => {
  const strippedFeatures = [];

  for (const asset of assets.values()) {
    let feature: Feature | null = null;

    switch (asset.type) {
      case "pump":
        feature = buildPumpIcon(
          asset as Pump,
          selectedAssets,
          simulationResults,
        );
        break;
      case "valve":
        feature = buildValveIcon(
          asset as Valve,
          selectedAssets,
          simulationResults,
        );
        break;
      case "pipe":
        const pipe = asset as Pipe;
        if (pipe.initialStatus === "cv") {
          feature = buildPipeCheckValveIcon(
            pipe,
            selectedAssets,
            simulationResults,
          );
        }
        break;
      case "tank":
        feature = buildNodeIcon(asset as Tank, selectedAssets);
        break;
      case "reservoir":
        feature = buildNodeIcon(asset as Reservoir, selectedAssets);
        break;
      case "loggerPoint":
        feature = buildNodeIcon(
          asset as LoggerPoint,
          selectedAssets,
          nodeSymbology,
          liveReadingsByDeviceId,
          loggerPanelStateById,
        );
        break;
      case "junction":
        break;
    }

    if (feature) {
      strippedFeatures.push(feature);
    }
  }

  return strippedFeatures;
};

const buildDirectionalLinkIcon = <T extends Link<any>>(
  asset: T,
  selectedAssets: Set<AssetId>,
  getIconProperties: (asset: T) => Record<string, any>,
): Feature => {
  const featureId = asset.id;
  const largestSegment = findLargestSegment(asset);
  const center = calculateMidpoint(...largestSegment);
  const bearing = calculateBearing(...largestSegment);

  return {
    type: "Feature",
    id: featureId,
    properties: {
      type: asset.type,
      rotation: bearing,
      selected: selectedAssets.has(asset.id),
      ...getIconProperties(asset),
    },
    geometry: {
      type: "Point",
      coordinates: center.geometry.coordinates,
    },
  };
};

const buildNodeIcon = (
  asset: Tank | Reservoir | LoggerPoint,
  selectedAssets: Set<AssetId>,
  nodeSymbology?: NodeSymbology,
  liveReadingsByDeviceId: Record<string, LiveLoggerReading> = {},
  loggerPanelStateById: Record<number, { wsDeviceId?: string }> = {},
): Feature => {
  const featureId = asset.id;
  const loggerLiveProperties =
    asset.type === "loggerPoint"
      ? getLoggerLiveProperties(
          asset as LoggerPoint,
          nodeSymbology,
          liveReadingsByDeviceId,
          loggerPanelStateById,
        )
      : {};

  return {
    type: "Feature",
    id: featureId,
    properties: {
      type: asset.type,
      isActive: asset.isActive,
      selected: selectedAssets.has(asset.id),
      ...loggerLiveProperties,
    },
    geometry: asset.feature.geometry,
  };
};

const getLoggerLiveProperties = (
  loggerPoint: LoggerPoint,
  nodeSymbology: NodeSymbology | undefined,
  liveReadingsByDeviceId: Record<string, LiveLoggerReading>,
  loggerPanelStateById: Record<number, { wsDeviceId?: string }>,
) => {
  const deviceId = loggerPoint.deviceId?.trim();
  const panelDeviceId = loggerPanelStateById[loggerPoint.id]?.wsDeviceId?.trim();
  const loggerLabel = loggerPoint.label?.trim();
  const liveReading =
    (deviceId && liveReadingsByDeviceId[deviceId]) ||
    (panelDeviceId && liveReadingsByDeviceId[panelDeviceId]) ||
    (loggerLabel && liveReadingsByDeviceId[loggerLabel]);
  if (typeof liveReading?.pressurePsi === "number") {
    const livePressurePsi = liveReading.pressurePsi;
    const livePressureLabel = `${livePressurePsi.toFixed(2)} psi`;
    const livePressureColor = getLivePressureColor(
      livePressurePsi,
      nodeSymbology,
    );

    return {
      liveConnected: Boolean(liveReading.connected),
      livePressurePsi,
      livePressureLabel,
      livePressureColor,
    };
  }

  if (!liveReading?.connected) {
    return {
      liveConnected: false,
      livePressurePsi: null,
      livePressureLabel: "N/A",
    };
  }
  return {
    liveConnected: true,
    livePressurePsi: null,
    livePressureLabel: "N/A",
  };
};

const getLivePressureColor = (
  pressurePsi: number,
  nodeSymbology?: NodeSymbology,
) => {
  const colorRule = nodeSymbology?.colorRule;
  if (!colorRule || colorRule.property !== "pressure") {
    return "#3b82f6";
  }

  const pressureForRule =
    colorRule.unit === "mwc"
      ? convertTo({ value: pressurePsi, unit: "psi" }, "mwc")
      : pressurePsi;

  return colorFor(colorRule, pressureForRule);
};

const buildPumpIcon = (
  pump: Pump,
  selectedAssets: Set<AssetId>,
  simulationResults?: ResultsReader | null,
): Feature => {
  const pumpSimulation = simulationResults?.getPump(pump.id);
  const status = pumpSimulation?.status ?? null;
  return buildDirectionalLinkIcon(pump, selectedAssets, (asset) => ({
    status: status ? status : asset.initialStatus,
    isActive: asset.isActive,
  }));
};

const buildValveIcon = (
  valve: Valve,
  selectedAssets: Set<AssetId>,
  simulationResults?: ResultsReader | null,
): Feature => {
  const valveSimulation = simulationResults?.getValve(valve.id);
  const simStatus = valveSimulation?.status ?? null;
  const status = valve.isActive
    ? simStatus
      ? simStatus
      : valve.initialStatus
    : "disabled";
  return buildDirectionalLinkIcon(valve, selectedAssets, () => ({
    kind: valve.kind,
    icon: `valve-${valve.kind}-${status}`,
    isControlValve: controlKinds.includes(valve.kind),
  }));
};

const buildPipeCheckValveIcon = (
  pipe: Pipe,
  selectedAssets: Set<AssetId>,
  simulationResults?: ResultsReader | null,
): Feature => {
  const pipeSimulation = simulationResults?.getPipe(pipe.id);
  const simStatus = pipeSimulation?.status ?? null;
  const status = pipe.isActive
    ? simStatus === "closed"
      ? "closed"
      : "open"
    : "disabled";
  return buildDirectionalLinkIcon(pipe, selectedAssets, () => ({
    icon: `pipe-cv-${status}`,
  }));
};
