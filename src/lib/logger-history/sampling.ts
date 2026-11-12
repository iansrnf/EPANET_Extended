import type { LoggerPressureSample } from "src/lib/logger-stream/types";
import {
  LoggerHistoryRequestError,
  type LoggerHistorySampleLimit,
} from "./types";

export const validateLoggerHistorySampleLimit = (
  value: unknown,
): LoggerHistorySampleLimit => {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
    throw new LoggerHistoryRequestError("invalidSampleLimit");
  return value;
};

export const parseLoggerHistorySampleLimit = (
  value: string | null,
): LoggerHistorySampleLimit => {
  if (value === null || value === "all") return null;
  if (!/^[1-9]\d*$/.test(value))
    throw new LoggerHistoryRequestError("invalidSampleLimit");
  return validateLoggerHistorySampleLimit(Number(value));
};

export const applyLoggerHistorySampleLimit = (
  samples: readonly LoggerPressureSample[],
  sampleLimit: LoggerHistorySampleLimit,
): readonly LoggerPressureSample[] => {
  const limit = validateLoggerHistorySampleLimit(sampleLimit);
  return limit === null || samples.length <= limit
    ? samples
    : samples.slice(-limit);
};
