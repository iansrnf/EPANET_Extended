import { useCallback } from "react";
import type { Getter, Setter } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { nanoid } from "nanoid";
import { useSimulationSettingsTransaction } from "src/hooks/persistence/use-simulation-settings-transaction";
import {
  buildSimulationTimingPreset,
  DEFAULT_SIMULATION_TIMING_STEPS,
  inferSimulationTimingPreset,
  isSimulationTimingStepCountValid,
  type SimulationTimingPreset,
} from "src/lib/simulation-timing-presets";
import { simulationSettingsDerivedAtom } from "src/state/derived-branch-state";
import { hasScenariosAtom } from "src/state/scenarios";
import {
  simulationPreviewStepAtom,
  simulationStartDateTimeAtom,
} from "src/state/simulation-timeline";
import { useTogglePlayback } from "./toggle-playback";

export const useChangeSimulationTimeline = () => {
  const { stopPlayback } = useTogglePlayback();
  const { transact } = useSimulationSettingsTransaction();

  const changeStartDateTime = useAtomCallback(
    useCallback(
      (_get: Getter, set: Setter, date: Date): boolean => {
        const timestamp = date.getTime();
        if (!Number.isFinite(timestamp)) return false;
        stopPlayback("calendar");
        set(simulationStartDateTimeAtom, Math.floor(timestamp / 1000) * 1000);
        set(simulationPreviewStepAtom, 0);
        return true;
      },
      [stopPlayback],
    ),
  );

  const changeTimingPreset = useAtomCallback(
    useCallback(
      (get: Getter, set: Setter, preset: SimulationTimingPreset): boolean => {
        if (get(hasScenariosAtom)) return false;
        const settings = get(simulationSettingsDerivedAtom);
        const inferredSteps = inferSimulationTimingPreset(
          settings.timing,
        ).totalSteps;
        const totalSteps = isSimulationTimingStepCountValid(
          preset,
          inferredSteps,
        )
          ? inferredSteps
          : DEFAULT_SIMULATION_TIMING_STEPS;
        const timing = buildSimulationTimingPreset(preset, totalSteps);
        stopPlayback("calendar");
        const applied = transact({
          ...settings,
          version: nanoid(),
          timing: { ...settings.timing, ...timing },
        });
        if (applied) set(simulationPreviewStepAtom, 0);
        return applied;
      },
      [stopPlayback, transact],
    ),
  );

  const changePreviewStep = useAtomCallback(
    useCallback(
      (
        _get: Getter,
        set: Setter,
        index: number,
        timestepCount: number,
      ): boolean => {
        if (
          !Number.isFinite(index) ||
          !Number.isSafeInteger(timestepCount) ||
          timestepCount < 1
        )
          return false;
        stopPlayback("timeline");
        set(
          simulationPreviewStepAtom,
          Math.max(0, Math.min(timestepCount - 1, Math.round(index))),
        );
        return true;
      },
      [stopPlayback],
    ),
  );

  return { changeStartDateTime, changeTimingPreset, changePreviewStep };
};
