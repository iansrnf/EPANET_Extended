export const DEFAULT_LOGGER_TYPE = "xilog-plus-2i";

export type LoggerType = typeof DEFAULT_LOGGER_TYPE;

export type LoggerStreamStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export type LoggerStreamError =
  | "notConfigured"
  | "invalidUrl"
  | "connectionFailed"
  | "connectionClosed"
  | "invalidDeviceId";

export type LoggerPacket = {
  deviceId: string;
  type: string;
  timestamp: string;
  pressure?: number | null;
  status?: string;
  temp_or_status?: number | string | null;
  battery_v?: number | null;
  external_v?: number | null;
  gsm_pct?: number | null;
  raw?: string | null;
};

export type LoggerReading = Omit<LoggerPacket, "pressure"> & {
  pressure?: number;
  pressureTimestamp?: string;
};

export type LoggerPressureSample = {
  deviceId: string;
  timestamp: string;
  pressure: number;
};

export type LoggerStreamState = {
  loggerType: LoggerType;
  deviceId: string;
  status: LoggerStreamStatus;
  isRunning: boolean;
  reading: LoggerReading | null;
  history: readonly LoggerPressureSample[];
  error: LoggerStreamError | null;
};

export const createInitialLoggerStreamState = (
  deviceId = "",
): LoggerStreamState => ({
  loggerType: DEFAULT_LOGGER_TYPE,
  deviceId,
  status: "idle",
  isRunning: false,
  reading: null,
  history: [],
  error: null,
});

export const getDefaultLoggerDeviceId = (loggerIndex: number): string =>
  `L${Math.max(0, loggerIndex) + 1}`;

export const formatLoggerPressure = (value: number, locale?: string): string =>
  new Intl.NumberFormat(locale, {
    useGrouping: false,
    maximumFractionDigits: 6,
  }).format(value);
