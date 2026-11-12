export type LoggerHistoryMode = "realtime" | "history";

export type LoggerHistoryInterval = "hourly" | "minute";

export type LoggerHistorySampleLimit = number | null;

export type LoggerHistoryRange = {
  from: string;
  to: string;
};

export type LoggerHistoryErrorCode =
  | "invalidRange"
  | "invalidSampleLimit"
  | "invalidInterval"
  | "invalidDeviceId"
  | "requestFailed"
  | "invalidResponse"
  | "notConfigured";

export class LoggerHistoryRequestError extends Error {
  constructor(public readonly code: LoggerHistoryErrorCode) {
    super(code);
    this.name = "LoggerHistoryRequestError";
  }
}
