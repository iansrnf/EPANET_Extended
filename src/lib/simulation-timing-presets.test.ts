import { describe, expect, it } from "vitest";
import {
  buildSimulationTimingPreset,
  DEFAULT_SIMULATION_TIMING_STEPS,
  formatSimulationTimingDuration,
  getSimulationTimingPresetMaximumSteps,
  getSimulationTimingPresetSeconds,
  inferSimulationTimingPreset,
  isSimulationTimingStepCountValid,
  MAX_SIMULATION_DURATION_SECONDS,
} from "./simulation-timing-presets";

describe("simulation timing presets", () => {
  it.each([
    ["hourly", 3600],
    ["minutes", 60],
    ["seconds", 1],
  ] as const)("builds the default 24 %s steps", (preset, seconds) => {
    expect(buildSimulationTimingPreset(preset)).toEqual({
      duration: DEFAULT_SIMULATION_TIMING_STEPS * seconds,
      hydraulicTimestep: seconds,
      reportTimestep: seconds,
      patternTimestep: seconds,
    });
    expect(getSimulationTimingPresetSeconds(preset)).toBe(seconds);
  });

  it("builds 100 minute intervals as a one hour forty minute duration", () => {
    const timing = buildSimulationTimingPreset("minutes", 100);
    expect(timing).toEqual({
      duration: 6000,
      hydraulicTimestep: 60,
      reportTimestep: 60,
      patternTimestep: 60,
    });
    expect(formatSimulationTimingDuration(timing.duration)).toBe("1:40:00");
  });

  it.each(["hourly", "minutes", "seconds"] as const)(
    "accepts the last safe %s duration and rejects the next step",
    (preset) => {
      const maximumSteps = getSimulationTimingPresetMaximumSteps(preset);
      expect(isSimulationTimingStepCountValid(preset, maximumSteps)).toBe(true);
      const timing = buildSimulationTimingPreset(preset, maximumSteps);
      expect(timing.duration).toBeLessThanOrEqual(
        MAX_SIMULATION_DURATION_SECONDS,
      );
      expect(maximumSteps + 1).toBeLessThanOrEqual(2_147_483_647);
      expect(() =>
        buildSimulationTimingPreset(preset, maximumSteps + 1),
      ).toThrow(RangeError);
    },
  );

  it("rejects nonpositive fractional and unsafe step counts", () => {
    for (const totalSteps of [
      0,
      -1,
      1.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(isSimulationTimingStepCountValid("minutes", totalSteps)).toBe(
        false,
      );
      expect(() => buildSimulationTimingPreset("minutes", totalSteps)).toThrow(
        RangeError,
      );
    }
  });

  it("infers a saved preset without changing optional or existing settings", () => {
    const timing = Object.freeze({
      duration: 6000,
      hydraulicTimestep: 60,
      reportTimestep: 60,
      patternTimestep: 60,
      qualityTimestep: 6,
      ruleTimestep: 6,
    });
    expect(inferSimulationTimingPreset(timing)).toEqual({
      preset: "minutes",
      totalSteps: 100,
    });
    expect(timing).toEqual({
      duration: 6000,
      hydraulicTimestep: 60,
      reportTimestep: 60,
      patternTimestep: 60,
      qualityTimestep: 6,
      ruleTimestep: 6,
    });
  });

  it("infers from report spacing when advanced time steps differ", () => {
    expect(
      inferSimulationTimingPreset({
        duration: 1440,
        hydraulicTimestep: 20,
        reportTimestep: 1,
        patternTimestep: 60,
      }),
    ).toEqual({ preset: "seconds", totalSteps: 1440 });
    expect(
      inferSimulationTimingPreset({ duration: 7200, reportTimestep: 300 }),
    ).toEqual({ preset: "hourly", totalSteps: 2 });
  });

  it("uses a 24 step draft for steady state or unrepresentable durations", () => {
    for (const duration of [0, -1, 61, NaN, Infinity, 2_147_483_648])
      expect(
        inferSimulationTimingPreset({ duration, reportTimestep: 60 }),
      ).toEqual({ preset: "minutes", totalSteps: 24 });
    expect(inferSimulationTimingPreset({})).toEqual({
      preset: "hourly",
      totalSteps: 24,
    });
  });

  it("formats second precision without rounding a subminute duration", () => {
    expect(formatSimulationTimingDuration(24)).toBe("0:00:24");
    expect(formatSimulationTimingDuration(3600)).toBe("1:00:00");
    expect(formatSimulationTimingDuration(86401)).toBe("24:00:01");
    expect(formatSimulationTimingDuration(0)).toBe("0:00:00");
    expect(() => formatSimulationTimingDuration(1.5)).toThrow(RangeError);
  });
});
