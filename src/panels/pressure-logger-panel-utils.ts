import type { HydraulicModel } from "src/hydraulic-model";
import type {
  Asset,
  AssetId,
  NodeAsset,
  Pipe,
} from "src/hydraulic-model/asset-types";
import type { PressureLogger } from "src/hydraulic-model/pressure-loggers";
import type { LoggerTelemetryReading } from "src/state/logger-telemetry";
import { findNearestPointOnLine } from "src/lib/geometry";

export interface ConnectedPressureLoggerNode {
  id: AssetId;
  label: string;
  assetType: "junction" | "tank" | "reservoir";
}

export interface PressureLoggerAnchorDebug {
  id: AssetId;
  label: string;
  type: string;
  coordinates: readonly number[];
  visibility: unknown;
  pressureLoggerId: unknown;
  reasons: string[];
  connectedLinkIds: AssetId[];
}

export interface PressureLoggerPipeDebug {
  id: AssetId;
  label: string;
  startNodeId: AssetId;
  startNodeLabel: string;
  endNodeId: AssetId;
  endNodeLabel: string;
  firstVertex: readonly number[];
  lastVertex: readonly number[];
  firstVertexNearLogger: boolean;
  lastVertexNearLogger: boolean;
  lineDistanceMeters: number | null;
  lineNearLogger: boolean;
}

export interface PressureLoggerConnectionDebug {
  logger: {
    id: number;
    label: string;
    coordinates: readonly number[];
    connectionJunctionId: AssetId | null;
  };
  anchors: PressureLoggerAnchorDebug[];
  pipeMatches: PressureLoggerPipeDebug[];
  connectedNodes: ConnectedPressureLoggerNode[];
}

export const getConnectedPressureLoggerNodes = (
  hydraulicModel: HydraulicModel,
  pressureLogger: PressureLogger,
): ConnectedPressureLoggerNode[] => {
  const connectedNodeById = new Map<AssetId, ConnectedPressureLoggerNode>();
  const anchorNodeIds = getPressureLoggerAnchorMatches(
    hydraulicModel,
    pressureLogger,
  ).map((match) => match.id);

  for (const anchorNodeId of anchorNodeIds) {
    const anchorAsset = hydraulicModel.assets.get(anchorNodeId);
    if (
      isPressureLoggerSimulationNode(anchorAsset) &&
      anchorAsset.label !== pressureLogger.label
    ) {
      connectedNodeById.set(anchorAsset.id, toConnectedNode(anchorAsset));
      continue;
    }

    const connectedLinkIds = hydraulicModel.topology.getLinks(anchorNodeId);

    for (const linkId of connectedLinkIds) {
      const [startNodeId, endNodeId] = hydraulicModel.topology.getNodes(linkId);
      const nodeId = startNodeId === anchorNodeId ? endNodeId : startNodeId;
      const asset = hydraulicModel.assets.get(nodeId);

      if (!isPressureLoggerSimulationNode(asset)) continue;

      connectedNodeById.set(nodeId, toConnectedNode(asset));
    }
  }

  return Array.from(connectedNodeById.values()).sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
};

export const buildPressureLoggerConnectionDebug = (
  hydraulicModel: HydraulicModel,
  pressureLogger: PressureLogger,
): PressureLoggerConnectionDebug => {
  return {
    logger: {
      id: pressureLogger.id,
      label: pressureLogger.label,
      coordinates: pressureLogger.coordinates,
      connectionJunctionId: pressureLogger.connection?.junctionId ?? null,
    },
    anchors: getPressureLoggerAnchorMatches(hydraulicModel, pressureLogger),
    pipeMatches: getPressureLoggerPipeMatches(hydraulicModel, pressureLogger),
    connectedNodes: getConnectedPressureLoggerNodes(
      hydraulicModel,
      pressureLogger,
    ),
  };
};

