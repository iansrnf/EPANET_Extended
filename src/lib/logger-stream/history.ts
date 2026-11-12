import type { LoggerPacket, LoggerPressureSample } from "./types";
import { LOGGER_TIME_ZONE_OFFSET_MILLISECONDS } from "./time-zone";

export const MAX_LOGGER_PRESSURE_SAMPLES = 150;

export const getLoggerTimestampMilliseconds = (
  timestamp: string,
): number | null => {
  const match = timestamp.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})?$/,
  );
  if (!match) return null;

  const [, year, month, day, hour, minute, second, fraction = "", zone] = match;
  const milliseconds = Number(fraction.slice(0, 3).padEnd(3, "0"));
  const date = new Date(0);
  date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  date.setUTCHours(Number(hour), Number(minute), Number(second), milliseconds);
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day) ||
    date.getUTCHours() !== Number(hour) ||
    date.getUTCMinutes() !== Number(minute) ||
    date.getUTCSeconds() !== Number(second)
  )
    return null;

  if (!zone) return date.getTime() - LOGGER_TIME_ZONE_OFFSET_MILLISECONDS;
  if (zone === "Z") return date.getTime();
  const offsetHours = Number(zone.slice(1, 3));
  const offsetMinutes = Number(zone.slice(4, 6));
  if (offsetHours > 23 || offsetMinutes > 59) return null;
  const offset = (offsetHours * 60 + offsetMinutes) * 60000;
  return date.getTime() - (zone.startsWith("+") ? offset : -offset);
};

export const mergeLoggerPressureHistory = (
  previous: readonly LoggerPressureSample[],
  packet: LoggerPacket,
): readonly LoggerPressureSample[] => {
  const history =
    previous.length > 0 && previous[0].deviceId !== packet.deviceId
      ? []
      : previous;
  if (typeof packet.pressure !== "number" || !Number.isFinite(packet.pressure))
    return history;

  const timestamp = getLoggerTimestampMilliseconds(packet.timestamp);
  if (timestamp === null) return history;

  const index = history.findIndex(
    (sample) => getLoggerTimestampMilliseconds(sample.timestamp)! >= timestamp,
  );
  if (
    index >= 0 &&
    getLoggerTimestampMilliseconds(history[index].timestamp) === timestamp &&
    Object.is(history[index].pressure, packet.pressure)
  )
    return history;

  const sample: LoggerPressureSample = {
    deviceId: packet.deviceId,
    timestamp: packet.timestamp,
    pressure: packet.pressure,
  };
  const samples = [...history];
  if (index < 0) samples.push(sample);
  else if (
    getLoggerTimestampMilliseconds(history[index].timestamp) === timestamp
  )
    samples[index] = sample;
  else samples.splice(index, 0, sample);

  const bounded = samples.slice(-MAX_LOGGER_PRESSURE_SAMPLES);
  return bounded.length === history.length &&
    bounded.every((point, pointIndex) => point === history[pointIndex])
    ? history
    : bounded;
};
