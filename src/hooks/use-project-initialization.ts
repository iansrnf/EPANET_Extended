import { useCallback } from "react";
import { useAtomCallback } from "jotai/utils";
import type { Getter, Setter } from "jotai";
import type { HydraulicModel } from "src/hydraulic-model";
import type { ModelFactories } from "src/hydraulic-model/factories";
import type { IdGenerator } from "src/lib/id-generator";
import type { ProjectSettings } from "src/lib/project-settings";
import type { SimulationSettings } from "src/simulation/simulation-settings";
import type { Moment } from "src/lib/persistence/moment";
import { MomentLog } from "src/lib/persistence/moment-log";
import { initializeWorktree } from "src/lib/worktree";
import { toDemandAssignments } from "src/hydraulic-model/model-operation";
import { stagingModelAtom, baseModelAtom } from "src/state/hydraulic-model";
import { modelFactoriesAtom } from "src/state/model-factories";
import { projectSettingsAtom } from "src/state/project-settings";
import { momentLogAtom } from "src/state/model-changes";
import { simulationSettingsAtom } from "src/state/simulation-settings";
import { worktreeAtom } from "src/state/scenarios";
import {
  simulationAtom,
  initialSimulationState,
  simulationResultsAtom,
} from "src/state/simulation";
import { splitsAtom, defaultSplits } from "src/state/layout";
import { dataAtom, nullData } from "src/state/data";
import { mapSyncMomentAtom } from "src/state/map";
import {
  nodeSymbologyAtom,
  linkSymbologyAtom,
  savedSymbologiesAtom,
  symbologyColorPreferencesAtom,
  defaultSymbologyColorPreferences,
} from "src/state/map-symbology";
import { nullSymbologySpec } from "src/map/symbology";
import { modeAtom, Mode } from "src/state/mode";
import {
  ephemeralStateAtom,
  pipeDrawingDefaultsAtom,
  autoElevationsAtom,
} from "src/state/drawing";
import { selectionAtom } from "src/state/selection";

type InitializeProjectInput = {
  hydraulicModel: HydraulicModel;
  factories: ModelFactories;
  idGenerator: IdGenerator;
  projectSettings: ProjectSettings;
  name: string;
  simulationSettings: SimulationSettings;
  autoElevations?: boolean;
};

const resetAppState = (
  set: Setter,
  simulationSettings: SimulationSettings,
  autoElevations?: boolean,
) => {
  set(splitsAtom, defaultSplits);
  set(dataAtom, {
    ...nullData,
    folderMap: new Map(),
  });
  set(mapSyncMomentAtom, { pointer: -1, version: 0 });
  set(simulationAtom, initialSimulationState);
  set(simulationResultsAtom, null);
  set(nodeSymbologyAtom, nullSymbologySpec.node);
  set(linkSymbologyAtom, nullSymbologySpec.link);
  set(savedSymbologiesAtom, new Map());
  set(symbologyColorPreferencesAtom, defaultSymbologyColorPreferences);
  set(modeAtom, { mode: Mode.NONE });
  set(ephemeralStateAtom, { type: "none" });
  set(selectionAtom, { type: "none" });
  set(pipeDrawingDefaultsAtom, {});
  set(autoElevationsAtom, autoElevations ?? true);
  set(simulationSettingsAtom, simulationSettings);
};

const loadModel = (
  set: Setter,
  {
    hydraulicModel,
    factories,
    idGenerator,
    projectSettings,
    name,
    simulationSettings,
  }: InitializeProjectInput,
) => {
  const assets = [...hydraulicModel.assets.values()];

  const snapshotMoment: Moment = {
    note: `Import ${name}`,
    putAssets: assets,
    deleteAssets: [],
    patchAssetsAttributes: [],
    putDemands: {
      assignments: toDemandAssignments(hydraulicModel.demands),
    },
    putControls: hydraulicModel.controls,
    putCustomerPoints: [...hydraulicModel.customerPoints.values()],
    putPressureLoggers: [...hydraulicModel.pressureLoggers.values()],
    putCurves: hydraulicModel.curves,
    putPatterns: hydraulicModel.patterns,
  };

  hydraulicModel.pressureLoggers.forEach((pressureLogger) => {
    factories.labelManager.register(
      pressureLogger.label,
      "pressureLogger",
      pressureLogger.id,
    );
  });

  const momentLog = new MomentLog();
  momentLog.setSnapshot(snapshotMoment, hydraulicModel.version);

  set(stagingModelAtom, hydraulicModel);
  set(baseModelAtom, hydraulicModel);
  set(modelFactoriesAtom, factories);
  set(projectSettingsAtom, projectSettings);
  set(momentLogAtom, momentLog);

  const labelCounters = new Map();
  factories.labelManager.adoptCounters(labelCounters);
  set(
    worktreeAtom,
    initializeWorktree({
      snapshotMoment,
      momentLog,
      version: hydraulicModel.version,
      simulationSettings,
      labelCounters,
      idGenerator,
    }),
  );
};

export const useProjectInitialization = () => {
  const initializeProject = useAtomCallback(
    useCallback((_get: Getter, set: Setter, input: InitializeProjectInput) => {
      resetAppState(set, input.simulationSettings, input.autoElevations);
      loadModel(set, input);
    }, []),
  );

  return { initializeProject };
};