const getPressureLoggerAnchorMatches = (
  hydraulicModel: HydraulicModel,
  pressureLogger: PressureLogger,
): PressureLoggerAnchorDebug[] => {
  const anchorMatches = new Map<AssetId, PressureLoggerAnchorDebug>();
  const nearbyNodeMatches: PressureLoggerAnchorDebug[] = [];

  const addAnchor = (node: NodeAsset, reason: string) => {
    const existing = anchorMatches.get(node.id);
    if (existing) {
      if (!existing.reasons.includes(reason)) {
        existing.reasons.push(reason);
      }
      return;
    }

    anchorMatches.set(node.id, toAnchorDebug(hydraulicModel, node, [reason]));
  };

  if (pressureLogger.connection?.junctionId !== undefined) {
    const node = hydraulicModel.assets.get(pressureLogger.connection.junctionId);
    if (node?.isNode) {
      addAnchor(node as NodeAsset, "logger.connection.junctionId");
    }
  }

  for (const asset of hydraulicModel.assets.values()) {
    if (!asset.isNode) continue;
    const node = asset as NodeAsset;

    const pressureLoggerId = node.getProperty("pressureLoggerId");
    if (
      pressureLoggerIdMatches(pressureLoggerId, pressureLogger.id) ||
      pressureLoggerId === pressureLogger.label ||
      String(pressureLoggerId) === String(pressureLogger.id)
    ) {
      addAnchor(node, "node.pressureLoggerId");
      continue;
    }

    if (node.label === pressureLogger.label) {
      addAnchor(node, "node label matches logger label");
      continue;
    }

    if (isSameCoordinates(node.coordinates, pressureLogger.coordinates)) {
      addAnchor(node, "same coordinates as logger");
      continue;
    }

    if (
      node.getProperty("visibility") === false &&
      isNearCoordinates(node.coordinates, pressureLogger.coordinates)
    ) {
      nearbyNodeMatches.push(
        toAnchorDebug(hydraulicModel, node, ["near hidden node fallback"]),
      );
    }
  }

  for (const pipeMatch of getPressureLoggerPipeMatches(
    hydraulicModel,
    pressureLogger,
  )) {
    const startNode = hydraulicModel.assets.get(pipeMatch.startNodeId);
    const endNode = hydraulicModel.assets.get(pipeMatch.endNodeId);

    if (startNode?.isNode) {
      addAnchor(startNode as NodeAsset, `pipe ${pipeMatch.id} endpoint`);
    }
    if (endNode?.isNode) {
      addAnchor(endNode as NodeAsset, `pipe ${pipeMatch.id} endpoint`);
    }
  }

  if (anchorMatches.size === 0) {
    nearbyNodeMatches.forEach((match) => anchorMatches.set(match.id, match));
  }

  return Array.from(anchorMatches.values());
};

const getPressureLoggerPipeMatches = (
  hydraulicModel: HydraulicModel,
  pressureLogger: PressureLogger,
): PressureLoggerPipeDebug[] => {
  const pipeMatches: PressureLoggerPipeDebug[] = [];

  for (const asset of hydraulicModel.assets.values()) {
    if (!asset.isLink || asset.type !== "pipe") continue;
    const pipe = asset as Pipe;
    const firstVertexNearLogger = isNearCoordinates(
      pipe.firstVertex,
      pressureLogger.coordinates,
    );
    const lastVertexNearLogger = isNearCoordinates(
      pipe.lastVertex,
      pressureLogger.coordinates,
    );
    const lineDistanceMeters = getPipeDistanceToLoggerMeters(
      pipe,
      pressureLogger,
    );
    const lineNearLogger =
      lineDistanceMeters !== null &&
      lineDistanceMeters <= LOGGER_PIPE_LINE_TOLERANCE_METERS;

    if (!firstVertexNearLogger && !lastVertexNearLogger && !lineNearLogger) {
      continue;
    }

    const [startNodeId, endNodeId] = pipe.connections;
    const startNode = hydraulicModel.assets.get(startNodeId);
    const endNode = hydraulicModel.assets.get(endNodeId);

    pipeMatches.push({
      id: pipe.id,
      label: pipe.label,
      startNodeId,
      startNodeLabel: startNode?.label ?? String(startNodeId),
      endNodeId,
      endNodeLabel: endNode?.label ?? String(endNodeId),
      firstVertex: pipe.firstVertex,
      lastVertex: pipe.lastVertex,
      firstVertexNearLogger,
      lastVertexNearLogger,
      lineDistanceMeters,
      lineNearLogger,
    });
  }

  return pipeMatches;
};

