import type { LoggerPressureSample } from "src/lib/logger-stream/types";
import { selectLoggerHistory } from "./samples";
import { validateLoggerHistoryRange } from "./range";
import { validateLoggerHistorySampleLimit } from "./sampling";
import { validateLoggerHistoryInterval } from "./interval";
import {
  LoggerHistoryRequestError,
  type LoggerHistoryErrorCode,
  type LoggerHistoryRange,
  type LoggerHistorySampleLimit,
  type LoggerHistoryInterval,
} from "./types";

export const loadLoggerHistory = async (
  deviceId: string,
  range: LoggerHistoryRange,
  signal: AbortSignal,
  sampleLimit: LoggerHistorySampleLimit = null,
  interval: LoggerHistoryInterval = "hourly",
): Promise<readonly LoggerPressureSample[]> => {
  const validatedRange = validateLoggerHistoryRange(range.from, range.to);
  const limit = validateLoggerHistorySampleLimit(sampleLimit);
  const samplingInterval = validateLoggerHistoryInterval(interval);
  const expectedDeviceId = deviceId.trim();
  if (!expectedDeviceId || expectedDeviceId.length > 100)
    throw new LoggerHistoryRequestError("invalidDeviceId");
  const query = new URLSearchParams({
    deviceId: expectedDeviceId,
    from: validatedRange.from,
    to: validatedRange.to,
    limit: limit === null ? "all" : String(limit),
    interval: samplingInterval,
  });

  try {
    const response = await fetch(`/api/logger-history?${query.toString()}`, {
      cache: "no-store",
      signal,
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (signal.aborted) throw error;
      throw new LoggerHistoryRequestError(
        response.ok ? "invalidResponse" : "requestFailed",
      );
    }
    if (!response.ok)
      throw new LoggerHistoryRequestError(readHistoryErrorCode(payload));
    return selectLoggerHistory(
      payload,
      expectedDeviceId,
      validatedRange,
      limit,
      samplingInterval,
    );
  } catch (error) {
    if (signal.aborted || error instanceof LoggerHistoryRequestError)
      throw error;
    throw new LoggerHistoryRequestError("requestFailed");
  }
};

const readHistoryErrorCode = (payload: unknown): LoggerHistoryErrorCode => {
  if (payload && typeof payload === "object" && "error" in payload) {
    switch (payload.error) {
      case "invalidRange":
      case "invalidSampleLimit":
      case "invalidInterval":
      case "invalidDeviceId":
      case "invalidResponse":
      case "notConfigured":
        return payload.error;
    }
  }
  return "requestFailed";
};
