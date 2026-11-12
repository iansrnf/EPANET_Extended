import { useEffect } from "react";
import { useStore } from "jotai";
import { getLoggerStreamManager } from "src/commands/logger-stream";
import {
  clearLoggerHistoryRequests,
  retainLoggerHistoryViews,
} from "src/commands/logger-history";
import { loggersAtom } from "src/state/loggers";
import { loggerStreamsGenerationAtom } from "src/state/logger-stream";

export const useLoggerStreamLifecycle = () => {
  const store = useStore();
  useEffect(() => {
    const manager = getLoggerStreamManager(store);
    const reconcile = () => {
      const loggerIds = new Set(
        store.get(loggersAtom).map((logger) => logger.id),
      );
      manager.retainLoggerIds(loggerIds);
      retainLoggerHistoryViews(store, loggerIds);
    };
    reconcile();
    const unsubscribeLoggers = store.sub(loggersAtom, reconcile);
    const unsubscribeReset = store.sub(loggerStreamsGenerationAtom, () => {
      manager.clear();
      clearLoggerHistoryRequests(store);
    });
    return () => {
      unsubscribeLoggers();
      unsubscribeReset();
      clearLoggerHistoryRequests(store);
      manager.clear();
    };
  }, [store]);
};
