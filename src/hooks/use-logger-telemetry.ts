"use client";

import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { convertTo, type Unit } from "src/quantity";
import {
  initialLoggerTelemetryState,
  loggerTelemetryAtom,
  type LoggerTelemetryReading,
  recordLoggerTelemetryReading,
} from "src/state/logger-telemetry";

const DEFAULT_LOGGER_STREAM_URL = process.env.DEFAULT_LOGGER_STREAM_URL || "ws://172.20.110.84:3004/stream";
const RECONNECT_DELAY_MS = 5000;

type LoggerPayload = {
  deviceId?: unknown;
  device_id?: unknown;
  loggerId?: unknown;
  logger_id?: unknown;
  logger?: unknown;
  timestamp?: unknown;
  type?: unknown;
  status?: unknown;
  battery_v?: unknown;
  external_v?: unknown;
  gsm_pct?: unknown;
  raw?: unknown;
  psi?: unknown;
  pressure_psi?: unknown;
  pressurePsi?: unknown;
  currentPsi?: unknown;
  current_psi?: unknown;
  pressure?: unknown;
  value?: unknown;
  currentValue?: unknown;
  current_value?: unknown;
  temp_or_status?: unknown;
  unit?: unknown;
  pressureUnit?: unknown;
  pressure_unit?: unknown;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const coerceNumber = (value: unknown): number | null => {
  if (isFiniteNumber(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeUnit = (unit: unknown): Unit => {
  if (typeof unit !== "string") return "psi";

  const normalized = unit.trim().toLowerCase();
  if (normalized === "psi") return "psi";
  if (normalized === "mwc") return "mwc";
  if (normalized === "kpa") return "kPa";
  if (normalized === "bar") return "bar";
  if (normalized === "fwc") return "fwc";

  return "psi";
};

const extractPsi = (payload: LoggerPayload): number | null => {
  const directPsiFields = [
    payload.psi,
    payload.pressure_psi,
    payload.pressurePsi,
    payload.currentPsi,
    payload.current_psi,
  ];

  for (const candidate of directPsiFields) {
    const value = coerceNumber(candidate);
    if (value !== null) return value;
  }

  const measuredValueCandidates = [
    payload.pressure,
    payload.value,
    payload.currentValue,
    payload.current_value,
  ];

  const measuredValue = measuredValueCandidates
    .map(coerceNumber)
    .find((value): value is number => value !== null);

  if (measuredValue === undefined) return null;

  const sourceUnit = normalizeUnit(
    payload.pressureUnit ?? payload.pressure_unit ?? payload.unit,
  );

  return convertTo({ value: measuredValue, unit: sourceUnit }, "psi");
};

export const parseLoggerTelemetryMessage = (
  payload: unknown,
): LoggerTelemetryReading | null => {
  if (!payload || typeof payload !== "object") return null;

  const maybePayload = payload as LoggerPayload;
  const messageType =
    typeof maybePayload.type === "string" ? maybePayload.type.trim() : "";

  const rawDeviceIdCandidate =
    maybePayload.deviceId ??
    maybePayload.device_id ??
    maybePayload.loggerId ??
    maybePayload.logger_id ??
    maybePayload.logger;

  const deviceId =
    typeof rawDeviceIdCandidate === "string"
      ? rawDeviceIdCandidate.trim()
      : typeof rawDeviceIdCandidate === "number"
        ? String(rawDeviceIdCandidate)
        : "";

  if (!deviceId) return null;

  const psi = extractPsi(maybePayload);
  const hasStatusTelemetry =
    typeof maybePayload.status === "string" ||
    maybePayload.temp_or_status !== undefined ||
    maybePayload.battery_v !== undefined ||
    maybePayload.external_v !== undefined ||
    maybePayload.gsm_pct !== undefined ||
    typeof maybePayload.raw === "string";

  if (psi === null && !hasStatusTelemetry) return null;

  return {
    deviceId,
    psi: psi ?? undefined,
    timestamp:
      typeof maybePayload.timestamp === "string" &&
      maybePayload.timestamp.trim() !== ""
        ? maybePayload.timestamp
        : new Date().toISOString(),
    messageType: messageType || undefined,
    status:
      typeof maybePayload.status === "string" ? maybePayload.status : undefined,
    tempOrStatus:
      maybePayload.temp_or_status === undefined ||
      maybePayload.temp_or_status === null
        ? undefined
        : String(maybePayload.temp_or_status),
    batteryVoltage:
      maybePayload.battery_v === undefined || maybePayload.battery_v === null
        ? undefined
        : String(maybePayload.battery_v),
    externalVoltage:
      maybePayload.external_v === undefined || maybePayload.external_v === null
        ? undefined
        : String(maybePayload.external_v),
    gsmPercent:
      maybePayload.gsm_pct === undefined || maybePayload.gsm_pct === null
        ? undefined
        : String(maybePayload.gsm_pct),
    raw:
      typeof maybePayload.raw === "string" ? maybePayload.raw : undefined,
  };
};

export const useLoggerTelemetry = () => {
  const setLoggerTelemetry = useSetAtom(loggerTelemetryAtom);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url =
      process.env.NEXT_PUBLIC_LOGGER_STREAM_URL || DEFAULT_LOGGER_STREAM_URL;

    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let shouldReconnect = true;

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (!shouldReconnect || reconnectTimer !== null) return;

      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, RECONNECT_DELAY_MS);
    };

    const connect = () => {
      clearReconnectTimer();

      setLoggerTelemetry((prev) => ({
        ...prev,
        connectionState: "connecting",
        lastError: null,
      }));

      socket = new WebSocket(url);

      socket.addEventListener("open", () => {
        setLoggerTelemetry((prev) => ({
          ...prev,
          connectionState: "open",
          lastError: null,
        }));
      });

      socket.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(event.data) as unknown;
          const reading = parseLoggerTelemetryMessage(payload);
          if (!reading) return;

          setLoggerTelemetry((prev) => recordLoggerTelemetryReading(prev, reading));
        } catch (error) {
          setLoggerTelemetry((prev) => ({
            ...prev,
            lastError:
              error instanceof Error
                ? error.message
                : "Failed to parse logger telemetry message",
          }));
        }
      });

      socket.addEventListener("error", () => {
        setLoggerTelemetry((prev) => ({
          ...prev,
          connectionState: "error",
          lastError: "Logger websocket connection error",
        }));
      });

      socket.addEventListener("close", () => {
        setLoggerTelemetry((prev) => ({
          ...prev,
          connectionState: shouldReconnect ? "closed" : "idle",
        }));
        scheduleReconnect();
      });
    };

    setLoggerTelemetry(initialLoggerTelemetryState);
    connect();

    return () => {
      shouldReconnect = false;
      clearReconnectTimer();
      socket?.close();
    };
  }, [setLoggerTelemetry]);
};
