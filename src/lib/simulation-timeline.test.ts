import {
  formatLocalDateTimeInput,
  formatTimelineTime,
  getCalendarDays,
  getTimelineDate,
  getTimelineIndexAtPosition,
  getTimelineProgress,
  getTimelineProgressAtPosition,
  getTimelineTicks,
  getTimestepForDate,
  parseLocalDateTimeInput,
} from "./simulation-timeline";

describe("timeline pointer mapping", () => {
  it("maps the inset ruler endpoints and quarters to result samples", () => {
    const left = 108;
    const width = 400;
    expect(getTimelineIndexAtPosition(left, left, width, 25)).toBe(0);
    expect(getTimelineIndexAtPosition(left + width / 4, left, width, 25)).toBe(
      6,
    );
    expect(
      getTimelineIndexAtPosition(left + (width * 3) / 4, left, width, 25),
    ).toBe(18);
    expect(getTimelineIndexAtPosition(left + width, left, width, 25)).toBe(24);
  });

  it("keeps continuous pointer progress separate from nearest result sample", () => {
    expect(getTimelineProgressAtPosition(249, 100, 400)).toBe(0.3725);
    expect(getTimelineIndexAtPosition(249, 100, 400, 25)).toBe(9);
    expect(getTimelineProgress(9, 25)).toBe(0.375);
    expect(getTimelineIndexAtPosition(150, 100, 400, 5)).toBe(1);
  });

  it("clamps pointer positions outside the ruler", () => {
    expect(getTimelineProgressAtPosition(-50, 100, 400)).toBe(0);
    expect(getTimelineProgressAtPosition(700, 100, 400)).toBe(1);
    expect(getTimelineIndexAtPosition(-50, 100, 400, 25)).toBe(0);
    expect(getTimelineIndexAtPosition(700, 100, 400, 25)).toBe(24);
  });

  it("clamps sample progress to the result range", () => {
    expect(getTimelineProgress(-1, 25)).toBe(0);
    expect(getTimelineProgress(0, 25)).toBe(0);
    expect(getTimelineProgress(6, 25)).toBe(0.25);
    expect(getTimelineProgress(18, 25)).toBe(0.75);
    expect(getTimelineProgress(24, 25)).toBe(1);
    expect(getTimelineProgress(100, 25)).toBe(1);
  });

  it.each([0, -1, NaN, Infinity])(
    "handles an unusable ruler width %s",
    (width) => {
      expect(getTimelineProgressAtPosition(150, 100, width)).toBe(0);
      expect(getTimelineIndexAtPosition(150, 100, width, 25)).toBe(0);
    },
  );

  it.each([0, 1, -1, 1.5, NaN, Infinity])(
    "handles an unusable sample count %s",
    (count) => {
      expect(getTimelineProgress(5, count)).toBe(0);
      expect(getTimelineIndexAtPosition(150, 100, 400, count)).toBe(0);
    },
  );

  it.each([NaN, Infinity, -Infinity])(
    "rejects invalid pointer coordinates %s",
    (value) => {
      expect(getTimelineProgressAtPosition(value, 100, 400)).toBe(0);
      expect(getTimelineProgressAtPosition(150, value, 400)).toBe(0);
      expect(getTimelineIndexAtPosition(value, 100, 400, 25)).toBe(0);
      expect(getTimelineIndexAtPosition(150, value, 400, 25)).toBe(0);
      expect(getTimelineProgress(value, 25)).toBe(0);
    },
  );
});

