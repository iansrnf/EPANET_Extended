import {
  applyLoggerHistorySampleLimit,
  fromLoggerHistoryDateTimeInput,
  getDefaultLoggerHistoryRange,
  loadLoggerHistory,
  LoggerHistoryRequestError,
  parseLoggerHistorySampleLimit,
  selectHourlyLoggerHistory,
  toLoggerHistoryDateTimeInput,
  validateLoggerHistoryRange,
  validateLoggerHistorySampleLimit,
} from "./index";

const IDS = { FIRST: 1, SECOND: 2, THIRD: 3 } as const;
const RANGE = {
  from: "2026-03-11T08:00:00Z",
  to: "2026-03-11T10:00:00Z",
};

const record = (
  loggedAt: string,
  pressure: unknown,
  overrides: Record<string, unknown> = {},
) => ({
  id: IDS.FIRST,
  deviceId: "L2",
  type: "pressure",
  pressure,
  loggedAt,
  ...overrides,
});

describe("hourly logger history", () => {
  it("takes the first reading at or after each whole hour", () => {
    const payload = [
      record("2026-03-11T07:59:59Z", 8),
      record("2026-03-11T08:00:05Z", 5),
      record("2026-03-11T09:00:03Z", 3),
      record("2026-03-11T08:00:03Z", -0.250298),
      record("2026-03-11T09:00:00Z", 0),
      record("2026-03-11T10:00:00Z", 10),
      record("2026-03-11T10:00:01Z", 11),
    ];
    const samples = selectHourlyLoggerHistory(payload, "L2", RANGE);

    expect(samples).toEqual([
      {
        deviceId: "L2",
        timestamp: "2026-03-11T08:00:03Z",
        pressure: -0.250298,
      },
      { deviceId: "L2", timestamp: "2026-03-11T09:00:00Z", pressure: 0 },
      { deviceId: "L2", timestamp: "2026-03-11T10:00:00Z", pressure: 10 },
    ]);
    expect(payload[0].loggedAt).toBe("2026-03-11T07:59:59Z");
  });

  it("leaves missing hours empty and skips a partial starting hour", () => {
    const payload = [
      record("2026-03-11T08:31:00Z", 8),
      record("2026-03-11T10:00:03Z", 10),
    ];
    const range = { from: "2026-03-11T08:30:00Z", to: "2026-03-11T10:30:00Z" };

    expect(selectHourlyLoggerHistory(payload, "L2", range)).toEqual([
      { deviceId: "L2", timestamp: "2026-03-11T10:00:03Z", pressure: 10 },
    ]);
    expect(
      selectHourlyLoggerHistory(payload, "L2", {
        ...range,
        to: "2026-03-11T08:59:59Z",
      }),
    ).toEqual([]);
  });

  it("ignores unrelated and invalid records while preserving signed pressure", () => {
    const payload = [
      record("2026-03-11T08:00:00Z", 3, { deviceId: "L1" }),
      record("2026-03-11T08:00:00Z", 4, { type: "device_status" }),
      record("2026-03-11T08:00:00Z", null),
      record("2026-03-11T08:00:00Z", "5"),
      record("2026-03-11T08:00:00Z", Number.NaN),
      record("2026-03-11T08:00:00Z", Infinity),
      record("2026-02-30T08:00:00Z", 6),
      record("2026-03-11T08:00:00", 7),
      record("2026-03-11T13:30:03+05:30", -0.03768),
      record("2026-03-11T09:00:00Z", 0),
    ];

    expect(selectHourlyLoggerHistory(payload, "L2", RANGE)).toEqual([
      {
        deviceId: "L2",
        timestamp: "2026-03-11T13:30:03+05:30",
        pressure: -0.03768,
      },
      { deviceId: "L2", timestamp: "2026-03-11T09:00:00Z", pressure: 0 },
    ]);
    expect(() => selectHourlyLoggerHistory({ data: [] }, "L2", RANGE)).toThrow(
      new LoggerHistoryRequestError("invalidResponse"),
    );
    expect(() => selectHourlyLoggerHistory([], " ", RANGE)).toThrow(
      new LoggerHistoryRequestError("invalidDeviceId"),
    );
  });

  it("resolves identical source timestamps by record id then response order", () => {
    const timestamp = "2026-03-11T08:00:03Z";
    const payload = [
      record(timestamp, 3, { id: IDS.THIRD }),
      record(timestamp, 2, { id: IDS.SECOND }),
      record(timestamp, 22, { id: IDS.SECOND }),
      record("2026-03-11T08:00:05Z", 1, { id: IDS.FIRST }),
      record(timestamp, 4, { id: undefined }),
    ];

    expect(selectHourlyLoggerHistory(payload, "L2", RANGE)).toEqual([
      { deviceId: "L2", timestamp, pressure: 2 },
    ]);
  });

  it.each([10, 24, 100, 150, 237])(
    "keeps the newest %s available hourly readings in chronological order",
    (limit) => {
      const start = Date.UTC(2026, 2, 1);
      const hour = 3600000;
      const hours = [
        ...Array.from({ length: 150 }, (_, index) => index * 2).reverse(),
        ...Array.from({ length: 150 }, (_, index) => index * 2 + 1),
      ];
      const payload = hours.flatMap((index) => [
        record(new Date(start + index * hour + 5000).toISOString(), index + 1),
        record(new Date(start + index * hour + 3000).toISOString(), index),
      ]);
      const range = {
        from: new Date(start).toISOString(),
        to: new Date(start + 300 * hour).toISOString(),
      };

      const selected = selectHourlyLoggerHistory(payload, "L2", range, limit);

      expect(selected.map((sample) => sample.pressure)).toEqual(
        Array.from({ length: limit }, (_, index) => 300 - limit + index),
      );
      expect(
        selected.every((sample) => sample.timestamp.endsWith("03.000Z")),
      ).toBe(true);
      expect(payload[0].pressure).toBe(299);
    },
  );

  it("keeps all available hourly readings without a 150 point ceiling or padding", () => {
    const start = Date.UTC(2026, 2, 1);
    const hour = 3600000;
    const range = {
      from: new Date(start).toISOString(),
      to: new Date(start + 300 * hour).toISOString(),
    };
    const payload = Array.from({ length: 300 }, (_, index) =>
      record(new Date(start + index * hour).toISOString(), index),
    );

    expect(selectHourlyLoggerHistory(payload, "L2", range)).toHaveLength(300);
    expect(selectHourlyLoggerHistory(payload, "L2", range, null)).toHaveLength(
      300,
    );
    expect(selectHourlyLoggerHistory(payload, "L2", range, 500)).toHaveLength(
      300,
    );
  });
});