const toAnchorDebug = (
  hydraulicModel: HydraulicModel,
  node: NodeAsset,
  reasons: string[],
): PressureLoggerAnchorDebug => ({
  id: node.id,
  label: node.label,
  type: node.type,
  coordinates: node.coordinates,
  visibility: node.getProperty("visibility"),
  pressureLoggerId: node.getProperty("pressureLoggerId"),
  reasons,
  connectedLinkIds: hydraulicModel.topology.getLinks(node.id),
});

const pressureLoggerIdMatches = (
  value: string | boolean | undefined,
  pressureLoggerId: number,
): boolean => {
  if (typeof value !== "string") return false;

  return value === String(pressureLoggerId);
};

const isSameCoordinates = (
  a: readonly number[],
  b: readonly number[],
): boolean => {
  const coordinateTolerance = 1e-9;
  return (
    Math.abs(a[0] - b[0]) <= coordinateTolerance &&
    Math.abs(a[1] - b[1]) <= coordinateTolerance
  );
};

const isNearCoordinates = (
  a: readonly number[],
  b: readonly number[],
): boolean => {
  return (
    Math.abs(a[0] - b[0]) <= LOGGER_PIPE_ENDPOINT_TOLERANCE_DEGREES &&
    Math.abs(a[1] - b[1]) <= LOGGER_PIPE_ENDPOINT_TOLERANCE_DEGREES
  );
};

const getPipeDistanceToLoggerMeters = (
  pipe: Pipe,
  pressureLogger: PressureLogger,
): number | null => {
  const nearest = findNearestPointOnLine(
    pipe.feature,
    {
      type: "Point",
      coordinates: pressureLogger.coordinates,
    },
    { units: "kilometers" },
  );

  return nearest.distance === null ? null : nearest.distance * 1000;
};

const LOGGER_PIPE_ENDPOINT_TOLERANCE_DEGREES = 0.0001;
const LOGGER_PIPE_LINE_TOLERANCE_METERS = 30;

const isPressureLoggerSimulationNode = (
  asset: Asset | undefined,
): asset is Asset & {
  isNode: true;
  type: "junction" | "tank" | "reservoir";
} => {
  if (!asset?.isNode) return false;
  if (asset.getProperty("visibility") === false) return false;

  return (
    asset.type === "junction" ||
    asset.type === "tank" ||
    asset.type === "reservoir"
  );
};

const toConnectedNode = (
  asset: Asset & {
    isNode: true;
    type: "junction" | "tank" | "reservoir";
  },
): ConnectedPressureLoggerNode => ({
  id: asset.id,
  label: asset.label,
  assetType: asset.type,
});

export interface LoggerPressureBucketPoint {
  x: number;
  y: number;
}

export const buildLoggerPressurePoints = (
  pressureHistory: LoggerTelemetryReading[],
): LoggerPressureBucketPoint[] => {
  const pressureSamples = pressureHistory.filter(
    (reading): reading is LoggerTelemetryReading & { psi: number } =>
      typeof reading.psi === "number" && Number.isFinite(reading.psi),
  );

  if (pressureSamples.length === 0) return [];

  const parsedTimestamps = pressureSamples.map((reading) =>
    Date.parse(reading.timestamp),
  );
  const hasValidTimestamps = parsedTimestamps.every((timestamp) =>
    Number.isFinite(timestamp),
  );

  if (!hasValidTimestamps) {
    return pressureSamples.map((reading, index) => ({
      x: index,
      y: reading.psi,
    }));
  }

  const firstTimestamp = parsedTimestamps[0]!;

  return pressureSamples.map((reading, index) => ({
    x: (parsedTimestamps[index]! - firstTimestamp) / 1000,
    y: reading.psi,
  }));
};

export const alignSimulationValuesToLoggerPoints = (
  loggerPoints: LoggerPressureBucketPoint[],
  simulationValues: ArrayLike<number>,
  intervalSeconds: number,
): LoggerPressureBucketPoint[] => {
  if (loggerPoints.length === 0 || simulationValues.length === 0) return [];
  if (intervalSeconds <= 0) return [];

  const lastSimulationIndex = simulationValues.length - 1;

  return loggerPoints.map((loggerPoint) => {
    const simulationIndex = Math.min(
      Math.floor(loggerPoint.x / intervalSeconds),
      lastSimulationIndex,
    );
    return {
      x: loggerPoint.x,
      y: simulationValues[simulationIndex] ?? simulationValues[lastSimulationIndex]!,
    };
  });
};
