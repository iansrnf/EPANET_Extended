import { useCallback } from "react";
import { useStore } from "jotai";
import type { Store } from "src/state";
import {
  getDefaultLoggerDeviceId,
  loadLoggerStreamUrl,
  LoggerStreamManager,
  type LoggerStreamState,
} from "src/lib/logger-stream";
import { loggersAtom } from "src/state/loggers";
import { loggerReadingsAtom, loggerStreamsAtom } from "src/state/logger-stream";
import { cancelLoggerHistoryRequest } from "./logger-history";

const managers = new WeakMap<Store, LoggerStreamManager>();

export const getLoggerStreamManager = (store: Store): LoggerStreamManager => {
  let manager = managers.get(store);
  if (!manager) {
    manager = new LoggerStreamManager({
      loadUrl: loadLoggerStreamUrl,
      onStateChange: (loggerId, state) =>
        updateStreamState(store, loggerId, state),
    });
    managers.set(store, manager);
  }
  return manager;
};

export const useLoggerStreamActions = () => {
  const store = useStore();

  const startLoggerStream = useCallback(
    (loggerId: string) => {
      const loggers = store.get(loggersAtom);
      const index = loggers.findIndex((logger) => logger.id === loggerId);
      if (index === -1) return;
      const deviceId =
        store.get(loggerStreamsAtom).get(loggerId)?.deviceId ??
        getDefaultLoggerDeviceId(index);
      getLoggerStreamManager(store).start(loggerId, deviceId);
    },
    [store],
  );

  const stopLoggerStream = useCallback(
    (loggerId: string) => getLoggerStreamManager(store).stop(loggerId),
    [store],
  );

  const toggleLoggerStream = useCallback(
    (loggerId: string) => {
      if (store.get(loggerStreamsAtom).get(loggerId)?.isRunning) {
        stopLoggerStream(loggerId);
      } else {
        startLoggerStream(loggerId);
      }
    },
    [store, startLoggerStream, stopLoggerStream],
  );

  const setLoggerDeviceId = useCallback(
    (loggerId: string, deviceId: string) => {
      if (!store.get(loggersAtom).some((logger) => logger.id === loggerId))
        return false;
      const previousDeviceId = store
        .get(loggerStreamsAtom)
        .get(loggerId)?.deviceId;
      const updated = getLoggerStreamManager(store).setDeviceId(
        loggerId,
        deviceId,
      );
      if (updated && previousDeviceId !== deviceId.trim())
        cancelLoggerHistoryRequest(store, loggerId);
      return updated;
    },
    [store],
  );

  return {
    startLoggerStream,
    stopLoggerStream,
    toggleLoggerStream,
    setLoggerDeviceId,
  };
};

const updateStreamState = (
  store: Store,
  loggerId: string,
  state: LoggerStreamState | null,
) => {
  const previous = store.get(loggerStreamsAtom);
  if (!state) {
    if (previous.has(loggerId)) {
      const streams = new Map(previous);
      streams.delete(loggerId);
      store.set(loggerStreamsAtom, streams);
    }
  } else {
    store.set(loggerStreamsAtom, new Map(previous).set(loggerId, state));
  }
  const previousReadings = store.get(loggerReadingsAtom);
  if (!state?.reading) {
    if (previousReadings.has(loggerId)) {
      const readings = new Map(previousReadings);
      readings.delete(loggerId);
      store.set(loggerReadingsAtom, readings);
    }
  } else if (previousReadings.get(loggerId) !== state.reading) {
    store.set(
      loggerReadingsAtom,
      new Map(previousReadings).set(loggerId, state.reading),
    );
  }
};
