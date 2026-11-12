import { z } from "zod";
import type { LoggerPacket, LoggerReading } from "./types";

const optionalNumber = z.number().finite().nullable().optional();
const packetSchema = z
  .object({
    deviceId: z.string().trim().min(1),
    type: z.string().min(1),
    timestamp: z.string().min(1),
    pressure: optionalNumber,
    status: z.string().optional(),
    temp_or_status: z
      .union([z.number().finite(), z.string()])
      .nullable()
      .optional(),
    battery_v: optionalNumber,
    external_v: optionalNumber,
    gsm_pct: optionalNumber,
    raw: z.string().nullable().optional(),
  })
  .refine(
    (packet) =>
      typeof packet.pressure === "number" ||
      packet.status !== undefined ||
      packet.temp_or_status !== undefined ||
      packet.battery_v !== undefined ||
      packet.external_v !== undefined ||
      packet.gsm_pct !== undefined,
  );

export const parseLoggerPacket = (
  data: unknown,
  deviceId: string,
): LoggerPacket | null => {
  let payload: unknown = data;
  if (typeof data === "string") {
    try {
      payload = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    !("deviceId" in payload)
  ) {
    payload = payload.data;
  }
  const result = packetSchema.safeParse(payload);
  return result.success && result.data.deviceId === deviceId
    ? result.data
    : null;
};

export const mergeLoggerReading = (
  previous: LoggerReading | null,
  packet: LoggerPacket,
): LoggerReading => {
  const reading: LoggerReading = {
    ...(previous?.deviceId === packet.deviceId ? previous : {}),
    deviceId: packet.deviceId,
    type: packet.type,
    timestamp: packet.timestamp,
  };
  if (typeof packet.pressure === "number") {
    reading.pressure = packet.pressure;
    reading.pressureTimestamp = packet.timestamp;
  }
  if (packet.status !== undefined) reading.status = packet.status;
  if (packet.temp_or_status !== undefined)
    reading.temp_or_status = packet.temp_or_status;
  if (packet.battery_v !== undefined) reading.battery_v = packet.battery_v;
  if (packet.external_v !== undefined) reading.external_v = packet.external_v;
  if (packet.gsm_pct !== undefined) reading.gsm_pct = packet.gsm_pct;
  if (packet.raw !== undefined) reading.raw = packet.raw;
  return previous && readingsEqual(previous, reading) ? previous : reading;
};

const readingsEqual = (left: LoggerReading, right: LoggerReading): boolean => {
  const keys = Object.keys(left) as Array<keyof LoggerReading>;
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.is(left[key], right[key]))
  );
};
