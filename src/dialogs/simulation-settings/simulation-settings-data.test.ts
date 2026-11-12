import { SimulationSettingsBuilder } from "src/__helpers__/simulation-settings-builder";
import {
  applySimulationTimingPreset,
  changeSimulationTimingAnalysisMode,
  isSimulationTimingDraftValid,
} from "src/lib/simulation-timing-draft";
import {
  buildInitialValues,
  buildUpdatedSettings,
  hasChanges,
} from "./simulation-settings-data";

describe("simulation timing settings mapping", () => {
  it("keeps custom timings when reopening and saving an unrelated edit", () => {
    const timing = {
      duration: 7507,
      hydraulicTimestep: 300,
      reportTimestep: 900,
      patternTimestep: 3600,
      qualityTimestep: 30,
      ruleTimestep: 15,
    };
    const settings = SimulationSettingsBuilder.with().timing(timing).build();
    const initial = buildInitialValues(settings);

    expect(initial).toMatchObject({
      ...timing,
      simulationMode: "eps",
      timingStepCount: "",
      isTimingPresetActive: false,
    });
    expect(hasChanges(initial, settings)).toBe(false);

    const edited = { ...initial, globalDemandMultiplier: 2 };
    expect(hasChanges(edited, settings)).toBe(true);
    const updated = buildUpdatedSettings(edited, settings);
    expect(updated.timing).toEqual(timing);
    expect(updated.globalDemandMultiplier).toBe(2);
    expect(settings.timing).toEqual(timing);
  });

  it("keeps custom steady-state intervals when an unrelated setting changes", () => {
    const timing = {
      duration: 0,
      hydraulicTimestep: 300,
      reportTimestep: 60,
      patternTimestep: 900,
      qualityTimestep: 2,
      ruleTimestep: 1,
    };
    const settings = SimulationSettingsBuilder.with().timing(timing).build();
    const initial = buildInitialValues(settings);

    expect(initial).toMatchObject({ ...timing, simulationMode: "steadyState" });
    expect(hasChanges(initial, settings)).toBe(false);
    const updated = buildUpdatedSettings(
      { ...initial, globalDemandMultiplier: 2 },
      settings,
    );
    expect(updated.timing).toEqual(timing);
  });

  it("applies the fresh Hourly24 draft only when EPS is enabled", () => {
    const settings = SimulationSettingsBuilder.with().build();
    const initial = buildInitialValues(settings);
    expect(initial).toMatchObject({
      simulationMode: "steadyState",
      duration: 0,
      timingPreset: "hourly",
      timingStepCount: "24",
      isTimingPresetActive: true,
    });
    expect(hasChanges(initial, settings)).toBe(false);

    const eps = changeSimulationTimingAnalysisMode(initial, "eps");
    const updated = buildUpdatedSettings(eps, settings);
    expect(updated.timing).toMatchObject({
      duration: 86400,
      hydraulicTimestep: 3600,
      reportTimestep: 3600,
      patternTimestep: 3600,
    });

    const steadyState = changeSimulationTimingAnalysisMode(eps, "steadyState");
    expect(buildUpdatedSettings(steadyState, settings).timing).toEqual({
      ...updated.timing,
      duration: 0,
    });
  });

  it.each([
    ["minutes", "100", 60, 6000],
    ["seconds", "24", 1, 24],
  ] as const)(
    "persists %s preset %s as numeric seconds and restores its draft selection",
    (preset, count, intervalSeconds, durationSeconds) => {
      const settings = SimulationSettingsBuilder.with()
        .timing({ qualityTimestep: 1, ruleTimestep: 1 })
        .globalDemandMultiplier(1.5)
        .build();
      const initial = changeSimulationTimingAnalysisMode(
        buildInitialValues(settings),
        "eps",
      );
      const values = applySimulationTimingPreset(initial, preset, count);
      expect(isSimulationTimingDraftValid(values)).toBe(true);
      expect(hasChanges(values, settings)).toBe(true);

      const updated = buildUpdatedSettings(values, settings);
      expect(updated.timing).toEqual({
        duration: durationSeconds,
        hydraulicTimestep: intervalSeconds,
        reportTimestep: intervalSeconds,
        patternTimestep: intervalSeconds,
        qualityTimestep: 1,
        ruleTimestep: 1,
      });
      expect(updated.globalDemandMultiplier).toBe(1.5);
      expect(buildInitialValues(updated)).toMatchObject({
        simulationMode: "eps",
        timingPreset: preset,
        timingStepCount: count,
        isTimingPresetActive: true,
      });
      expect(hasChanges(buildInitialValues(updated), updated)).toBe(false);
      for (const field of [
        "timingPreset",
        "timingStepCount",
        "isTimingPresetActive",
      ]) {
        expect(updated).not.toHaveProperty(field);
        expect(updated.timing).not.toHaveProperty(field);
      }
    },
  );

  it("keeps invalid preset drafts out of saved timing data", () => {
    const settings = SimulationSettingsBuilder.with().build();
    const initial = changeSimulationTimingAnalysisMode(
      buildInitialValues(settings),
      "eps",
    );
    const valid = applySimulationTimingPreset(initial, "minutes", "100");
    const invalid = applySimulationTimingPreset(valid, "minutes", "0");

    expect(isSimulationTimingDraftValid(invalid)).toBe(false);
    expect(invalid).toMatchObject({
      duration: 6000,
      hydraulicTimestep: 60,
      reportTimestep: 60,
      patternTimestep: 60,
      timingStepCount: "0",
      isTimingPresetActive: true,
    });
    const updated = buildUpdatedSettings(invalid, settings);
    expect(updated.timing).toEqual(
      buildUpdatedSettings(valid, settings).timing,
    );
    for (const field of [
      "timingPreset",
      "timingStepCount",
      "isTimingPresetActive",
    ]) {
      expect(updated).not.toHaveProperty(field);
      expect(updated.timing).not.toHaveProperty(field);
    }
  });
});
