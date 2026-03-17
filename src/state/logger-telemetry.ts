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
  lastError: string | null;
};

export const initialLoggerTelemetryState: LoggerTelemetryState = {
  connectionState: "idle",
  readingsByDeviceId: {},
  lastError: null,
};

export const loggerTelemetryAtom = atom<LoggerTelemetryState>(
  initialLoggerTelemetryState,
);
