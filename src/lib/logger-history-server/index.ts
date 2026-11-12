import {
  LoggerHistoryRequestError,
  selectLoggerHistory,
  parseLoggerHistorySampleLimit,
  parseLoggerHistoryInterval,
  validateLoggerHistoryRange,
  type LoggerHistoryRange,
} from "src/lib/logger-history";

export const DEFAULT_LOGGER_HISTORY_URL =
  "https://logger-api.gscwd.app/xilog/history";

type LoggerHistoryRequestOptions = {
  configuredUrl?: string;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
};

type LoggerHistoryPressureRecord = {
  deviceId: string;
  type: "pressure";
  pressure: number;
  loggedAt: string;
};

export const buildLoggerHistoryUpstreamUrl = (
  configuredUrl: string | undefined,
  deviceId: string,
  range: LoggerHistoryRange,
): string => {
  const normalizedDeviceId = validateDeviceId(deviceId);
  const validatedRange = validateLoggerHistoryRange(range.from, range.to);
  let url: URL;
  try {
    url = new URL(configuredUrl?.trim() || DEFAULT_LOGGER_HISTORY_URL);
  } catch {
    throw new LoggerHistoryRequestError("notConfigured");
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new LoggerHistoryRequestError("notConfigured");

  url.search = "";
  url.searchParams.set("from", validatedRange.from);
  url.searchParams.set("to", validatedRange.to);
  url.searchParams.set("deviceId", normalizedDeviceId);
  return url.toString();
};

export const requestLoggerHistory = async (
  searchParams: URLSearchParams,
  { configuredUrl, signal, fetcher = fetch }: LoggerHistoryRequestOptions = {},
): Promise<LoggerHistoryPressureRecord[]> => {
  const allowedParameters = new Set([
    "deviceId",
    "from",
    "to",
    "limit",
    "interval",
  ]);
  for (const key of searchParams.keys()) {
    if (!allowedParameters.has(key))
      throw new LoggerHistoryRequestError("invalidRange");
    if (searchParams.getAll(key).length !== 1)
      throw new LoggerHistoryRequestError(
        key === "limit"
          ? "invalidSampleLimit"
          : key === "interval"
            ? "invalidInterval"
            : "invalidRange",
      );
  }
  const deviceId = validateDeviceId(searchParams.get("deviceId") ?? "");
  const sampleLimit = parseLoggerHistorySampleLimit(searchParams.get("limit"));
  const interval = parseLoggerHistoryInterval(searchParams.get("interval"));
  const range = validateLoggerHistoryRange(
    searchParams.get("from") ?? "",
    searchParams.get("to") ?? "",
  );
  const url = buildLoggerHistoryUpstreamUrl(configuredUrl, deviceId, range);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timeout = setTimeout(abort, 20000);

  try {
    if (controller.signal.aborted)
      throw new LoggerHistoryRequestError("requestFailed");
    const response = await fetcher(url, {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new LoggerHistoryRequestError("requestFailed");
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new LoggerHistoryRequestError(
        controller.signal.aborted ? "requestFailed" : "invalidResponse",
      );
    }
    return selectLoggerHistory(
      payload,
      deviceId,
      range,
      sampleLimit,
      interval,
    ).map((sample): LoggerHistoryPressureRecord => ({
      deviceId: sample.deviceId,
      type: "pressure",
      pressure: sample.pressure,
      loggedAt: sample.timestamp,
    }));
  } catch (error) {
    if (error instanceof LoggerHistoryRequestError) throw error;
    throw new LoggerHistoryRequestError("requestFailed");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
};

const validateDeviceId = (deviceId: string): string => {
  const normalizedDeviceId = deviceId.trim();
  if (!normalizedDeviceId || normalizedDeviceId.length > 100)
    throw new LoggerHistoryRequestError("invalidDeviceId");
  return normalizedDeviceId;
};