describe("logger history ranges", () => {
  it("canonicalizes zones and validates actual calendar dates and range order", () => {
    expect(
      validateLoggerHistoryRange(
        "2026-03-11T13:30:00+05:30",
        "2026-03-11T10:00:00Z",
      ),
    ).toEqual({
      from: "2026-03-11T08:00:00.000Z",
      to: "2026-03-11T10:00:00.000Z",
    });

    for (const [from, to] of [
      ["2026-03-11T08:00:00", RANGE.to],
      ["2026-02-30T08:00:00Z", RANGE.to],
      [RANGE.to, RANGE.from],
      [RANGE.from, RANGE.from],
      ["", RANGE.to],
    ]) {
      expect(() => validateLoggerHistoryRange(from, to)).toThrow(
        new LoggerHistoryRequestError("invalidRange"),
      );
    }
  });

  it("accepts valid ranges longer than 150 hours", () => {
    const start = Date.UTC(2026, 2, 1);
    const hour = 60 * 60 * 1000;
    const from = new Date(start).toISOString();
    const to = new Date(start + 300 * hour).toISOString();
    const range = validateLoggerHistoryRange(from, to);
    expect(range).toEqual({ from, to });
  });

  it("treats date-time controls as UTC+8 and defaults to the last day", () => {
    expect(fromLoggerHistoryDateTimeInput("2026-03-11T08:30")).toBe(
      "2026-03-11T00:30:00.000Z",
    );
    expect(fromLoggerHistoryDateTimeInput("2026-03-11T08:30:25")).toBe(
      "2026-03-11T00:30:25.000Z",
    );
    expect(toLoggerHistoryDateTimeInput("2026-03-11T16:30:25+08:00")).toBe(
      "2026-03-11T16:30:25",
    );
    expect(() => fromLoggerHistoryDateTimeInput("2026-02-30T08:30")).toThrow(
      new LoggerHistoryRequestError("invalidRange"),
    );
    expect(() =>
      fromLoggerHistoryDateTimeInput("2026-03-11T08:30:25Z"),
    ).toThrow(new LoggerHistoryRequestError("invalidRange"));
    expect(
      getDefaultLoggerHistoryRange(new Date("2026-03-11T08:30:25.987Z")),
    ).toEqual({
      from: "2026-03-10T08:30:25.000Z",
      to: "2026-03-11T08:30:25.000Z",
    });
  });

  it("converts UTC+8 controls across day and year boundaries", () => {
    expect(fromLoggerHistoryDateTimeInput("2026-01-01T00:20:15")).toBe(
      "2025-12-31T16:20:15.000Z",
    );
    expect(toLoggerHistoryDateTimeInput("2025-12-31T23:20:15Z")).toBe(
      "2026-01-01T07:20:15",
    );
    expect(fromLoggerHistoryDateTimeInput("2024-03-01T04:00")).toBe(
      "2024-02-29T20:00:00.000Z",
    );
  });

  it("renders equivalent source offsets as the same UTC+8 wallclock", () => {
    for (const timestamp of [
      "2026-03-11T08:30:25Z",
      "2026-03-11T16:30:25+08:00",
      "2026-03-11T03:30:25-05:00",
      "2026-03-11T14:00:25+05:30",
    ])
      expect(toLoggerHistoryDateTimeInput(timestamp)).toBe(
        "2026-03-11T16:30:25",
      );
  });

  it("roundtrips UTC+8 controls without relying on the browser timezone", () => {
    for (const value of [
      "2026-01-01T00:00:00",
      "2026-06-15T23:59:59",
      "2024-02-29T08:00:01",
    ])
      expect(
        toLoggerHistoryDateTimeInput(fromLoggerHistoryDateTimeInput(value)),
      ).toBe(value);
  });

  it("rejects invalid wallclock fields and source timestamps", () => {
    for (const value of [
      "2026-02-29T08:30",
      "2026-03-11T24:00",
      "2026-03-11T08:60",
      "2026-03-11T08:30:60",
      "2026-03-11T08:30+08:00",
      "2026-03-11T08:30:25.123",
      "",
    ])
      expect(() => fromLoggerHistoryDateTimeInput(value)).toThrow(
        new LoggerHistoryRequestError("invalidRange"),
      );
    for (const timestamp of ["2026-02-30T08:30:25Z", "2026-03-11T08:30:25"])
      expect(() => toLoggerHistoryDateTimeInput(timestamp)).toThrow(
        new LoggerHistoryRequestError("invalidRange"),
      );
  });
});

