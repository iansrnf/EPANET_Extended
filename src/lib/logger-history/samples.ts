import { z } from "zod";
import type { LoggerPressureSample } from "src/lib/logger-stream/types";
import {
  getZonedLoggerHistoryTimestamp,
  validateLoggerHistoryRange,
} from "./range";
import { getLoggerHistoryIntervalMilliseconds } from "./interval";
import { validateLoggerHistorySampleLimit } from "./sampling";
import {
  LoggerHistoryRequestError,
  type LoggerHistoryInterval,
  type LoggerHistoryRange,
  type LoggerHistorySampleLimit,
} from "./types";

const pressureRecordSchema = z.object({
  id: z.unknown().optional(),
  deviceId: z.string(),
  type: z.literal("pressure"),
  pressure: z.number().finite(),
  loggedAt: z.string(),
});

type HistoryInput = { sample: LoggerPressureSample; id: number };
type HistoryCandidate = HistoryInput & { milliseconds: number };

export const selectLoggerHistory = (
  payload: unknown,
  deviceId: string,
  range: LoggerHistoryRange,
  sampleLimit: LoggerHistorySampleLimit = null,
  interval: LoggerHistoryInterval = "hourly",
): readonly LoggerPressureSample[] => {
  const expectedDeviceId = deviceId.trim();
  if (!expectedDeviceId || expectedDeviceId.length > 100)
    throw new LoggerHistoryRequestError("invalidDeviceId");
  if (!Array.isArray(payload))
    throw new LoggerHistoryRequestError("invalidResponse");
  return selectCandidates(
    readHistoryRecords(payload, expectedDeviceId),
    range,
    sampleLimit,
    interval,
  );
};

export const selectHourlyLoggerHistory = (
  payload: unknown,
  deviceId: string,
  range: LoggerHistoryRange,
  sampleLimit: LoggerHistorySampleLimit = null,
): readonly LoggerPressureSample[] =>
  selectLoggerHistory(payload, deviceId, range, sampleLimit, "hourly");

export const selectMinuteLoggerHistory = (
  payload: unknown,
  deviceId: string,
  range: LoggerHistoryRange,
  sampleLimit: LoggerHistorySampleLimit = null,
): readonly LoggerPressureSample[] =>
  selectLoggerHistory(payload, deviceId, range, sampleLimit, "minute");

export const resampleLoggerHistorySamples = (
  samples: readonly LoggerPressureSample[],
  range: LoggerHistoryRange,
  interval: LoggerHistoryInterval,
): readonly LoggerPressureSample[] => {
  const selected = selectCandidates(
    readCachedSamples(samples),
    range,
    null,
    interval,
  );
  return selected.length === samples.length &&
    selected.every((sample, index) => sample === samples[index])
    ? samples
    : selected;
};

const selectCandidates = (
  inputs: Iterable<HistoryInput>,
  range: LoggerHistoryRange,
  sampleLimit: LoggerHistorySampleLimit,
  interval: LoggerHistoryInterval,
): readonly LoggerPressureSample[] => {
  const validatedRange = validateLoggerHistoryRange(range.from, range.to);
  const limit = validateLoggerHistorySampleLimit(sampleLimit);
  const intervalMilliseconds = getLoggerHistoryIntervalMilliseconds(interval);
  const firstBucket = Math.ceil(
    getZonedLoggerHistoryTimestamp(validatedRange.from)! / intervalMilliseconds,
  );
  const toMilliseconds = getZonedLoggerHistoryTimestamp(validatedRange.to)!;
  const candidates = new Map<number, HistoryCandidate>();
  const retainedBuckets: number[] = [];

  for (const { sample, id } of inputs) {
    if (!Number.isFinite(sample.pressure)) continue;
    const milliseconds = getZonedLoggerHistoryTimestamp(sample.timestamp);
    if (milliseconds === null || milliseconds > toMilliseconds) continue;
    const bucket = Math.floor(milliseconds / intervalMilliseconds);
    if (bucket < firstBucket) continue;

    const previous = candidates.get(bucket);
    if (
      previous &&
      (milliseconds > previous.milliseconds ||
        (milliseconds === previous.milliseconds && id >= previous.id))
    )
      continue;

    if (!previous && limit !== null) {
      if (candidates.size === limit) {
        if (bucket < retainedBuckets[0]) continue;
        candidates.delete(retainedBuckets[0]);
        replaceOldestBucket(retainedBuckets, bucket);
      } else {
        insertBucket(retainedBuckets, bucket);
      }
    }

    candidates.set(bucket, { milliseconds, id, sample });
  }

  return [...candidates.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, candidate]) => candidate.sample);
};

function* readHistoryRecords(
  payload: unknown[],
  expectedDeviceId: string,
): Generator<HistoryInput> {
  for (const entry of payload) {
    const parsed = pressureRecordSchema.safeParse(entry);
    if (!parsed.success || parsed.data.deviceId !== expectedDeviceId) continue;
    const record = parsed.data;
    yield {
      sample: {
        deviceId: expectedDeviceId,
        timestamp: record.loggedAt,
        pressure: record.pressure,
      },
      id:
        typeof record.id === "number" && Number.isFinite(record.id)
          ? record.id
          : Infinity,
    };
  }
}

function* readCachedSamples(
  samples: readonly LoggerPressureSample[],
): Generator<HistoryInput> {
  const expectedDeviceId = samples[0]?.deviceId;
  for (const sample of samples) {
    if (sample.deviceId === expectedDeviceId) yield { sample, id: Infinity };
  }
}

const insertBucket = (buckets: number[], bucket: number): void => {
  let index = buckets.length;
  buckets.push(bucket);
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (buckets[parent] <= bucket) break;
    buckets[index] = buckets[parent];
    index = parent;
  }
  buckets[index] = bucket;
};

const replaceOldestBucket = (buckets: number[], bucket: number): void => {
  let index = 0;
  while (index * 2 + 1 < buckets.length) {
    let child = index * 2 + 1;
    if (child + 1 < buckets.length && buckets[child + 1] < buckets[child])
      child++;
    if (buckets[child] >= bucket) break;
    buckets[index] = buckets[child];
    index = child;
  }
  buckets[index] = bucket;
};
