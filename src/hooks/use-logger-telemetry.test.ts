import { describe, expect, it } from "vitest";
import { parseLoggerTelemetryMessage } from "./use-logger-telemetry";

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

  it("ignores device_status payloads", () => {
    expect(
      parseLoggerTelemetryMessage({
        deviceId: "L1",
        type: "device_status",
        timestamp: "2026-03-17T10:47:07",
        temp_or_status: 30,
      }),
    ).toBeNull();
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

  it("ignores payloads without a device id or numeric reading", () => {
    expect(parseLoggerTelemetryMessage({ psi: 10 })).toBeNull();
    expect(
      parseLoggerTelemetryMessage({
        deviceId: "L1",
        temp_or_status: "online",
      }),
    ).toBeNull();
  });
});