describe("logger history sample limits", () => {
  it("accepts all available or any positive safe integer without a preset ceiling", () => {
    expect(validateLoggerHistorySampleLimit(null)).toBeNull();
    for (const value of [1, 10, 24, 100, 150, 237, Number.MAX_SAFE_INTEGER])
      expect(validateLoggerHistorySampleLimit(value)).toBe(value);
    for (const value of [
      0,
      -1,
      1.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      "10",
      "all",
      undefined,
    ])
      expect(() => validateLoggerHistorySampleLimit(value)).toThrow(
        new LoggerHistoryRequestError("invalidSampleLimit"),
      );
  });

  it("parses only all or a positive integer HTTP limit", () => {
    expect(parseLoggerHistorySampleLimit(null)).toBeNull();
    expect(parseLoggerHistorySampleLimit("all")).toBeNull();
    expect(parseLoggerHistorySampleLimit("237")).toBe(237);
    for (const value of [
      "",
      "0",
      "-1",
      "1.5",
      "1e3",
      "Infinity",
      "9007199254740992",
    ])
      expect(() => parseLoggerHistorySampleLimit(value)).toThrow(
        new LoggerHistoryRequestError("invalidSampleLimit"),
      );
  });

  it("changes the displayed window without mutating cached readings", () => {
    const all = selectHourlyLoggerHistory(
      [
        record("2026-03-11T08:00:03Z", -0.03768),
        record("2026-03-11T09:00:03Z", 0),
        record("2026-03-11T10:00:00Z", 1),
      ],
      "L2",
      RANGE,
    );
    expect(applyLoggerHistorySampleLimit(all, null)).toBe(all);
    expect(applyLoggerHistorySampleLimit(all, 10)).toBe(all);
    expect(applyLoggerHistorySampleLimit(all, 2)).toEqual(all.slice(1));
    expect(all.map((sample) => sample.pressure)).toEqual([-0.03768, 0, 1]);
    expect(() => applyLoggerHistorySampleLimit(all, 0)).toThrow(
      "invalidSampleLimit",
    );
  });
});

