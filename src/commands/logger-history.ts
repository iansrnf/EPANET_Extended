import { useCallback } from "react";
import { useStore } from "jotai";
import type { Store } from "src/state";
import {
  applyLoggerHistorySampleLimit,
  fromLoggerHistoryDateTimeInput,
  loadLoggerHistory as fetchLoggerHistory,
  LoggerHistoryRequestError,
  resampleLoggerHistorySamples,
  validateLoggerHistoryRange,
  validateLoggerHistoryInterval,
  validateLoggerHistorySampleLimit,
  type LoggerHistoryMode,
  type LoggerHistoryInterval,
} from "src/lib/logger-history";
import {
  createInitialLoggerStreamState,
  getDefaultLoggerDeviceId,
} from "src/lib/logger-stream/types";
import {
  loggerHistoryDefaultsAtom,
  loggerHistoryViewsAtom,
  type LoggerHistoryViewState,
} from "src/state/logger-history";
import {
  loggerStreamsAtom,
  loggerStreamsGenerationAtom,
} from "src/state/logger-stream";
import { loggersAtom } from "src/state/loggers";
import { dialogAtom } from "src/state/dialog";

const requestsByStore = new WeakMap<Store, Map<string, AbortController>>();

export const useLoggerHistoryActions = () => {
  const store = useStore();
  const setLoggerHistoryMode = useCallback(
    (loggerId: string, mode: LoggerHistoryMode) => {
      if (!hasLogger(store, loggerId)) return;
      updateHistoryView(store, loggerId, {
        ...getHistoryView(store, loggerId),
        mode,
      });
    },
    [store],
  );

  const setLoggerHistoryRange = useCallback(
    (loggerId: string, field: "from" | "to", value: string) => {
      if (!hasLogger(store, loggerId)) return;
      cancelLoggerHistoryRequest(store, loggerId);
      const state = getHistoryView(store, loggerId);
      updateHistoryView(store, loggerId, {
        ...state,
        [field]: value,
        status: state.loadedRange ? "loaded" : "idle",
        error: null,
      });
    },
    [store],
  );

  const setLoggerHistorySampling = useCallback(
    (
      loggerId: string,
      field: "sampleLimit" | "customSampleLimit",
      value: string,
    ) => {
      if (!hasLogger(store, loggerId)) return;
      if (
        field === "sampleLimit" &&
        !["10", "24", "100", "150", "custom", "all"].includes(value)
      )
        return;
      const previous = getHistoryView(store, loggerId);
      const state = { ...previous, [field]: value } as LoggerHistoryViewState;
      try {
        const sampleLimit = getSampleLimit(state);
        updateHistoryView(store, loggerId, {
          ...state,
          samples: state.loadedRange
            ? applyLoggerHistorySampleLimit(state.allSamples, sampleLimit)
            : state.samples,
          loadedSampleLimit: sampleLimit,
          error: null,
          status:
            state.status === "loading"
              ? "loading"
              : state.loadedRange
                ? "loaded"
                : "idle",
        });
      } catch {
        updateHistoryView(store, loggerId, {
          ...state,
          error: "invalidSampleLimit",
        });
      }
    },
    [store],
  );

  const setLoggerHistoryInterval = useCallback(
    (loggerId: string, interval: LoggerHistoryInterval) => {
      if (!hasLogger(store, loggerId)) return;
      const selectedInterval = validateLoggerHistoryInterval(interval);
      const state = getHistoryView(store, loggerId);
      if (state.interval === selectedInterval) return;
      const allSamples = state.loadedRange
        ? resampleLoggerHistorySamples(
            state.minuteSamples,
            state.loadedRange,
            selectedInterval,
          )
        : state.allSamples;
      let sampleLimit = state.loadedSampleLimit;
      let error: LoggerHistoryViewState["error"] = null;
      try {
        sampleLimit = getSampleLimit(state);
      } catch {
        error = "invalidSampleLimit";
      }
      updateHistoryView(store, loggerId, {
        ...state,
        interval: selectedInterval,
        allSamples,
        samples: state.loadedRange
          ? applyLoggerHistorySampleLimit(allSamples, sampleLimit)
          : state.samples,
        loadedInterval: state.loadedRange
          ? selectedInterval
          : state.loadedInterval,
        loadedSampleLimit: sampleLimit,
        error,
        status:
          state.status === "loading"
            ? "loading"
            : state.loadedRange
              ? "loaded"
              : "idle",
      });
    },
    [store],
  );

  const expandLoggerPressureChart = useCallback(
    (loggerId: string) => {
      if (!hasLogger(store, loggerId) || store.get(dialogAtom)) return;
      store.set(dialogAtom, { type: "loggerPressureChart", loggerId });
    },
    [store],
  );

  const loadLoggerHistory = useCallback(
    async (loggerId: string) => {
      if (!hasLogger(store, loggerId)) return;
      cancelLoggerHistoryRequest(store, loggerId);
      const request = new AbortController();
      const requests = getHistoryRequests(store);
      requests.set(loggerId, request);
      const generation = store.get(loggerStreamsGenerationAtom);
      const deviceId = getDeviceId(store, loggerId);
      if (!store.get(loggerStreamsAtom).has(loggerId))
        store.set(
          loggerStreamsAtom,
          new Map(store.get(loggerStreamsAtom)).set(
            loggerId,
            createInitialLoggerStreamState(deviceId),
          ),
        );
      updateHistoryView(store, loggerId, {
        ...getHistoryView(store, loggerId),
        status: "loading",
        error: null,
      });
      const isCurrent = () =>
        requests.get(loggerId) === request &&
        !request.signal.aborted &&
        store.get(loggerStreamsGenerationAtom) === generation &&
        hasLogger(store, loggerId) &&
        getDeviceId(store, loggerId) === deviceId;
      try {
        const state = getHistoryView(store, loggerId);
        const range = validateLoggerHistoryRange(
          fromLoggerHistoryDateTimeInput(state.from),
          fromLoggerHistoryDateTimeInput(state.to),
        );
        getSampleLimit(state);
        if (!deviceId || deviceId.length > 100)
          throw new LoggerHistoryRequestError("invalidDeviceId");
        const minuteSamples = await fetchLoggerHistory(
          deviceId,
          range,
          request.signal,
          null,
          "minute",
        );
        if (!isCurrent()) return;
        const latest = getHistoryView(store, loggerId);
        const allSamples = resampleLoggerHistorySamples(
          minuteSamples,
          range,
          latest.interval,
        );
        let sampleLimit = latest.loadedSampleLimit;
        let samplingError: LoggerHistoryViewState["error"] = null;
        try {
          sampleLimit = getSampleLimit(latest);
        } catch {
          samplingError = "invalidSampleLimit";
        }
        updateHistoryView(store, loggerId, {
          ...latest,
          status: "loaded",
          minuteSamples,
          allSamples,
          samples: applyLoggerHistorySampleLimit(allSamples, sampleLimit),
          error: samplingError,
          loadedRange: range,
          loadedDeviceId: deviceId,
          loadedSampleLimit: sampleLimit,
          loadedInterval: latest.interval,
        });
      } catch (error) {
        if (!isCurrent()) return;
        updateHistoryView(store, loggerId, {
          ...getHistoryView(store, loggerId),
          status: "error",
          error:
            error instanceof LoggerHistoryRequestError
              ? error.code
              : "requestFailed",
        });
      } finally {
        if (requests.get(loggerId) === request) requests.delete(loggerId);
      }
    },
    [store],
  );

  return {
    setLoggerHistoryMode,
    setLoggerHistoryRange,
    setLoggerHistorySampling,
    setLoggerHistoryInterval,
    expandLoggerPressureChart,
    loadLoggerHistory,
  };
};

