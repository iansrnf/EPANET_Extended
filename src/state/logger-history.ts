import { atom } from "jotai";
import {
  getDefaultLoggerHistoryRange,
  toLoggerHistoryDateTimeInput,
  type LoggerHistoryErrorCode,
  type LoggerHistoryMode,
  type LoggerHistoryInterval,
  type LoggerHistoryRange,
} from "src/lib/logger-history";
import type { LoggerPressureSample } from "src/lib/logger-stream/types";
import { selectedLoggerAtom } from "./loggers";

export type LoggerHistoryViewState = {
  mode: LoggerHistoryMode;
  interval: LoggerHistoryInterval;
  sampleLimit: "10" | "24" | "100" | "150" | "custom" | "all";
  customSampleLimit: string;
  from: string;
  to: string;
  status: "idle" | "loading" | "loaded" | "error";
  samples: readonly LoggerPressureSample[];
  allSamples: readonly LoggerPressureSample[];
  minuteSamples: readonly LoggerPressureSample[];
  error: LoggerHistoryErrorCode | null;
  loadedRange: LoggerHistoryRange | null;
  loadedDeviceId: string | null;
  loadedSampleLimit: number | null;
  loadedInterval: LoggerHistoryInterval | null;
};

export const createInitialLoggerHistoryViewState =
  (): LoggerHistoryViewState => {
    const range = getDefaultLoggerHistoryRange();
    return {
      mode: "realtime",
      interval: "hourly",
      sampleLimit: "all",
      customSampleLimit: "250",
      from: toLoggerHistoryDateTimeInput(range.from),
      to: toLoggerHistoryDateTimeInput(range.to),
      status: "idle",
      samples: [],
      allSamples: [],
      minuteSamples: [],
      error: null,
      loadedRange: null,
      loadedDeviceId: null,
      loadedSampleLimit: null,
      loadedInterval: null,
    };
  };

export const loggerHistoryDefaultsAtom = atom(() =>
  createInitialLoggerHistoryViewState(),
);

export const loggerHistoryViewsAtom = atom(
  new Map<string, LoggerHistoryViewState>(),
);

export const selectedLoggerHistoryViewAtom = atom((get) => {
  const logger = get(selectedLoggerAtom);
  return logger
    ? (get(loggerHistoryViewsAtom).get(logger.id) ??
        get(loggerHistoryDefaultsAtom))
    : null;
});
