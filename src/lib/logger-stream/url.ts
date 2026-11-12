import type { LoggerStreamError } from "./types";

export class LoggerStreamConfigurationError extends Error {
  constructor(public readonly code: LoggerStreamError) {
    super(code);
    this.name = "LoggerStreamConfigurationError";
  }
}

export const buildLoggerStreamUrl = (
  configuredUrl: string,
  deviceId: string,
): string => {
  if (!configuredUrl.trim())
    throw new LoggerStreamConfigurationError("notConfigured");
  if (!deviceId.trim())
    throw new LoggerStreamConfigurationError("invalidDeviceId");
  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new LoggerStreamConfigurationError("invalidUrl");
  }
  if (
    (url.protocol !== "ws:" && url.protocol !== "wss:") ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new LoggerStreamConfigurationError("invalidUrl");
  }
  url.searchParams.set("deviceId", deviceId.trim());
  return url.toString();
};

export const loadLoggerStreamUrl = async (
  signal: AbortSignal,
): Promise<string> => {
  const response = await fetch("/api/logger-stream-config", {
    cache: "no-store",
    signal,
  });
  const configuration: unknown = await response.json();
  if (
    configuration &&
    typeof configuration === "object" &&
    "error" in configuration &&
    (configuration.error === "notConfigured" ||
      configuration.error === "invalidUrl")
  ) {
    throw new LoggerStreamConfigurationError(configuration.error);
  }
  if (
    !response.ok ||
    !configuration ||
    typeof configuration !== "object" ||
    !("url" in configuration) ||
    typeof configuration.url !== "string"
  ) {
    throw new LoggerStreamConfigurationError("connectionFailed");
  }
  return configuration.url;
};
