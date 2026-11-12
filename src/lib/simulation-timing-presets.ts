import type { Timing } from "src/simulation/simulation-settings";

export type SimulationTimingPreset = "hourly" | "minutes" | "seconds";

export type SimulationTimingPresetSelection = {
  preset: SimulationTimingPreset;
  totalSteps: number;
};

type PresetTiming = Pick<
  Timing,
  "duration" | "hydraulicTimestep" | "reportTimestep" | "patternTimestep"
>;

export const DEFAULT_SIMULATION_TIMING_STEPS = 24;
export const MAX_SIMULATION_DURATION_SECONDS = 2_147_483_647;
const MAX_SIMULATION_REPORT_COUNT = 2_147_483_647;

const presetSeconds: Record<SimulationTimingPreset, number> = {
  hourly: 3600,
  minutes: 60,
  seconds: 1,
};

export const getSimulationTimingPresetSeconds = (
  preset: SimulationTimingPreset,
): number => presetSeconds[preset];

export const getSimulationTimingPresetMaximumSteps = (
  preset: SimulationTimingPreset,
): number =>
  Math.min(
    Math.floor(
      MAX_SIMULATION_DURATION_SECONDS /
        getSimulationTimingPresetSeconds(preset),
    ),
    MAX_SIMULATION_REPORT_COUNT - 1,
  );

export const isSimulationTimingStepCountValid = (
  preset: SimulationTimingPreset,
  totalSteps: number,
): boolean =>
  Number.isSafeInteger(totalSteps) &&
  totalSteps > 0 &&
  totalSteps <= getSimulationTimingPresetMaximumSteps(preset);

export const buildSimulationTimingPreset = (
  preset: SimulationTimingPreset,
  totalSteps = DEFAULT_SIMULATION_TIMING_STEPS,
): PresetTiming => {
  if (!isSimulationTimingStepCountValid(preset, totalSteps))
    throw new RangeError("invalidSimulationTimingStepCount");
  const seconds = getSimulationTimingPresetSeconds(preset);
  return {
    duration: totalSteps * seconds,
    hydraulicTimestep: seconds,
    reportTimestep: seconds,
    patternTimestep: seconds,
  };
};

export const inferSimulationTimingPreset = (
  timing: Partial<Timing>,
): SimulationTimingPresetSelection => {
  const preset =
    (Object.keys(presetSeconds) as SimulationTimingPreset[]).find(
      (candidate) => presetSeconds[candidate] === timing.reportTimestep,
    ) ?? "hourly";
  const totalSteps =
    (timing.duration ?? 0) / getSimulationTimingPresetSeconds(preset);
  return {
    preset,
    totalSteps: isSimulationTimingStepCountValid(preset, totalSteps)
      ? totalSteps
      : DEFAULT_SIMULATION_TIMING_STEPS,
  };
};

export const formatSimulationTimingDuration = (seconds: number): string => {
  if (
    !Number.isSafeInteger(seconds) ||
    seconds < 0 ||
    seconds > MAX_SIMULATION_DURATION_SECONDS
  )
    throw new RangeError("invalidSimulationTimingDuration");
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
};
