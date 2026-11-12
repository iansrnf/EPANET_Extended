import type { Timing } from "src/simulation/simulation-settings";
import {
  buildSimulationTimingPreset,
  DEFAULT_SIMULATION_TIMING_STEPS,
  getSimulationTimingPresetSeconds,
  inferSimulationTimingPreset,
  isSimulationTimingStepCountValid,
  type SimulationTimingPreset,
} from "./simulation-timing-presets";

export type SimulationTimingDraftFields = {
  timingPreset: SimulationTimingPreset;
  timingStepCount: string;
  isTimingPresetActive: boolean;
};

type SimulationTimingDraft = Partial<Timing> &
  SimulationTimingDraftFields & {
    simulationMode: "steadyState" | "eps";
  };

type TimingIntervalField =
  "hydraulicTimestep" | "reportTimestep" | "patternTimestep";

export const createSimulationTimingDraftFields = (
  timing: Partial<Timing>,
): SimulationTimingDraftFields => {
  const { preset } = inferSimulationTimingPreset(timing);
  const seconds = getSimulationTimingPresetSeconds(preset);
  const stepCount =
    timing.duration === 0
      ? DEFAULT_SIMULATION_TIMING_STEPS
      : (timing.duration ?? 0) / seconds;
  const isTimingPresetActive =
    timing.hydraulicTimestep === seconds &&
    timing.reportTimestep === seconds &&
    timing.patternTimestep === seconds &&
    isSimulationTimingStepCountValid(preset, stepCount);
  return {
    timingPreset: preset,
    timingStepCount: isTimingPresetActive ? String(stepCount) : "",
    isTimingPresetActive,
  };
};

export const applySimulationTimingPreset = <T extends SimulationTimingDraft>(
  values: T,
  preset: SimulationTimingPreset,
  stepCount?: string,
): T => {
  const timingStepCount =
    stepCount ??
    (values.timingStepCount.trim() || String(DEFAULT_SIMULATION_TIMING_STEPS));
  const next = {
    ...values,
    timingPreset: preset,
    timingStepCount,
    isTimingPresetActive: true,
  };
  const count = parseStepCount(timingStepCount);
  return isSimulationTimingStepCountValid(preset, count)
    ? { ...next, ...buildSimulationTimingPreset(preset, count) }
    : next;
};

export const changeSimulationTimingDuration = <T extends SimulationTimingDraft>(
  values: T,
  duration: number | undefined,
): T => refreshTimingDraft({ ...values, duration });

export const changeSimulationTimingInterval = <T extends SimulationTimingDraft>(
  values: T,
  field: TimingIntervalField,
  value: number | undefined,
): T => refreshTimingDraft({ ...values, [field]: value });

export const changeSimulationTimingAnalysisMode = <
  T extends SimulationTimingDraft,
>(
  values: T,
  simulationMode: "steadyState" | "eps",
): T => {
  const next = { ...values, simulationMode };
  if (simulationMode === "steadyState" || (values.duration ?? 0) > 0)
    return next;
  return values.isTimingPresetActive
    ? applySimulationTimingPreset(next, values.timingPreset)
    : {
        ...next,
        duration: DEFAULT_SIMULATION_TIMING_STEPS * 3600,
      };
};

export const isSimulationTimingDraftValid = (
  values: SimulationTimingDraft,
): boolean =>
  values.simulationMode !== "eps" ||
  !values.isTimingPresetActive ||
  isSimulationTimingStepCountValid(
    values.timingPreset,
    parseStepCount(values.timingStepCount),
  );

const refreshTimingDraft = <T extends SimulationTimingDraft>(values: T): T => {
  const fields = createSimulationTimingDraftFields(values);
  return {
    ...values,
    ...fields,
    timingPreset: fields.isTimingPresetActive
      ? fields.timingPreset
      : values.timingPreset,
  };
};

const parseStepCount = (value: string): number =>
  /^\d+$/.test(value.trim()) ? Number(value) : NaN;
