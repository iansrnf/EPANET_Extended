import { useCallback } from "react";
import { useAtomCallback } from "jotai/utils";
import type { Getter, Setter } from "jotai";
import type { HydraulicModel } from "src/hydraulic-model";
import { initializeModelFactories } from "src/hydraulic-model/factories";
import { LabelManager } from "src/hydraulic-model/label-manager";
import { modelFactoriesAtom } from "src/state/model-factories";
import { modelCacheAtom } from "src/state/model-cache";
import { stagingModelAtom, baseModelAtom } from "src/state/hydraulic-model";
import { momentLogAtom } from "src/state/model-changes";
import { mapSyncMomentAtom } from "src/state/map";
import { simulationAtom, simulationResultsAtom } from "src/state/simulation";
import { simulationSettingsAtom } from "src/state/simulation-settings";
import { selectionAtom } from "src/state/selection";
import { projectSettingsAtom } from "src/state/project-settings";
import { getSimulationForState } from "src/lib/worktree";
import type { Worktree } from "src/lib/worktree/types";
import { USelection } from "src/selection";
import type { MomentLog } from "src/lib/persistence/moment-log";
import { prepareSimulation, type ResultsReader } from "./simulation-helpers";

type SimulationState = import("src/state/simulation").SimulationState;

function getModelFromCache(
  get: Getter,
  snapshotId: string,
): { model: HydraulicModel; labelManager: LabelManager } {
  const cache = get(modelCacheAtom);
  const entry = cache.get(snapshotId);
  if (!entry) {
    throw new Error(`Model cache miss for snapshot ${snapshotId}`);
  }
  return entry;
}

function setModelState(
  set: Setter,
  stagingModel: HydraulicModel,
  baseModel: HydraulicModel,
): void {
  set(stagingModelAtom, stagingModel);
  set(baseModelAtom, baseModel);
}

function updateFactories(
  get: Getter,
  set: Setter,
  labelManager: LabelManager,
): void {
  const currentFactories = get(modelFactoriesAtom);
  set(
    modelFactoriesAtom,
    initializeModelFactories({
      idGenerator: currentFactories.idGenerator,
      labelManager,
      defaults: get(projectSettingsAtom).defaults,
      labelCounters: currentFactories.labelCounters,
    }),
  );
}

function switchMomentLog(get: Getter, set: Setter, momentLog: MomentLog): void {
  const current = get(mapSyncMomentAtom);
  set(momentLogAtom, momentLog);
  set(mapSyncMomentAtom, {
    pointer: momentLog.getPointer(),
    version: current.version + 1,
  });
}

function setSimulationState(
  set: Setter,
  simulation: SimulationState,
  resultsReader: ResultsReader,
  simulationSettings: import("src/simulation/simulation-settings").SimulationSettings,
): void {
  set(simulationAtom, simulation);
  set(simulationResultsAtom, resultsReader);
  set(simulationSettingsAtom, simulationSettings);
}

function validateSelection(
  get: Getter,
  set: Setter,
  model: HydraulicModel,
): void {
  const selection = get(selectionAtom);
  const validatedSelection = USelection.clearInvalidIds(
    selection,
    model.assets,
    model.customerPoints,
  );
  set(selectionAtom, { ...validatedSelection });
}

export const useApplySnapshot = () => {
  const applySnapshot = useAtomCallback(
    useCallback(
      async (
        get: Getter,
        set: Setter,
        worktree: Worktree,
        snapshotId: string,
      ) => {
        const snapshot = worktree.snapshots.get(snapshotId);
        if (!snapshot) return;

        const simulation = getSimulationForState(worktree, { status: "idle" });
        const { finalSimulation, resultsReader } = await prepareSimulation(
          get,
          simulation,
          snapshot.simulationSourceId,
        );
        const stagingModel = getModelFromCache(get, snapshotId);
        const baseModel = getModelFromCache(get, worktree.mainId);

        setModelState(set, stagingModel.model, baseModel.model);
        updateFactories(get, set, stagingModel.labelManager);
        switchMomentLog(get, set, snapshot.momentLog);
        setSimulationState(
          set,
          finalSimulation,
          resultsReader,
          snapshot.simulationSettings,
        );
        validateSelection(get, set, stagingModel.model);
      },
      [],
    ),
  );

  return { applySnapshot };
};
