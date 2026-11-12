import {
  getLoggerHistoryIntervalMilliseconds,
  loadLoggerHistory,
  parseLoggerHistoryInterval,
  resampleLoggerHistorySamples,
  selectHourlyLoggerHistory,
  selectLoggerHistory,
  selectMinuteLoggerHistory,
  validateLoggerHistoryInterval,
} from "./index";

const IDS = { FIRST: 1, SECOND: 2 } as const;
const RANGE = {
  from: "2026-03-11T08:00:00Z",
  to: "2026-03-11T08:04:00Z",
};

const record = (
  loggedAt: string,
  pressure: unknown,
  overrides: Record<string, unknown> = {},
) => ({
  id: IDS.FIRST,
  deviceId: "L2",
  type: "pressure",
  loggedAt,
  pressure,
  ...overrides,
});

describe("minute logger history", () => {
  it("selects the first true reading after each minute without rounding its timestamp", () => {
    const rows = [
      record("2026-03-11T07:59:59Z", 59),
      record("2026-03-11T08:00:20Z", 20),
      record("2026-03-11T08:00:10Z", -0.250298),
      record("2026-03-11T08:01:10Z", 10),
      record("2026-03-11T08:00:59Z", 59),
      record("2026-03-11T08:01:00Z", 0),
      record("2026-03-11T08:03:30Z", 3),
      record("2026-03-11T08:04:00Z", 4),
      record("2026-03-11T08:04:01Z", 41),
    ];
    expect(selectMinuteLoggerHistory(rows, "L2", RANGE)).toEqual([
      {
        deviceId: "L2",
        timestamp: "2026-03-11T08:00:10Z",
        pressure: -0.250298,
      },
      { deviceId: "L2", timestamp: "2026-03-11T08:01:00Z", pressure: 0 },
      { deviceId: "L2", timestamp: "2026-03-11T08:03:30Z", pressure: 3 },
      { deviceId: "L2", timestamp: "2026-03-11T08:04:00Z", pressure: 4 },
    ]);
    expect(rows[0].loggedAt).toBe("2026-03-11T07:59:59Z");
  });

  it("skips partial starting minutes and missing minutes while filtering invalid pressure", () => {
    const rows = [
      record("2026-03-11T08:00:20Z", 20),
      record("2026-03-11T08:01:00Z", 1, { deviceId: "L1" }),
      record("2026-03-11T08:01:00Z", 2, { type: "device_status" }),
      record("2026-03-11T08:01:00Z", null),
      record("2026-03-11T08:01:00Z", Infinity),
      record("2026-03-11T08:01:00", 3),
      record("2026-02-30T08:01:00Z", 4),
      record("2026-03-11T13:31:10+05:30", -1),
      record("2026-03-11T08:03:00Z", 0),
    ];
    expect(
      selectMinuteLoggerHistory(rows, "L2", {
        from: "2026-03-11T08:00:15Z",
        to: RANGE.to,
      }),
    ).toEqual([
      { deviceId: "L2", timestamp: "2026-03-11T13:31:10+05:30", pressure: -1 },
      { deviceId: "L2", timestamp: "2026-03-11T08:03:00Z", pressure: 0 },
    ]);
  });

  it("applies limits to the newest distinct minutes and resolves identical timestamps by id", () => {
    const rows = [
      record("2026-03-11T08:03:10Z", 32, { id: IDS.SECOND }),
      record("2026-03-11T08:00:10Z", 0),
      record("2026-03-11T08:01:10Z", 1),
      record("2026-03-11T08:03:10Z", 31, { id: IDS.FIRST }),
      record("2026-03-11T08:02:10Z", 2),
    ];
    expect(
      selectLoggerHistory(rows, "L2", RANGE, 2, "minute").map(
        (sample) => sample.pressure,
      ),
    ).toEqual([2, 31]);
  });

  it("derives identical hourly results from the full minute cache and preserves unchanged cache identity", () => {
    const from = Date.UTC(2026, 2, 11, 8);
    const range = {
      from: new Date(from).toISOString(),
      to: new Date(from + 2 * 3600000).toISOString(),
    };
    const rows = Array.from({ length: 120 }, (_, index) => [
      record(new Date(from + index * 60000 + 20000).toISOString(), index + 20),
      record(new Date(from + index * 60000 + 10000).toISOString(), index),
    ])
      .flat()
      .reverse();
    const minutes = selectMinuteLoggerHistory(rows, "L2", range);
    expect(minutes).toHaveLength(120);
    expect(resampleLoggerHistorySamples(minutes, range, "minute")).toBe(
      minutes,
    );
    const hourly = resampleLoggerHistorySamples(minutes, range, "hourly");
    expect(hourly).toEqual(selectHourlyLoggerHistory(rows, "L2", range));
    expect(hourly[0]).toBe(minutes[0]);
    expect(hourly[1]).toBe(minutes[60]);
    expect(minutes).toHaveLength(120);
    expect(resampleLoggerHistorySamples([], range, "minute")).toEqual([]);
  });
});

describe("logger history intervals", () => {
  it("accepts only the supported intervals and defaults missing HTTP intervals to hourly", () => {
    expect(parseLoggerHistoryInterval(null)).toBe("hourly");
    expect(parseLoggerHistoryInterval("minute")).toBe("minute");
    expect(getLoggerHistoryIntervalMilliseconds("hourly")).toBe(3600000);
    expect(getLoggerHistoryIntervalMilliseconds("minute")).toBe(60000);
    for (const interval of [undefined, null, "", "second", "Hourly", 60]) {
      expect(() => validateLoggerHistoryInterval(interval)).toThrow(
        "invalidInterval",
      );
    }
    expect(() => parseLoggerHistoryInterval(" ")).toThrow("invalidInterval");
  });
});

describe("minute logger history HTTP requests", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests minute data and preserves the first reading in each minute", async () => {
    const fetchHistory = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            record("2026-03-11T08:00:10Z", -0.250298),
            record("2026-03-11T08:00:20Z", 20),
            record("2026-03-11T08:01:10Z", 0),
          ]),
      }),
    );
    vi.stubGlobal("fetch", fetchHistory);
    const samples = await loadLoggerHistory(
      "L2",
      RANGE,
      new AbortController().signal,
      null,
      "minute",
    );
    expect(samples.map((sample) => sample.pressure)).toEqual([-0.250298, 0]);
    const [url] = fetchHistory.mock.calls[0] as unknown as [string];
    expect(new URL(url, "http://localhost").searchParams.get("interval")).toBe(
      "minute",
    );
  });

  it("keeps interval validation failures distinct from transport failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: "invalidInterval" }),
        }),
      ),
    );
    await expect(
      loadLoggerHistory("L2", RANGE, new AbortController().signal),
    ).rejects.toThrow("invalidInterval");
  });
});