describe("simulation timeline ticks", () => {
  it("uses two-hour ticks for a 24-hour simulation", () => {
    expect(getTimelineTicks(25, 3600).map((tick) => tick.index)).toEqual([
      0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24,
    ]);
  });

  it("includes the final partial interval and deduplicates samples", () => {
    expect(getTimelineTicks(5, 420, 4)).toEqual([
      { index: 0, elapsedSeconds: 0 },
      { index: 1, elapsedSeconds: 420 },
      { index: 3, elapsedSeconds: 1260 },
      { index: 4, elapsedSeconds: 1680 },
    ]);
    expect(getTimelineTicks(2, 7200)).toEqual([
      { index: 0, elapsedSeconds: 0 },
      { index: 1, elapsedSeconds: 7200 },
    ]);
  });

  it("keeps fractional reporting samples at integer indices", () => {
    expect(getTimelineTicks(21, 0.5, 6)).toEqual([
      { index: 0, elapsedSeconds: 0 },
      { index: 4, elapsedSeconds: 2 },
      { index: 8, elapsedSeconds: 4 },
      { index: 12, elapsedSeconds: 6 },
      { index: 16, elapsedSeconds: 8 },
      { index: 20, elapsedSeconds: 10 },
    ]);
  });

  it("limits work for a long simulation", () => {
    const ticks = getTimelineTicks(10000001, 60, 5);
    expect(ticks[0]).toEqual({ index: 0, elapsedSeconds: 0 });
    expect(ticks.at(-1)).toEqual({
      index: 10000000,
      elapsedSeconds: 600000000,
    });
    expect(ticks.length).toBeLessThanOrEqual(5);
  });

  it("handles a single sample and a small tick limit", () => {
    expect(getTimelineTicks(1, 3600)).toEqual([
      { index: 0, elapsedSeconds: 0 },
    ]);
    expect(getTimelineTicks(25, 3600, 1).map((tick) => tick.index)).toEqual([
      0, 24,
    ]);
  });

  it.each([
    [0, 3600],
    [-1, 3600],
    [NaN, 3600],
    [Infinity, 3600],
    [10, 0],
    [10, -1],
    [10, NaN],
    [10, Infinity],
  ])("rejects invalid count %s and interval %s", (count, interval) => {
    expect(getTimelineTicks(count, interval)).toEqual([]);
  });
});

describe("simulation timeline dates", () => {
  it("preserves the selected start time through a 24-hour simulation", () => {
    const start = new Date(2026, 10, 19, 17, 50);
    const original = start.getTime();
    expect(getTimelineDate(start, 24, 3600)).toEqual(
      new Date(2026, 10, 20, 17, 50),
    );
    expect(getTimelineDate(start, 0, 3600).getTime()).toBe(original);
    expect(start.getTime()).toBe(original);
  });

  it("adds actual elapsed time across spring and autumn clock changes", () => {
    const springStart = new Date("2026-03-07T12:30:00-05:00");
    expect(getTimelineDate(springStart, 24, 3600)).toEqual(
      new Date("2026-03-08T13:30:00-04:00"),
    );
    const autumnStart = new Date("2026-10-31T12:30:00-04:00");
    expect(getTimelineDate(autumnStart, 24, 3600)).toEqual(
      new Date("2026-11-01T11:30:00-05:00"),
    );
  });

  it("preserves start seconds and milliseconds with fractional intervals", () => {
    const start = new Date(2026, 10, 19, 17, 50, 21, 750);
    expect(getTimelineDate(start, 3, 2.125)).toEqual(
      new Date(2026, 10, 19, 17, 50, 28, 125),
    );
  });

  it("keeps fractional seconds and leap-day rollovers", () => {
    const date = getTimelineDate(
      new Date(2028, 1, 28, 23, 59, 59, 750),
      1,
      0.5,
    );
    expect(date).toEqual(new Date(2028, 1, 29, 0, 0, 0, 250));
  });

  it("returns an invalid date for invalid time inputs", () => {
    expect(getTimelineDate(new Date(NaN), 1, 3600).getTime()).toBeNaN();
    expect(getTimelineDate(new Date(), NaN, 3600).getTime()).toBeNaN();
    expect(getTimelineDate(new Date(), 1, 0).getTime()).toBeNaN();
  });
});

