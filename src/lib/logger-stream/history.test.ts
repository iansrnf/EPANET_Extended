import {
  MAX_LOGGER_PRESSURE_SAMPLES,
  getLoggerTimestampMilliseconds,
  mergeLoggerPressureHistory,
} from "./history";
import type { LoggerPacket, LoggerPressureSample } from "./types";

const createPacket = (
  seconds: number,
  overrides: Partial<LoggerPacket> = {},
): LoggerPacket => ({
  deviceId: "L1",
  type: "pressure",
  timestamp: new Date(
    Date.UTC(2026, 10, 10, 10, 28, 22) + seconds * 1000,
  ).toISOString(),
  pressure: seconds - 75,
  ...overrides,
});

describe("logger pressure history", () => {
  it("interprets device clock timestamps as UTC+8 and respects explicit zones", () => {
    const expected = Date.UTC(2026, 10, 10, 10, 28, 22, 123);
    expect(getLoggerTimestampMilliseconds("2026-11-10T10:28:22.123")).toBe(
      Date.UTC(2026, 10, 10, 2, 28, 22, 123),
    );
    expect(getLoggerTimestampMilliseconds("2026-11-10T10:28:22.123Z")).toBe(
      expected,
    );
    expect(
      getLoggerTimestampMilliseconds("2026-11-10T18:28:22.123+08:00"),
    ).toBe(expected);
    expect(
      getLoggerTimestampMilliseconds("2026-11-10T02:28:22.123-08:00"),
    ).toBe(expected);
    expect(getLoggerTimestampMilliseconds("2024-02-29T10:28:22")).toBe(
      Date.UTC(2024, 1, 29, 2, 28, 22),
    );
    for (const timestamp of [
      "invalid-time",
      "1",
      "2026-02-30T10:28:22",
      "2026-13-01T10:28:22",
      "2026-11-10T24:28:22",
      "2026-11-10T10:60:22",
      "2026-11-10T10:28:60",
      "2026-11-10T10:28:22+24:00",
      "2026-11-10T10:28:22+08:60",
    ]) {
      expect(getLoggerTimestampMilliseconds(timestamp)).toBeNull();
    }
  });

  it("maps the observed live device clock to its real instant across dates", () => {
    expect(getLoggerTimestampMilliseconds("2026-11-11T14:58:43")).toBe(
      Date.parse("2026-11-11T06:58:43Z"),
    );
    expect(getLoggerTimestampMilliseconds("2027-01-01T00:00:01.125")).toBe(
      Date.parse("2026-12-31T16:00:01.125Z"),
    );
  });

  it("keeps only the latest 150 samples without mutating earlier history", () => {
    let history: readonly LoggerPressureSample[] = [];
    for (let index = 0; index < MAX_LOGGER_PRESSURE_SAMPLES; index++) {
      history = mergeLoggerPressureHistory(history, createPacket(index));
    }
    const previous = history;
    history = mergeLoggerPressureHistory(history, createPacket(150));

    expect(history).toHaveLength(MAX_LOGGER_PRESSURE_SAMPLES);
    expect(history[0].timestamp).toBe(createPacket(1).timestamp);
    expect(history.at(-1)?.timestamp).toBe(createPacket(150).timestamp);
    expect(previous[0].timestamp).toBe(createPacket(0).timestamp);
    expect(previous).toHaveLength(MAX_LOGGER_PRESSURE_SAMPLES);
    expect(mergeLoggerPressureHistory(history, createPacket(0))).toBe(history);
  });

  it("orders delayed samples by time and replaces duplicate timestamps", () => {
    let history: readonly LoggerPressureSample[] = [];
    for (const seconds of [2, 0, 1]) {
      history = mergeLoggerPressureHistory(history, createPacket(seconds));
    }
    expect(history.map((sample) => sample.timestamp)).toEqual(
      [0, 1, 2].map((seconds) => createPacket(seconds).timestamp),
    );

    const correction = createPacket(1, { pressure: 8 });
    const corrected = mergeLoggerPressureHistory(history, correction);
    expect(corrected).toHaveLength(3);
    expect(corrected[1].pressure).toBe(8);
    expect(history[1].pressure).toBe(-74);
    expect(mergeLoggerPressureHistory(corrected, correction)).toBe(corrected);
    const equivalentTime = createPacket(0, {
      timestamp: "2026-11-10T18:28:22+08:00",
      pressure: 4,
    });
    expect(mergeLoggerPressureHistory(corrected, equivalentTime)).toEqual([
      {
        deviceId: "L1",
        timestamp: equivalentTime.timestamp,
        pressure: 4,
      },
      corrected[1],
      corrected[2],
    ]);
  });

  it("orders mixed clock formats and deduplicates equivalent device instants", () => {
    const utcPacket = createPacket(0);
    const naivePacket = createPacket(1, {
      timestamp: "2026-11-10T18:28:23",
    });
    const offsetPacket = createPacket(2, {
      timestamp: "2026-11-10T18:28:24+08:00",
    });
    let history = mergeLoggerPressureHistory([], offsetPacket);
    history = mergeLoggerPressureHistory(history, naivePacket);
    history = mergeLoggerPressureHistory(history, utcPacket);
    expect(history.map(({ timestamp }) => timestamp)).toEqual([
      utcPacket.timestamp,
      naivePacket.timestamp,
      offsetPacket.timestamp,
    ]);

    const equivalentPacket = {
      ...naivePacket,
      timestamp: "2026-11-10T10:28:23Z",
    };
    expect(mergeLoggerPressureHistory(history, equivalentPacket)).toBe(history);
    const correction = { ...equivalentPacket, pressure: 7 };
    const corrected = mergeLoggerPressureHistory(history, correction);
    expect(corrected).toHaveLength(3);
    expect(corrected[1]).toEqual({
      deviceId: "L1",
      timestamp: correction.timestamp,
      pressure: 7,
    });
    expect(history[1].timestamp).toBe(naivePacket.timestamp);
    expect(corrected[0].timestamp).toBe(utcPacket.timestamp);
    expect(corrected[2].timestamp).toBe(offsetPacket.timestamp);
  });

  it("keeps negative and zero pressures without fabricating telemetry samples", () => {
    const negative = mergeLoggerPressureHistory([], createPacket(0));
    const history = mergeLoggerPressureHistory(
      negative,
      createPacket(1, { pressure: 0 }),
    );
    expect(history.map((sample) => sample.pressure)).toEqual([-75, 0]);
    for (const pressure of [undefined, null, Number.NaN, Infinity]) {
      expect(
        mergeLoggerPressureHistory(
          history,
          createPacket(2, { pressure, status: "online" }),
        ),
      ).toBe(history);
    }
    expect(
      mergeLoggerPressureHistory(
        history,
        createPacket(2, { timestamp: "invalid-time" }),
      ),
    ).toBe(history);
  });

  it("clears the previous device history upon receiving another device", () => {
    const firstDevice = mergeLoggerPressureHistory([], createPacket(0));
    const telemetry = createPacket(1, {
      deviceId: "L2",
      type: "device_status",
      pressure: undefined,
      status: "online",
    });
    expect(mergeLoggerPressureHistory(firstDevice, telemetry)).toEqual([]);
    expect(
      mergeLoggerPressureHistory(
        firstDevice,
        createPacket(2, { deviceId: "L2", pressure: 0 }),
      ),
    ).toEqual([
      {
        deviceId: "L2",
        timestamp: createPacket(2).timestamp,
        pressure: 0,
      },
    ]);
    expect(firstDevice).toHaveLength(1);
  });
});
