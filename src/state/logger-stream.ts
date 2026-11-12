import { atom } from "jotai";
import {
  createInitialLoggerStreamState,
  getDefaultLoggerDeviceId,
  type LoggerReading,
  type LoggerStreamState,
} from "src/lib/logger-stream/types";
import { loggersAtom, selectedLoggerAtom } from "./loggers";
import { loggerHistoryViewsAtom } from "./logger-history";

export const loggerStreamsAtom = atom(new Map<string, LoggerStreamState>());
export const loggerReadingsAtom = atom(new Map<string, LoggerReading>());
export const loggerStreamsGenerationAtom = atom(0);

export const selectedLoggerStreamAtom = atom((get) => {
  const logger = get(selectedLoggerAtom);
  if (!logger) return null;
  const stored = get(loggerStreamsAtom).get(logger.id);
  return (
    stored ??
    createInitialLoggerStreamState(
      getDefaultLoggerDeviceId(
        get(loggersAtom).findIndex((candidate) => candidate.id === logger.id),
      ),
    )
  );
});

export const resetLoggerStreamsAtom = atom(null, (_get, set) => {
  set(loggerHistoryViewsAtom, new Map());
  set(loggerStreamsAtom, new Map());
  set(loggerReadingsAtom, new Map());
  set(loggerStreamsGenerationAtom, (generation) => generation + 1);
});