describe("calendar timestep selection", () => {
  const start = new Date(2026, 10, 19);

  it("preserves the current time of day when jumping between days", () => {
    expect(
      getTimestepForDate(new Date(2026, 10, 20), start, 15, 73, 3600),
    ).toBe(39);
    expect(
      getTimestepForDate(new Date(2026, 10, 19), start, 39, 73, 3600),
    ).toBe(15);
  });

  it("preserves wall-clock time when the simulation begins after midnight", () => {
    const afternoonStart = new Date(2026, 10, 19, 17, 50);
    expect(
      getTimestepForDate(new Date(2026, 10, 20), afternoonStart, 0, 49, 3600),
    ).toBe(24);
    expect(
      getTimestepForDate(new Date(2026, 10, 20), afternoonStart, 6, 49, 3600),
    ).toBe(30);
    expect(
      getTimestepForDate(new Date(2026, 10, 19), afternoonStart, 12, 49, 3600),
    ).toBe(0);
  });

  it("uses the actual local-day bounds for a partial first and final day", () => {
    const afternoonStart = new Date(2026, 10, 19, 17, 50);
    expect(
      getTimestepForDate(new Date(2026, 10, 20), afternoonStart, 0, 13, 3600),
    ).toBe(12);
    expect(
      getTimestepForDate(new Date(2026, 10, 20), afternoonStart, 0, 7, 3600),
    ).toBeNull();
    expect(
      getTimestepForDate(new Date(2026, 10, 20), afternoonStart, 0, 38, 600),
    ).toBe(37);
  });

  it("preserves local clock time across days with different UTC offsets", () => {
    for (const [startDay, targetDay] of [
      [new Date(2026, 2, 7, 12, 30), new Date(2026, 2, 8, 12, 30)],
      [new Date(2026, 9, 31, 12, 30), new Date(2026, 10, 1, 12, 30)],
    ]) {
      const expectedIndex =
        (targetDay.getTime() - startDay.getTime()) / 3600000;
      expect(getTimestepForDate(targetDay, startDay, 0, 73, 3600)).toBe(
        expectedIndex,
      );
    }
  });

  it("keeps the current sample on a repeated local clock time", () => {
    const repeatedHourStart = new Date("2026-11-01T00:30:00-04:00");
    const repeatedHour = getTimelineDate(repeatedHourStart, 2, 3600);
    expect(
      getTimestepForDate(repeatedHour, repeatedHourStart, 2, 7, 3600),
    ).toBe(2);
  });

  it("clamps to available results on the final partial day", () => {
    expect(
      getTimestepForDate(new Date(2026, 10, 20), start, 20, 31, 3600),
    ).toBe(30);
  });

  it("rounds to the nearest sample that stays within the requested day", () => {
    expect(
      getTimestepForDate(new Date(2026, 10, 20), start, 7, 21, 10000),
    ).toBe(16);
    expect(
      getTimestepForDate(new Date(2026, 10, 19), start, 17, 21, 10000),
    ).toBe(8);
  });

  it("rejects dates without samples when reports are more than a day apart", () => {
    expect(
      getTimestepForDate(new Date(2026, 10, 20), start, 0, 4, 172800),
    ).toBeNull();
    expect(
      getTimestepForDate(new Date(2026, 10, 21), start, 0, 4, 172800),
    ).toBe(1);
  });

  it("keeps exact midnight samples in the following day", () => {
    expect(
      getTimestepForDate(new Date(2026, 10, 20), start, 20, 25, 3600),
    ).toBe(24);
    expect(
      getTimestepForDate(new Date(2026, 10, 21), start, 0, 25, 3600),
    ).toBeNull();
  });

  it("handles fractional intervals at midnight", () => {
    expect(
      getTimestepForDate(new Date(2026, 10, 20), start, 0, 288001, 0.3),
    ).toBe(288000);
  });

  it("rejects dates and sample ranges outside the simulation", () => {
    expect(
      getTimestepForDate(new Date(2026, 10, 18), start, 0, 25, 3600),
    ).toBeNull();
    expect(getTimestepForDate(new Date(NaN), start, 0, 25, 3600)).toBeNull();
    expect(getTimestepForDate(start, start, 0, 0, 3600)).toBeNull();
    expect(getTimestepForDate(start, start, 0, 25, 0)).toBeNull();
    expect(getTimestepForDate(start, start, NaN, 25, 3600)).toBeNull();
  });
});

