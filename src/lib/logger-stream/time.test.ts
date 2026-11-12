import { describe, expect, it } from "vitest";
import { formatLoggerTimestamp } from "./time";

describe("logger display time", () => {
  it("shows UTC+8 across year boundaries with millisecond precision", () => {
    const timestamp = "2026-12-31T16:00:03.125Z";
    expect(formatLoggerTimestamp(timestamp, "en")).toBe(
      "Jan 01, 2027, 00:00:03.125 UTC+8",
    );
  });

  it("preserves live UTC+8 device clock time without applying the offset twice", () => {
    expect(formatLoggerTimestamp("2026-11-11T14:58:43", "en")).toBe(
      "Nov 11, 2026, 14:58:43 UTC+8",
    );
    expect(formatLoggerTimestamp("2026-11-11T05:00:52", "en")).toBe(
      "Nov 11, 2026, 05:00:52 UTC+8",
    );
  });

  it("shows equivalent naive and explicit source instants consistently", () => {
    for (const timestamp of [
      "2026-11-11T13:00:52",
      "2026-11-11T13:00:52+08:00",
      "2026-11-11T05:00:52Z",
      "2026-11-11T00:00:52-05:00",
    ])
      expect(formatLoggerTimestamp(timestamp, "en")).toBe(
        "Nov 11, 2026, 13:00:52 UTC+8",
      );
  });
});
