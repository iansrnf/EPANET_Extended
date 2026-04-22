import { atom } from "jotai";

export type LoggerConnectionState =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "error";

export type LoggerTelemetryReading = {
  deviceId: string;
  psi?: number;
  timestamp: string;
  messageType?: string;
  status?: string;
  tempOrStatus?: string;
  batteryVoltage?: string;
  externalVoltage?: string;
  gsmPercent?: string;
  raw?: string;
};

export type LoggerTelemetryState = {
  connectionState: LoggerConnectionState;
  readingsByDeviceId: Record<string, LoggerTelemetryReading>;
  pressureHistoryByDeviceId: Record<string, LoggerTelemetryReading[]>;
  pressureSampleCountByDeviceId: Record<string, number>;
  lastError: string | null;
};

export const MAX_LOGGER_HISTORY_POINTS = 500;

export const initialLoggerTelemetryState: LoggerTelemetryState = {
  connectionState: "idle",
  readingsByDeviceId: {},
  pressureHistoryByDeviceId: {},
  pressureSampleCountByDeviceId: {},
  lastError: null,
};

export const recordLoggerTelemetryReading = (
  state: LoggerTelemetryState,
  reading: LoggerTelemetryReading,
): LoggerTelemetryState => {
  const existingReading = state.readingsByDeviceId[reading.deviceId];
  const existingHistory =
    state.pressureHistoryByDeviceId[reading.deviceId] ?? [];
  const mergedReading = {
    ...existingReading,
    ...reading,
  };
  const hasPressureSample =
    typeof reading.psi === "number" && Number.isFinite(reading.psi);
  const nextSampleCount = hasPressureSample
    ? (state.pressureSampleCountByDeviceId[reading.deviceId] ?? 0) + 1
    : (state.pressureSampleCountByDeviceId[reading.deviceId] ?? 0);
  const nextHistory = hasPressureSample
    ? [...existingHistory, mergedReading].slice(-MAX_LOGGER_HISTORY_POINTS)
    : existingHistory;

  return {
    ...state,
    readingsByDeviceId: {
      ...state.readingsByDeviceId,
      [reading.deviceId]: mergedReading,
    },
    pressureHistoryByDeviceId: {
      ...state.pressureHistoryByDeviceId,
      [reading.deviceId]: nextHistory,
    },
    pressureSampleCountByDeviceId: {
      ...state.pressureSampleCountByDeviceId,
      [reading.deviceId]: nextSampleCount,
    },
  };
};

export const loggerTelemetryAtom = atom<LoggerTelemetryState>(
  initialLoggerTelemetryState,
);
