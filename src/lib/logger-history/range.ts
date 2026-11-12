import { getLoggerTimestampMilliseconds } from "src/lib/logger-stream/history";
import { LOGGER_TIME_ZONE_OFFSET_MILLISECONDS } from "src/lib/logger-stream/time";
import { LoggerHistoryRequestError, type LoggerHistoryRange } from "./types";

export const LOGGER_HISTORY_HOUR_MILLISECONDS = 60 * 60 * 1000;

export const validateLoggerHistoryRange = (
  from: string,
  to: string,
): LoggerHistoryRange => {
  const fromMilliseconds = getZonedLoggerHistoryTimestamp(from);
  const toMilliseconds = getZonedLoggerHistoryTimestamp(to);
  if (
    fromMilliseconds === null ||
    toMilliseconds === null ||
    fromMilliseconds >= toMilliseconds
  ) {
    throw new LoggerHistoryRequestError("invalidRange");
  }
  return {
    from: new Date(fromMilliseconds).toISOString(),
    to: new Date(toMilliseconds).toISOString(),
  };
};

export const getDefaultLoggerHistoryRange = (
  now = new Date(),
): LoggerHistoryRange => {
  const toMilliseconds = Math.floor(now.getTime() / 1000) * 1000;
  if (!Number.isFinite(toMilliseconds))
    throw new LoggerHistoryRequestError("invalidRange");
  return {
    from: new Date(
      toMilliseconds - 24 * LOGGER_HISTORY_HOUR_MILLISECONDS,
    ).toISOString(),
    to: new Date(toMilliseconds).toISOString(),
  };
};

export const toLoggerHistoryDateTimeInput = (timestamp: string): string => {
  const milliseconds = getZonedLoggerHistoryTimestamp(timestamp);
  if (milliseconds === null)
    throw new LoggerHistoryRequestError("invalidRange");
  return new Date(milliseconds + LOGGER_TIME_ZONE_OFFSET_MILLISECONDS)
    .toISOString()
    .slice(0, 19);
};

export const fromLoggerHistoryDateTimeInput = (value: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value))
    throw new LoggerHistoryRequestError("invalidRange");
  const timestamp = `${value.length === 16 ? `${value}:00` : value}Z`;
  const milliseconds = getZonedLoggerHistoryTimestamp(timestamp);
  if (milliseconds === null)
    throw new LoggerHistoryRequestError("invalidRange");
  return new Date(
    milliseconds - LOGGER_TIME_ZONE_OFFSET_MILLISECONDS,
  ).toISOString();
};

export const getZonedLoggerHistoryTimestamp = (
  timestamp: string,
): number | null =>
  /(Z|[+-]\d{2}:\d{2})$/.test(timestamp)
    ? getLoggerTimestampMilliseconds(timestamp)
    : null;
