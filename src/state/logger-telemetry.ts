import { atom } from "jotai";

export type LoggerConnectionState =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "error";

export type LoggerTelemetryReading = {
  deviceId: string;
  psi: number;
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
  const existingHistory = state.pressureHistoryByDeviceId[reading.deviceId] ?? [];
  const nextSampleCount =
    (state.pressureSampleCountByDeviceId[reading.deviceId] ?? 0) + 1;
  const nextHistory = [...existingHistory, reading].slice(
    -MAX_LOGGER_HISTORY_POINTS,
  );

  return {
    ...state,
    readingsByDeviceId: {
      ...state.readingsByDeviceId,
      [reading.deviceId]: reading,
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
