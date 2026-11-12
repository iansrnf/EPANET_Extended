import { describe, expect, it } from "vitest";
import {
  buildLoggerPressureComparison,
  type LoggerPressureComparison,
} from ".";
import type { LoggerPressureSample } from "src/lib/logger-stream";
import {
  buildLoggerPlaybackTimeline,
  getLoggerPlaybackStep,
  getLoggerPlaybackTimestamp,
} from "./playback";

describe("logger graph playback timeline", () => {
  it("anchors report zero to the earliest valid logger sample", () => {
    const history = [
      sample("2026-11-11T15:01:00"),
      sample("invalid"),
      sample("2026-11-11T14:00:00", NaN),
      sample("2026-11-11T15:00:00", 0),
    ];
    const timeline = buildLoggerPlaybackTimeline(history, comparison());

    expect(getLoggerPlaybackTimestamp(timeline, 0)).toBe(
      Date.parse("2026-11-11T07:00:00Z"),
    );
    expect(getLoggerPlaybackTimestamp(timeline, 1)).toBe(
      Date.parse("2026-11-11T07:01:00Z"),
    );
    expect(
      getLoggerPlaybackStep(timeline, Date.parse("2026-11-11T07:00:40Z")),
    ).toBe(1);
  });

  it("retains original report indices across missing simulated values", () => {
    const history = [
      sample("2026-11-11T07:00:00Z"),
      sample("2026-11-11T07:04:00Z"),
    ];
    const result = buildLoggerPressureComparison(
      history,
      {
        values: new Float32Array([NaN, 10, NaN, 12, 13]),
        intervalsCount: 5,
        intervalSeconds: 60,
      },
      { pressureUnit: "psi" },
    );
    const timeline = buildLoggerPlaybackTimeline(history, result);

    expect(result.samples[0].timestamp).toBe("2026-11-11T07:01:00.000Z");
    expect(getLoggerPlaybackTimestamp(timeline, 0)).toBe(
      Date.parse("2026-11-11T07:00:00Z"),
    );
    expect(getLoggerPlaybackTimestamp(timeline, 2)).toBe(
      Date.parse("2026-11-11T07:02:00Z"),
    );
    expect(
      getLoggerPlaybackStep(timeline, Date.parse("2026-11-11T07:03:00Z")),
    ).toBe(3);
  });

  it.each([
    ["minute", 60, "2026-11-11T08:39:10.000Z"],
    ["hourly", 3600, "2026-11-15T10:00:10.000Z"],
  ] as const)(
    "keeps jittered %s sample coverage without adding the terminal report",
    (interval, intervalSeconds, expectedEnd) => {
      const start = Date.parse("2026-11-11T07:00:10Z");
      const history = Array.from({ length: 100 }, (_, index) =>
        sample(start + index * intervalSeconds * 1000 - (index ? 7000 : 0)),
      );
      const result = buildLoggerPressureComparison(
        history,
        {
          values: Float32Array.from({ length: 101 }, (_, index) => index),
          intervalsCount: 101,
          intervalSeconds,
        },
        { pressureUnit: "psi", samplingIntervalSeconds: intervalSeconds },
      );
      const timeline = buildLoggerPlaybackTimeline(history, result, interval);

      expect(getLoggerPlaybackTimestamp(timeline, 99)).toBe(
        Date.parse(expectedEnd),
      );
      expect(getLoggerPlaybackTimestamp(timeline, 100)).toBeNull();
      expect(getLoggerPlaybackStep(timeline, Date.parse(expectedEnd))).toBe(99);
    },
  );

  it("rejects a report exactly at the next history bucket boundary", () => {
    const history = [sample("2026-11-11T07:00:00Z")];
    const timeline = buildLoggerPlaybackTimeline(
      history,
      comparison({ simulationCount: 2 }),
      "minute",
    );

    expect(getLoggerPlaybackTimestamp(timeline, 0)).toBe(
      Date.parse("2026-11-11T07:00:00Z"),
    );
    expect(getLoggerPlaybackTimestamp(timeline, 1)).toBeNull();
  });

  it("keeps real-time coverage inclusive and rounds only supported timestamps", () => {
    const start = Date.parse("2026-11-11T07:00:00.125Z");
    const history = [sample(start), sample(start + 2000)];
    const timeline = buildLoggerPlaybackTimeline(
      history,
      comparison({ reportingIntervalSeconds: 1, simulationCount: 10 }),
    );

    expect(getLoggerPlaybackTimestamp(timeline, 2)).toBe(start + 2000);
    expect(getLoggerPlaybackTimestamp(timeline, 3)).toBeNull();
    expect(getLoggerPlaybackStep(timeline, start + 1499)).toBe(1);
    expect(getLoggerPlaybackStep(timeline, start + 1500)).toBe(2);
    expect(getLoggerPlaybackStep(timeline, start - 1)).toBeNull();
    expect(getLoggerPlaybackStep(timeline, start + 2001)).toBeNull();
    expect(getLoggerPlaybackStep(timeline, NaN)).toBeNull();
  });

  it("limits playback to the source report count", () => {
    const history = [
      sample("2026-11-11T07:00:00Z"),
      sample("2026-11-11T17:00:00Z"),
    ];
    const timeline = buildLoggerPlaybackTimeline(
      history,
      comparison({ simulationCount: 2 }),
    );

    expect(getLoggerPlaybackTimestamp(timeline, 1)).toBe(
      Date.parse("2026-11-11T07:01:00Z"),
    );
    expect(getLoggerPlaybackTimestamp(timeline, 2)).toBeNull();
    expect(
      getLoggerPlaybackStep(timeline, Date.parse("2026-11-11T07:02:00Z")),
    ).toBeNull();
  });

  it.each([
    "notConnected",
    "nodeRequired",
    "noSimulation",
    "staleSimulation",
    "loading",
    "error",
    "empty",
  ] as const)("does not expose playback for %s comparisons", (status) => {
    expect(
      buildLoggerPlaybackTimeline(
        [sample("2026-11-11T07:00:00Z")],
        comparison({ status }),
      ),
    ).toBeNull();
  });

  it("rejects absent data, invalid timing, and invalid timestep indices", () => {
    const history = [sample("2026-11-11T07:00:00Z")];
    expect(buildLoggerPlaybackTimeline(history)).toBeNull();
    expect(buildLoggerPlaybackTimeline([], comparison())).toBeNull();
    expect(
      buildLoggerPlaybackTimeline([sample("invalid")], comparison()),
    ).toBeNull();
    for (const reportingIntervalSeconds of [undefined, 0, -1, NaN, Infinity]) {
      expect(
        buildLoggerPlaybackTimeline(
          history,
          comparison({ reportingIntervalSeconds }),
        ),
      ).toBeNull();
    }
    for (const simulationCount of [0, -1, 1.5, NaN, Infinity]) {
      expect(
        buildLoggerPlaybackTimeline(history, comparison({ simulationCount })),
      ).toBeNull();
    }
    const timeline = buildLoggerPlaybackTimeline(history, comparison());
    for (const step of [null, -1, 0.5, NaN, Infinity])
      expect(getLoggerPlaybackTimestamp(timeline, step)).toBeNull();
    expect(getLoggerPlaybackTimestamp(null, 0)).toBeNull();
    expect(getLoggerPlaybackStep(null, 0)).toBeNull();
  });
});

const comparison = (
  overrides: Partial<LoggerPressureComparison> = {},
): LoggerPressureComparison => ({
  status: "ready",
  samples: [],
  loggerCount: 2,
  simulationCount: 5,
  pairedCount: 5,
  reportingIntervalSeconds: 60,
  ...overrides,
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
