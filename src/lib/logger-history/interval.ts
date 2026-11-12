import { LoggerHistoryRequestError, type LoggerHistoryInterval } from "./types";

export const validateLoggerHistoryInterval = (
  value: unknown,
): LoggerHistoryInterval => {
  if (value === "hourly" || value === "minute") return value;
  throw new LoggerHistoryRequestError("invalidInterval");
};

export const parseLoggerHistoryInterval = (
  value: string | null,
): LoggerHistoryInterval => validateLoggerHistoryInterval(value ?? "hourly");

export const getLoggerHistoryIntervalMilliseconds = (
  interval: LoggerHistoryInterval,
): number =>
  validateLoggerHistoryInterval(interval) === "minute" ? 60000 : 3600000;