describe("simulation calendar grid", () => {
  it("starts on Monday and includes six weeks across a year boundary", () => {
    const month = new Date(2027, 0, 15, 12);
    const original = month.getTime();
    const days = getCalendarDays(month);
    expect(days).toHaveLength(42);
    expect(days[0]).toEqual(new Date(2026, 11, 28));
    expect(days.at(-1)).toEqual(new Date(2027, 1, 7));
    expect(days.every((day, index) => day.getDay() === (index + 1) % 7)).toBe(
      true,
    );
    expect(month.getTime()).toBe(original);
  });

  it("includes leap day and uses independent day objects", () => {
    const days = getCalendarDays(new Date(2028, 1, 1));
    expect(days.filter((date) => date.getMonth() === 1)).toHaveLength(29);
    expect(new Set(days).size).toBe(42);
    expect(getCalendarDays(new Date(NaN))).toEqual([]);
  });
});

describe("timeline time labels", () => {
  it.each([
    [0, "00:00"],
    [1800, "00:30"],
    [86400, "24:00"],
    [360000, "100:00"],
    [3661, "01:01:01"],
    [0.5, "00:00:00.5"],
    [-1, "00:00"],
    [NaN, "00:00"],
  ])("formats %s as %s", (seconds, expected) => {
    expect(formatTimelineTime(seconds)).toBe(expected);
  });
});

describe("local simulation start inputs", () => {
  it("round-trips the exact local start time", () => {
    const start = new Date(2026, 10, 19, 17, 50, 21, 750);
    expect(formatLocalDateTimeInput(start)).toBe("2026-11-19T17:50:21.750");
    expect(parseLocalDateTimeInput(formatLocalDateTimeInput(start))).toEqual(
      start,
    );
  });

  it("accepts minute, second and fractional-second precision", () => {
    expect(parseLocalDateTimeInput("2026-11-19T17:50")).toEqual(
      new Date(2026, 10, 19, 17, 50),
    );
    expect(parseLocalDateTimeInput("2026-11-19T17:50:21")).toEqual(
      new Date(2026, 10, 19, 17, 50, 21),
    );
    expect(parseLocalDateTimeInput("2026-11-19T17:50:21.5")).toEqual(
      new Date(2026, 10, 19, 17, 50, 21, 500),
    );
  });

  it("preserves years before 100 without applying a 1900 offset", () => {
    const date = parseLocalDateTimeInput("0007-02-03T04:05:06");
    expect(date?.getFullYear()).toBe(7);
    expect(date && formatLocalDateTimeInput(date)).toBe("0007-02-03T04:05:06");
  });

  it("rejects local times skipped by a daylight saving change", () => {
    const normalized = new Date(2026, 2, 8, 2, 30);
    expect(parseLocalDateTimeInput("2026-03-08T02:30")).toEqual(
      normalized.getHours() === 2 ? normalized : null,
    );
  });

  it.each([
    "",
    "2026-11-19",
    "2026-11-19T17:50Z",
    "2026-11-19T17:50:00+08:00",
    "2026-02-29T17:50",
    "2026-13-19T17:50",
    "2026-11-31T17:50",
    "2026-11-19T24:00",
    "2026-11-19T17:60",
    "2026-11-19T17:50:60",
    "2026-11-19T17:50:21.1234",
    "0000-11-19T17:50",
  ])("rejects invalid local date %s", (value) => {
    expect(parseLocalDateTimeInput(value)).toBeNull();
  });

  it("formats an invalid date as an empty input", () => {
    expect(formatLocalDateTimeInput(new Date(NaN))).toBe("");
  });
});
