import { describe, expect, it } from "vitest";
import { convertTo } from "@epanet-js/quantity";
import {
  formatLoggerTimestamp,
  getLoggerTimestampMilliseconds,
  type LoggerPressureSample,
} from "src/lib/logger-stream";
import { buildLoggerPressureComparison } from ".";

describe("logger simulation comparison", () => {
  it("aligns naive live UTC+8 readings and explicit UTC simulation reports to the same instant", () => {
    const history = [
      sample("2026-11-11T14:58:43"),
      sample("2026-11-11T14:59:43"),
    ];
    const result = buildLoggerPressureComparison(
      history,
      {
        values: new Float32Array([12, 13]),
        intervalsCount: 2,
        intervalSeconds: 60,
      },
      { pressureUnit: "psi" },
    );
    const sourceTimes = history.map(({ timestamp }) =>
      getLoggerTimestampMilliseconds(timestamp),
    );
    const simulationTimes = result.samples.map(({ timestamp }) =>
      getLoggerTimestampMilliseconds(timestamp),
    );

    expect(result.status).toBe("ready");
    expect(sourceTimes).toEqual([
      Date.UTC(2026, 10, 11, 6, 58, 43),
      Date.UTC(2026, 10, 11, 6, 59, 43),
    ]);
    expect(simulationTimes).toEqual(sourceTimes);
    expect(simulationTimes[1]! - simulationTimes[0]!).toBe(60000);
    expect(result.samples.map(({ timestamp }) => timestamp)).toEqual([
      "2026-11-11T06:58:43.000Z",
      "2026-11-11T06:59:43.000Z",
    ]);
    expect(formatLoggerTimestamp(history[0].timestamp, "en")).toBe(
      "Nov 11, 2026, 14:58:43 UTC+8",
    );
    expect(formatLoggerTimestamp(result.samples[0].timestamp, "en")).toBe(
      "Nov 11, 2026, 14:58:43.000 UTC+8",
    );
    expect(history[0].timestamp).toBe("2026-11-11T14:58:43");
  });

  it("aligns 100 minute samples without including the terminal report", () => {
    const start = Date.parse("2026-11-10T10:00:10Z");
    const history = Array.from({ length: 100 }, (_, index) =>
      sample(start + index * 60_000 - (index ? 7000 : 0)),
    );
    const original = structuredClone(history);
    const result = buildLoggerPressureComparison(
      history,
      {
        values: Float32Array.from({ length: 101 }, (_, index) => index),
        intervalsCount: 101,
        intervalSeconds: 60,
      },
      {
        pressureUnit: "psi",
        samplingIntervalSeconds: 60,
        durationSeconds: 6000,
      },
    );

    expect(result.status).toBe("ready");
    expect(result.loggerCount).toBe(100);
    expect(result.simulationCount).toBe(101);
    expect(result.pairedCount).toBe(100);
    expect(result.samples[0].timestamp).toBe("2026-11-10T10:00:10.000Z");
    expect(result.samples[99].timestamp).toBe("2026-11-10T11:39:10.000Z");
    expect(result.samples[99].pressure).toBe(99);
    expect(history).toEqual(original);
  });

  it("uses report time spacing without compressing missing logger minutes", () => {
    const result = buildLoggerPressureComparison(
      [sample("2026-11-10T10:00:10Z"), sample("2026-11-10T10:03:20Z")],
      {
        values: new Float32Array([10, 20, 30, 40, 50]),
        intervalsCount: 5,
        intervalSeconds: 60,
      },
      { pressureUnit: "psi", samplingIntervalSeconds: 60 },
    );

    expect(result.samples.map(({ timestamp }) => timestamp)).toEqual([
      "2026-11-10T10:00:10.000Z",
      "2026-11-10T10:01:10.000Z",
      "2026-11-10T10:02:10.000Z",
      "2026-11-10T10:03:10.000Z",
    ]);
    expect(result.loggerCount).toBe(2);
  });

  it("keeps a different report interval and shorter simulation duration", () => {
    const result = buildLoggerPressureComparison(
      [sample("2026-11-10T10:00:00Z"), sample("2026-11-10T13:00:00Z")],
      {
        values: new Float32Array([1, 2, 3]),
        intervalsCount: 3,
        intervalSeconds: 1800,
      },
      {
        pressureUnit: "psi",
        samplingIntervalSeconds: 3600,
        durationSeconds: 3600,
      },
    );

    expect(result.pairedCount).toBe(3);
    expect(result.samples[2].timestamp).toBe("2026-11-10T11:00:00.000Z");
    expect(result.reportingIntervalSeconds).toBe(1800);
    expect(result.durationSeconds).toBe(3600);
  });

  it.each(["mwc", "fwc", "bar", "kPa", "psi"] as const)(
    "converts %s simulation pressure to logger psi",
    (pressureUnit) => {
      const result = buildLoggerPressureComparison(
        [sample("2026-11-10T10:00:00Z")],
        {
          values: new Float32Array([-10]),
          intervalsCount: 1,
          intervalSeconds: 60,
        },
        { pressureUnit },
      );

      expect(result.samples[0].pressure).toBeCloseTo(
        convertTo({ value: -10, unit: pressureUnit }, "psi"),
        8,
      );
    },
  );

  it("skips invalid values without shifting later simulation reports", () => {
    const result = buildLoggerPressureComparison(
      [
        sample("invalid"),
        sample("2026-11-10T10:04:00Z"),
        sample("2026-11-10T10:00:00Z", NaN),
        sample("2026-11-10T10:01:00Z", 0),
      ],
      {
        values: new Float32Array([0, NaN, -1, Infinity, 4]),
        intervalsCount: 5,
        intervalSeconds: 60,
      },
      { pressureUnit: "psi" },
    );

    expect(result.loggerCount).toBe(2);
    expect(result.samples.map(({ pressure }) => pressure)).toEqual([0, -1]);
    expect(result.samples[1].timestamp).toBe("2026-11-10T10:03:00.000Z");
    expect(result.missingTimestamps).toEqual([
      "2026-11-10T10:02:00.000Z",
      "2026-11-10T10:04:00.000Z",
    ]);
  });

  it("does not invent results for empty or invalid source data", () => {
    const series = {
      values: new Float32Array([1]),
      intervalsCount: 1,
      intervalSeconds: 60,
    };
    expect(
      buildLoggerPressureComparison([], series, { pressureUnit: "psi" }),
    ).toMatchObject({ status: "empty", samples: [], pairedCount: 0 });
    expect(
      buildLoggerPressureComparison(
        [sample("2026-11-10T10:00:00Z")],
        { ...series, intervalSeconds: 0 },
        { pressureUnit: "psi" },
      ),
    ).toMatchObject({ status: "empty", samples: [], pairedCount: 0 });
  });

  it("anchors the first stored report without changing source report offset", () => {
    const result = buildLoggerPressureComparison(
      [sample("2026-11-10T10:00:00Z")],
      {
        values: new Float32Array([12]),
        intervalsCount: 1,
        intervalSeconds: 3600,
      },
      { pressureUnit: "psi", reportingStartSeconds: 3600 },
    );
    expect(result.samples[0].timestamp).toBe("2026-11-10T10:00:00.000Z");
    expect(result.reportingStartSeconds).toBe(3600);
  });
});

const sample = (
  timestamp: string | number,
  pressure = 1,
): LoggerPressureSample => ({
  deviceId: "L1",
  timestamp:
    typeof timestamp === "number"
      ? new Date(timestamp).toISOString()
      : timestamp,
  pressure,
});