export const clearLoggerHistoryRequests = (store: Store): void => {
  const requests = requestsByStore.get(store);
  if (!requests) return;
  for (const loggerId of requests.keys())
    cancelLoggerHistoryRequest(store, loggerId);
};

export const retainLoggerHistoryViews = (
  store: Store,
  loggerIds: ReadonlySet<string>,
): void => {
  const requests = requestsByStore.get(store);
  if (requests) {
    for (const loggerId of requests.keys()) {
      if (!loggerIds.has(loggerId)) cancelLoggerHistoryRequest(store, loggerId);
    }
  }
  const previous = store.get(loggerHistoryViewsAtom);
  const retained = new Map(
    [...previous].filter(([loggerId]) => loggerIds.has(loggerId)),
  );
  if (retained.size !== previous.size)
    store.set(loggerHistoryViewsAtom, retained);
};

export const cancelLoggerHistoryRequest = (
  store: Store,
  loggerId: string,
): void => {
  const requests = requestsByStore.get(store);
  requests?.get(loggerId)?.abort();
  requests?.delete(loggerId);
  const state = store.get(loggerHistoryViewsAtom).get(loggerId);
  if (state?.status === "loading")
    updateHistoryView(store, loggerId, {
      ...state,
      status: state.loadedRange ? "loaded" : "idle",
      error: null,
    });
};

const getHistoryRequests = (store: Store): Map<string, AbortController> => {
  let requests = requestsByStore.get(store);
  if (!requests) {
    requests = new Map();
    requestsByStore.set(store, requests);
  }
  return requests;
};

const getHistoryView = (store: Store, loggerId: string) =>
  store.get(loggerHistoryViewsAtom).get(loggerId) ??
  store.get(loggerHistoryDefaultsAtom);

const updateHistoryView = (
  store: Store,
  loggerId: string,
  state: LoggerHistoryViewState,
) =>
  store.set(
    loggerHistoryViewsAtom,
    new Map(store.get(loggerHistoryViewsAtom)).set(loggerId, state),
  );

const hasLogger = (store: Store, loggerId: string) =>
  store.get(loggersAtom).some((logger) => logger.id === loggerId);

const getSampleLimit = (state: LoggerHistoryViewState): number | null => {
  if (state.sampleLimit === "all") return null;
  const value =
    state.sampleLimit === "custom"
      ? state.customSampleLimit.trim()
      : state.sampleLimit;
  if (!/^\d+$/.test(value))
    throw new LoggerHistoryRequestError("invalidSampleLimit");
  return validateLoggerHistorySampleLimit(Number(value));
};

const getDeviceId = (store: Store, loggerId: string) =>
  (
    store.get(loggerStreamsAtom).get(loggerId)?.deviceId ??
    getDefaultLoggerDeviceId(
      store.get(loggersAtom).findIndex((logger) => logger.id === loggerId),
    )
  ).trim();
