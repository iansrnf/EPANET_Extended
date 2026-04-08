import type { MomentLog } from "src/lib/persistence/moment-log";
import type { ModelMoment } from "src/hydraulic-model/model-operation";
import type { IdGenerator } from "src/lib/id-generator";
import type { SimulationSettings } from "src/simulation/simulation-settings";
import { initialSimulationState } from "src/state/simulation";
import type { Snapshot, Worktree } from "./types";

type InitializeWorktreeInput = {
  snapshotMoment: ModelMoment;
  momentLog: MomentLog;
  version: string;
  simulationSettings: SimulationSettings;
  labelCounters: Worktree["labelCounters"];
  idGenerator: IdGenerator;
};

export const initializeWorktree = ({
  snapshotMoment,
  momentLog,
  version,
  simulationSettings,
  labelCounters,
  idGenerator,
}: InitializeWorktreeInput): Worktree => {
  const mainSnapshot: Snapshot = {
    id: "main",
    name: "Main",
    parentId: null,
    deltas: [snapshotMoment],
    version,
    momentLog,
    simulation: initialSimulationState,
    simulationSourceId: "main",
    simulationSettings,
    status: "open",
  };

  return {
    activeSnapshotId: "main",
    lastActiveSnapshotId: "main",
    snapshots: new Map([["main", mainSnapshot]]),
    mainId: "main",
    scenarios: [],
    highestScenarioNumber: 0,
    labelCounters,
    idGenerator,
  };
};
