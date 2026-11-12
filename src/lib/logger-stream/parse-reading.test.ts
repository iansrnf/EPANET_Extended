import { mergeLoggerReading, parseLoggerPacket } from "./parse-reading";
import { buildLoggerStreamUrl, LoggerStreamConfigurationError } from "./url";
import { formatLoggerPressure } from "./types";

const packet = {
  deviceId: "L1",
  type: "pressure",
  timestamp: "2026-11-10T10:28:22",
  pressure: -0.250298,
  status: "online",
  temp_or_status: 31,
  battery_v: 7.27,
  external_v: 5.14,
  gsm_pct: 48,
  raw: "SIMULATED_PRESSURE",
};

describe("logger readings", () => {
  it("preserves negative and zero pressure without a unit conversion", () => {
    expect(parseLoggerPacket(JSON.stringify(packet), "L1")).toEqual(packet);
    expect(parseLoggerPacket({ ...packet, pressure: 0 }, "L1")?.pressure).toBe(
      0,
    );
    expect(formatLoggerPressure(packet.pressure, "en")).toBe("-0.250298");
    expect(formatLoggerPressure(packet.pressure, "de")).toBe("-0,250298");
    expect(formatLoggerPressure(0, "en")).toBe("0");
  });

  it("accepts snapshot envelopes and retains pressure across telemetry-only packets", () => {
    const initial = mergeLoggerReading(null, packet);
    const status = {
      deviceId: "L1",
      type: "device_status",
      timestamp: "2026-11-10T10:28:23",
      status: "offline",
      battery_v: 7.2,
      temp_or_status: "OK",
    };
    const parsed = parseLoggerPacket({ type: "snapshot", data: status }, "L1");

    expect(parsed).toEqual(status);
    const updated = mergeLoggerReading(initial, parsed!);
    expect(updated).toMatchObject({
      ...status,
      pressure: packet.pressure,
      pressureTimestamp: packet.timestamp,
      gsm_pct: packet.gsm_pct,
    });
    expect(initial).toMatchObject(packet);
    expect(mergeLoggerReading(updated, status)).toBe(updated);
  });

  it("does not carry a previous device pressure into a different device snapshot", () => {
    const previous = mergeLoggerReading(null, packet);
    const updated = mergeLoggerReading(previous, {
      deviceId: "L2",
      type: "device_status",
      timestamp: "2026-11-10T10:28:24",
      status: "online",
    });

    expect(updated.deviceId).toBe("L2");
    expect(updated.pressure).toBeUndefined();
    expect(updated.pressureTimestamp).toBeUndefined();
  });

  it("ignores malformed, unrelated and non-finite packets", () => {
    for (const value of [
      "not-json",
      { type: "ping" },
      { ...packet, deviceId: "L2" },
      { ...packet, pressure: NaN },
      { ...packet, pressure: Infinity },
      { ...packet, pressure: "-0.25" },
      { ...packet, timestamp: "" },
    ]) {
      expect(parseLoggerPacket(value, "L1")).toBeNull();
    }
  });

  it("builds an encoded device subscription without losing existing URL parameters", () => {
    const url = new URL(
      buildLoggerStreamUrl(
        "wss://example.com/stream?mode=live&deviceId=old",
        " L 1 ",
      ),
    );
    expect(url.searchParams.get("deviceId")).toBe("L 1");
    expect(url.searchParams.get("mode")).toBe("live");
    expect(() => buildLoggerStreamUrl("", "L1")).toThrow(
      LoggerStreamConfigurationError,
    );
    expect(() => buildLoggerStreamUrl("https://example.com", "L1")).toThrow(
      "invalidUrl",
    );
    expect(() =>
      buildLoggerStreamUrl("wss://example.com/stream#fragment", "L1"),
    ).toThrow("invalidUrl");
    expect(() => buildLoggerStreamUrl("wss://example.com", " ")).toThrow(
      "invalidDeviceId",
    );
  });
});
