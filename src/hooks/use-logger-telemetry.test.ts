import { describe, expect, it } from "vitest";
import { parseLoggerTelemetryMessage } from "./use-logger-telemetry";
import {
  initialLoggerTelemetryState,
  MAX_LOGGER_HISTORY_POINTS,
  recordLoggerTelemetryReading,
} from "src/state/logger-telemetry";

describe("parseLoggerTelemetryMessage", () => {
  it("reads direct psi values", () => {
    expect(
      parseLoggerTelemetryMessage({
        deviceId: "L1",
        type: "pressure",
        psi: 42.25,
        timestamp: "2026-03-17T10:47:07",
        temp_or_status: 28,
        battery_v: 7.38,
        external_v: 5.07,
        gsm_pct: 75,
        raw: "SIMULATED_PRESSURE",
      }),
    ).toEqual({
      deviceId: "L1",
      psi: 42.25,
      timestamp: "2026-03-17T10:47:07",
      messageType: "pressure",
      status: undefined,
      tempOrStatus: "28",
      batteryVoltage: "7.38",
      externalVoltage: "5.07",
      gsmPercent: "75",
      raw: "SIMULATED_PRESSURE",
    });
  });

  it("keeps device status payloads even without pressure", () => {
    expect(
      parseLoggerTelemetryMessage({
        deviceId: "L1",
        type: "device_status",
        timestamp: "2026-03-17T10:47:07",
        temp_or_status: 28,
        battery_v: 7.36,
        external_v: 5,
        gsm_pct: 53,
        raw: "SIMULATED_PRESSURE",
      }),
    ).toEqual({
      deviceId: "L1",
      psi: undefined,
      timestamp: "2026-03-17T10:47:07",
      messageType: "device_status",
      status: undefined,
      tempOrStatus: "28",
      batteryVoltage: "7.36",
      externalVoltage: "5",
      gsmPercent: "53",
      raw: "SIMULATED_PRESSURE",
    });
  });

  it("converts supported non-psi values to psi", () => {
    const reading = parseLoggerTelemetryMessage({
      deviceId: "L2",
      value: 10,
      unit: "mwc",
      timestamp: "2026-03-17T10:47:07",
    });

    expect(reading?.deviceId).toBe("L2");
    expect(reading?.psi).toBeCloseTo(14.22, 2);
  });

  it("accepts alternate logger id fields", () => {
    expect(
      parseLoggerTelemetryMessage({
        loggerId: "L5",
        pressure_psi: 11.2,
      }),
    ).toEqual({
      deviceId: "L5",
      psi: 11.2,
      timestamp: expect.any(String),
      messageType: undefined,
      status: undefined,
      tempOrStatus: undefined,
      batteryVoltage: undefined,
      externalVoltage: undefined,
      gsmPercent: undefined,
      raw: undefined,
    });
  });

  it("ignores payloads without a device id or telemetry fields", () => {
    expect(parseLoggerTelemetryMessage({ psi: 10 })).toBeNull();
    expect(
      parseLoggerTelemetryMessage({
        deviceId: "L1",
        temp_or_status: "online",
      }),
    ).toEqual({
      deviceId: "L1",
      psi: undefined,
      timestamp: expect.any(String),
      messageType: undefined,
      status: undefined,
      tempOrStatus: "online",
      batteryVoltage: undefined,
      externalVoltage: undefined,
      gsmPercent: undefined,
      raw: undefined,
    });
    expect(
      parseLoggerTelemetryMessage({
        deviceId: "L1",
      }),
    ).toBeNull();
  });

  it("stores a rolling pressure history with a maximum of 500 points", () => {
    let state = initialLoggerTelemetryState;

    for (let index = 0; index < MAX_LOGGER_HISTORY_POINTS + 5; index += 1) {
      state = recordLoggerTelemetryReading(state, {
          deviceId: "L1",
          psi: index + 1,
          timestamp: `2026-03-17T00:${String(index).padStart(2, "0")}:00`,
      });
    }

    expect(state.readingsByDeviceId.L1?.psi).toBe(
      MAX_LOGGER_HISTORY_POINTS + 5,
    );
    expect(state.pressureSampleCountByDeviceId.L1).toBe(
      MAX_LOGGER_HISTORY_POINTS + 5,
    );
    expect(state.pressureHistoryByDeviceId.L1).toHaveLength(
      MAX_LOGGER_HISTORY_POINTS,
    );
    expect(state.pressureHistoryByDeviceId.L1?.[0]?.psi).toBe(6);
    expect(
      state.pressureHistoryByDeviceId.L1?.[
        MAX_LOGGER_HISTORY_POINTS - 1
      ]?.psi,
    ).toBe(MAX_LOGGER_HISTORY_POINTS + 5);
  });

  it("merges status-only updates into the latest device reading without adding history", () => {
    let state = recordLoggerTelemetryReading(initialLoggerTelemetryState, {
      deviceId: "L1",
      psi: 42.25,
      timestamp: "2026-03-17T10:47:07",
    });

    state = recordLoggerTelemetryReading(state, {
      deviceId: "L1",
      timestamp: "2026-03-17T10:48:07",
      tempOrStatus: "28",
      batteryVoltage: "7.36",
      externalVoltage: "5",
      gsmPercent: "53",
      raw: "SIMULATED_PRESSURE",
    });

    expect(state.readingsByDeviceId.L1).toEqual({
      deviceId: "L1",
      psi: 42.25,
      timestamp: "2026-03-17T10:48:07",
      tempOrStatus: "28",
      batteryVoltage: "7.36",
      externalVoltage: "5",
      gsmPercent: "53",
      raw: "SIMULATED_PRESSURE",
    });
    expect(state.pressureSampleCountByDeviceId.L1).toBe(1);
    expect(state.pressureHistoryByDeviceId.L1).toHaveLength(1);
  });
});
