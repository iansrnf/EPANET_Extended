import type { LoggerHistoryInterval } from "src/lib/logger-history";
import {
  getLoggerTimestampMilliseconds,
  type LoggerPressureSample,
} from "src/lib/logger-stream";
import type { LoggerPressureComparison } from ".";

export type LoggerPlaybackTimeline = {
  startTimestamp: number;
  endTimestamp: number;
  intervalMilliseconds: number;
  timestepCount: number;
};

export const buildLoggerPlaybackTimeline = (
  history: readonly LoggerPressureSample[],
  comparison?: LoggerPressureComparison,
  interval?: LoggerHistoryInterval | null,
): LoggerPlaybackTimeline | null => {
  if (
    comparison?.status !== "ready" ||
    !Number.isSafeInteger(comparison.simulationCount) ||
    comparison.simulationCount < 1
  )
    return null;

  const intervalMilliseconds =
    (comparison.reportingIntervalSeconds ?? 0) * 1000;
  if (!Number.isFinite(intervalMilliseconds) || intervalMilliseconds <= 0)
    return null;

  let startTimestamp = Infinity;
  let lastTimestamp = -Infinity;
  for (const sample of history) {
    const timestamp = getLoggerTimestampMilliseconds(sample.timestamp);
    if (timestamp === null || !Number.isFinite(sample.pressure)) continue;
    startTimestamp = Math.min(startTimestamp, timestamp);
    lastTimestamp = Math.max(lastTimestamp, timestamp);
  }
  if (!Number.isFinite(startTimestamp)) return null;

  const samplingMilliseconds =
    interval === "hourly" ? 3600000 : interval === "minute" ? 60000 : null;
  const coverageEnd = samplingMilliseconds
    ? (Math.floor(lastTimestamp / samplingMilliseconds) + 1) *
      samplingMilliseconds
    : lastTimestamp;
  const coveredSteps = (coverageEnd - startTimestamp) / intervalMilliseconds;
  const lastCoveredStep = samplingMilliseconds
    ? Math.ceil(coveredSteps) - 1
    : Math.floor(coveredSteps);
  const lastStep = Math.min(comparison.simulationCount - 1, lastCoveredStep);
  const endTimestamp = startTimestamp + lastStep * intervalMilliseconds;
  if (lastStep < 0 || !Number.isFinite(endTimestamp)) return null;

  return {
    startTimestamp,
    endTimestamp,
    intervalMilliseconds,
    timestepCount: comparison.simulationCount,
  };
};

export const getLoggerPlaybackTimestamp = (
  timeline: LoggerPlaybackTimeline | null,
  step: number | null,
): number | null => {
  if (
    !timeline ||
    step === null ||
    !Number.isSafeInteger(step) ||
    step < 0 ||
    step >= timeline.timestepCount
  )
    return null;

  const timestamp =
    timeline.startTimestamp + step * timeline.intervalMilliseconds;
  return timestamp <= timeline.endTimestamp ? timestamp : null;
};

export const getLoggerPlaybackStep = (
  timeline: LoggerPlaybackTimeline | null,
  timestamp: number,
): number | null => {
  if (
    !timeline ||
    !Number.isFinite(timestamp) ||
    timestamp < timeline.startTimestamp ||
    timestamp > timeline.endTimestamp
  )
    return null;

  const step = Math.round(
    (timestamp - timeline.startTimestamp) / timeline.intervalMilliseconds,
  );
  return getLoggerPlaybackTimestamp(timeline, step) === null ? null : step;
};