describe("logger history requests", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests the selected device and UTC range over HTTP", async () => {
    const controller = new AbortController();
    const fetchHistory = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([record("2026-03-11T08:00:03Z", -0.03768)]),
      }),
    );
    vi.stubGlobal("fetch", fetchHistory);

    const samples = await loadLoggerHistory("L2", RANGE, controller.signal);

    expect(samples[0].pressure).toBe(-0.03768);
    const [url, options] = fetchHistory.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const query = new URL(url, "http://localhost").searchParams;
    expect(query.get("deviceId")).toBe("L2");
    expect(query.get("from")).toBe("2026-03-11T08:00:00.000Z");
    expect(query.get("to")).toBe("2026-03-11T10:00:00.000Z");
    expect(query.get("limit")).toBe("all");
    expect(query.get("interval")).toBe("hourly");
    expect(options).toMatchObject({
      cache: "no-store",
      signal: controller.signal,
    });
  });

  it("sends an explicit sample limit and validates it before HTTP", async () => {
    const fetchHistory = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            record("2026-03-11T08:00:03Z", 8),
            record("2026-03-11T09:00:03Z", 9),
          ]),
      }),
    );
    vi.stubGlobal("fetch", fetchHistory);
    const samples = await loadLoggerHistory(
      "L2",
      RANGE,
      new AbortController().signal,
      1,
    );
    expect(samples.map((sample) => sample.pressure)).toEqual([9]);
    const [url] = fetchHistory.mock.calls[0] as unknown as [string];
    expect(new URL(url, "http://localhost").searchParams.get("limit")).toBe(
      "1",
    );
    fetchHistory.mockClear();
    await expect(
      loadLoggerHistory("L2", RANGE, new AbortController().signal, 0),
    ).rejects.toThrow("invalidSampleLimit");
    expect(fetchHistory).not.toHaveBeenCalled();
  });

  it("preserves request errors and distinguishes malformed history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: "invalidSampleLimit" }),
        }),
      ),
    );
    await expect(
      loadLoggerHistory("L2", RANGE, new AbortController().signal),
    ).rejects.toThrow(new LoggerHistoryRequestError("invalidSampleLimit"));
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: [] }),
        }),
      ),
    );
    await expect(
      loadLoggerHistory("L2", RANGE, new AbortController().signal),
    ).rejects.toThrow(new LoggerHistoryRequestError("invalidResponse"));
  });

  it("keeps aborts distinct from a failed network request", async () => {
    const controller = new AbortController();
    const abort = new DOMException("Aborted", "AbortError");
    controller.abort();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(abort)),
    );

    await expect(
      loadLoggerHistory("L2", RANGE, controller.signal),
    ).rejects.toBe(abort);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    await expect(
      loadLoggerHistory("L2", RANGE, new AbortController().signal),
    ).rejects.toThrow(new LoggerHistoryRequestError("requestFailed"));
  });
});
