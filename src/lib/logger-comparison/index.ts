import { convertTo, type PressureUnit } from "@epanet-js/quantity";
import {
  getLoggerTimestampMilliseconds,
  type LoggerPressureSample,
} from "src/lib/logger-stream";

export type LoggerPressureComparison = {
  status:
    | "ready"
    | "notConnected"
    | "nodeRequired"
    | "noSimulation"
    | "staleSimulation"
    | "loading"
    | "error"
    | "empty";
  samples: readonly LoggerPressureSample[];
  missingTimestamps?: readonly string[];
  nodeLabel?: string;
  loggerCount: number;
  simulationCount: number;
  pairedCount: number;
  reportingIntervalSeconds?: number;
  reportingStartSeconds?: number;
  durationSeconds?: number;
};

type PressureTimeSeries = {
  values: ArrayLike<number>;
  intervalsCount: number;
  intervalSeconds: number;
};

type ComparisonOptions = {
  pressureUnit: PressureUnit;
  nodeLabel?: string;
  reportingStartSeconds?: number;
  durationSeconds?: number;
  samplingIntervalSeconds?: number;
};

export const buildLoggerPressureComparison = (
  history: readonly LoggerPressureSample[],
  series: PressureTimeSeries,
  options: ComparisonOptions,
): LoggerPressureComparison => {
  const samples: LoggerPressureSample[] = [];
  const missingTimestamps: string[] = [];
  const simulationCount = Math.max(
    0,
    Math.min(series.values.length, Math.floor(series.intervalsCount)),
  );
  const result: LoggerPressureComparison = {
    status: "empty",
    samples,
    missingTimestamps,
    nodeLabel: options.nodeLabel,
    loggerCount: 0,
    simulationCount: Number.isFinite(simulationCount) ? simulationCount : 0,
    pairedCount: 0,
    reportingIntervalSeconds: series.intervalSeconds,
    reportingStartSeconds: options.reportingStartSeconds ?? 0,
    durationSeconds: options.durationSeconds,
  };
  if (
    !Number.isFinite(series.intervalSeconds) ||
    series.intervalSeconds <= 0 ||
    !result.simulationCount
  )
    return result;

  let firstTimestamp = Infinity;
  let lastTimestamp = -Infinity;
  for (const sample of history) {
    const timestamp = getLoggerTimestampMilliseconds(sample.timestamp);
    if (timestamp === null || !Number.isFinite(sample.pressure)) continue;
    result.loggerCount += 1;
    firstTimestamp = Math.min(firstTimestamp, timestamp);
    lastTimestamp = Math.max(lastTimestamp, timestamp);
  }
  if (!result.loggerCount) return result;

  const samplingMilliseconds = (options.samplingIntervalSeconds ?? 0) * 1000;
  const hasSamplingInterval =
    Number.isFinite(samplingMilliseconds) && samplingMilliseconds > 0;
  const coverageEnd = hasSamplingInterval
    ? (Math.floor(lastTimestamp / samplingMilliseconds) + 1) *
      samplingMilliseconds
    : lastTimestamp;
  const pressureFactor = convertTo(
    { value: 1, unit: options.pressureUnit },
    "psi",
  );
  const reportMilliseconds = series.intervalSeconds * 1000;
  for (let index = 0; index < result.simulationCount; index++) {
    const timestamp = firstTimestamp + index * reportMilliseconds;
    if (
      hasSamplingInterval ? timestamp >= coverageEnd : timestamp > coverageEnd
    )
      break;
    const pressure = series.values[index] * pressureFactor;
    if (!Number.isFinite(pressure)) {
      missingTimestamps.push(new Date(timestamp).toISOString());
      continue;
    }
    samples.push({
      deviceId: "simulation",
      timestamp: new Date(timestamp).toISOString(),
      pressure,
    });
  }
  return {
    ...result,
    status: samples.length ? "ready" : "empty",
    pairedCount: samples.length,
  };
};
