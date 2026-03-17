import type { HydraulicModel } from "src/hydraulic-model";
import type { AssetId } from "src/hydraulic-model/asset-types";
import type { PressureLogger } from "src/hydraulic-model/pressure-loggers";
import type { LoggerTelemetryReading } from "src/state/logger-telemetry";

export interface ConnectedPressureLoggerNode {
  id: AssetId;
  label: string;
  assetType: "junction" | "tank" | "reservoir";
}

export const getConnectedPressureLoggerNodes = (
  hydraulicModel: HydraulicModel,
  pressureLogger: PressureLogger,
): ConnectedPressureLoggerNode[] => {
  const backingJunctionId = pressureLogger.connection?.junctionId;
  if (backingJunctionId === undefined) return [];

  const connectedNodeById = new Map<AssetId, ConnectedPressureLoggerNode>();
  const connectedLinkIds = hydraulicModel.topology.getLinks(backingJunctionId);

  for (const linkId of connectedLinkIds) {
    const [startNodeId, endNodeId] = hydraulicModel.topology.getNodes(linkId);
    const nodeId = startNodeId === backingJunctionId ? endNodeId : startNodeId;
    const asset = hydraulicModel.assets.get(nodeId);

    if (!asset?.isNode) continue;
    if (asset.getProperty("visibility") === false) continue;
    if (
      asset.type !== "junction" &&
      asset.type !== "tank" &&
      asset.type !== "reservoir"
    ) {
      continue;
    }

    connectedNodeById.set(nodeId, {
      id: nodeId,
      label: asset.label,
      assetType: asset.type,
    });
  }

  return Array.from(connectedNodeById.values()).sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
};

export interface LoggerPressureBucketPoint {
  x: number;
  y: number;
}

export const buildLoggerPressurePoints = (
  pressureHistory: LoggerTelemetryReading[],
): LoggerPressureBucketPoint[] => {
  if (pressureHistory.length === 0) return [];

  const parsedTimestamps = pressureHistory.map((reading) =>
    Date.parse(reading.timestamp),
  );
  const hasValidTimestamps = parsedTimestamps.every((timestamp) =>
    Number.isFinite(timestamp),
  );

  if (!hasValidTimestamps) {
    return pressureHistory.map((reading, index) => ({
      x: index,
      y: reading.psi,
    }));
  }

  const firstTimestamp = parsedTimestamps[0]!;

  return pressureHistory.map((reading, index) => ({
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
