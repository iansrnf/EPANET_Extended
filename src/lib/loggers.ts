import type { Position } from "geojson";
import type { AssetsMap } from "@epanet-js/hydraulic-model";
import type { Logger, LoggerConnection } from "@epanet-js/project-settings";
import { geodesicDistance } from "@epanet-js/geometry";

export const MAX_LOGGER_LABEL_LENGTH = 50;

export const nextLoggerLabel = (loggers: Logger[], prefix: string): string => {
  const labels = new Set(
    loggers.map((logger) => logger.label.toLocaleLowerCase()),
  );
  let ordinal = 1;
  while (labels.has(`${prefix} ${ordinal}`.toLocaleLowerCase())) ordinal += 1;
  return `${prefix} ${ordinal}`;
};

export const isLoggerLabelAvailable = (
  loggers: Logger[],
  id: string,
  label: string,
): boolean =>
  label.trim().length > 0 &&
  label.trim().length <= MAX_LOGGER_LABEL_LENGTH &&
  !loggers.some(
    (logger) =>
      logger.id !== id &&
      logger.label.toLocaleLowerCase() === label.trim().toLocaleLowerCase(),
  );

export const loggerCoordinates = (coordinates: Position): [number, number] => [
  coordinates[0],
  coordinates[1],
];

export const nearestLoggerJunctionConnection = (
  assets: AssetsMap,
  coordinates: Position,
): LoggerConnection | null => {
  if (!Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1]))
    return null;

  let nearestId = Infinity;
  let nearestCoordinates: Position | null = null;
  let nearestDistance = Infinity;
  for (const asset of assets.values()) {
    if (asset.type !== "junction") continue;
    const candidate = asset.coordinates;
    if (!Number.isFinite(candidate[0]) || !Number.isFinite(candidate[1]))
      continue;
    const distance = geodesicDistance(coordinates, candidate);
    if (
      Number.isFinite(distance) &&
      (distance < nearestDistance ||
        (distance === nearestDistance && asset.id < nearestId))
    ) {
      nearestId = asset.id;
      nearestCoordinates = candidate;
      nearestDistance = distance;
    }
  }

  return nearestCoordinates
    ? { assetId: nearestId, snapPoint: loggerCoordinates(nearestCoordinates) }
    : null;
};

export const transformLoggersCoordinates = (
  loggers: Logger[] | undefined,
  transform: (coordinates: Position) => Position,
): Logger[] | undefined =>
  loggers?.map((logger) => ({
    ...logger,
    coordinates: loggerCoordinates(transform(logger.coordinates)),
    connection: logger.connection
      ? {
          ...logger.connection,
          snapPoint: loggerCoordinates(transform(logger.connection.snapPoint)),
        }
      : null,
  }));

export const resolveLoggerConnection = (
  assets: AssetsMap,
  connection: LoggerConnection,
): LoggerConnection | null => {
  const asset = assets.get(connection.assetId);
  if (!asset) return null;
  if (asset.type === "pipe") {
    return {
      assetId: asset.id,
      snapPoint: loggerCoordinates(connection.snapPoint),
    };
  }
  if (
    asset.type === "junction" ||
    asset.type === "reservoir" ||
    asset.type === "tank"
  ) {
    return {
      assetId: asset.id,
      snapPoint: loggerCoordinates(asset.coordinates),
    };
  }
  return null;
};
