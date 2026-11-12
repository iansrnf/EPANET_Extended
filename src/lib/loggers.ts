import type { Position } from "geojson";
import type { AssetsMap } from "@epanet-js/hydraulic-model";
import type { Logger, LoggerConnection } from "@epanet-js/project-settings";

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
