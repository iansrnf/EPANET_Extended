import { formatTimestepTime } from "./format-timestep-time";

describe("simulation timestep time", () => {
  it.each([
    [0, 1, "00:00:00"],
    [1, 1, "00:00:01"],
    [59, 1, "00:00:59"],
    [60, 1, "00:01:00"],
    [24, 60, "00:24:00"],
    [1, 3600, "01:00:00"],
    [24, 3600, "24:00:00"],
    [100, 3600, "100:00:00"],
    [1, 3661, "01:01:01"],
  ] as const)(
    "formats step %s at %s seconds as %s",
    (index, interval, expected) => {
      expect(formatTimestepTime(index, interval)).toBe(expected);
    },
  );

  it("defaults to hourly reporting", () => {
    expect(formatTimestepTime(1)).toBe("01:00:00");
  });
});
