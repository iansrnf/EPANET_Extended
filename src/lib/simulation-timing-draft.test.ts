import {
  applySimulationTimingPreset,
  changeSimulationTimingAnalysisMode,
  changeSimulationTimingDuration,
  changeSimulationTimingInterval,
  createSimulationTimingDraftFields,
  isSimulationTimingDraftValid,
} from "./simulation-timing-draft";
import { buildSimulationTimingPreset } from "./simulation-timing-presets";

const initial = () => {
  const timing = buildSimulationTimingPreset("hourly", 24);
  return {
    ...timing,
    ...createSimulationTimingDraftFields(timing),
    simulationMode: "eps" as const,
    qualityTimestep: 10,
    ruleTimestep: 5,
  };
};

describe("simulation timing draft", () => {
  it("retains the count while switching presets atomically", () => {
    const hours = initial();
    const minutes = applySimulationTimingPreset(hours, "minutes");
    const seconds = applySimulationTimingPreset(minutes, "seconds");
    expect(minutes).toMatchObject({
      duration: 1440,
      hydraulicTimestep: 60,
      reportTimestep: 60,
      patternTimestep: 60,
      timingStepCount: "24",
    });
    expect(seconds).toMatchObject({
      duration: 24,
      hydraulicTimestep: 1,
      reportTimestep: 1,
      patternTimestep: 1,
      timingStepCount: "24",
      qualityTimestep: 10,
      ruleTimestep: 5,
    });
    expect(hours.duration).toBe(86400);
  });

  it("recalculates the count when duration is edited and preserves custom durations", () => {
    const minutes = applySimulationTimingPreset(initial(), "minutes");
    const aligned = changeSimulationTimingDuration(minutes, 6000);
    expect(aligned.timingStepCount).toBe("100");
    expect(aligned.isTimingPresetActive).toBe(true);
    const custom = changeSimulationTimingDuration(aligned, 6001);
    expect(custom).toMatchObject({
      duration: 6001,
      timingPreset: "minutes",
      timingStepCount: "",
      isTimingPresetActive: false,
    });
    expect(isSimulationTimingDraftValid(custom)).toBe(true);
  });

  it("recognizes manually aligned intervals without overwriting custom ones", () => {
    const custom = changeSimulationTimingInterval(
      initial(),
      "hydraulicTimestep",
      1,
    );
    expect(custom).toMatchObject({
      hydraulicTimestep: 1,
      reportTimestep: 3600,
      patternTimestep: 3600,
      timingStepCount: "",
      isTimingPresetActive: false,
    });
    const reportChanged = changeSimulationTimingInterval(
      custom,
      "reportTimestep",
      1,
    );
    const aligned = changeSimulationTimingInterval(
      reportChanged,
      "patternTimestep",
      1,
    );
    expect(aligned).toMatchObject({
      timingPreset: "seconds",
      timingStepCount: "86400",
      isTimingPresetActive: true,
      duration: 86400,
    });
  });

  it.each(["", "0", "1.5", "-2", "Infinity", "999999999999999999999"])(
    "retains valid timings while rejecting count %s",
    (count) => {
      const values = initial();
      const draft = applySimulationTimingPreset(values, "minutes", count);
      expect(draft.timingStepCount).toBe(count);
      expect(draft.duration).toBe(values.duration);
      expect(draft.hydraulicTimestep).toBe(values.hydraulicTimestep);
      expect(isSimulationTimingDraftValid(draft)).toBe(false);
    },
  );

  it("keeps the EPS draft when toggling steady state", () => {
    const minutes = applySimulationTimingPreset(initial(), "minutes", "100");
    const steady = changeSimulationTimingAnalysisMode(minutes, "steadyState");
    const restored = changeSimulationTimingAnalysisMode(steady, "eps");
    expect(restored).toEqual(minutes);
  });
});
