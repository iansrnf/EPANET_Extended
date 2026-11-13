import {
  runSimulation as runEngineSimulation,
  type EngineProgressCallback,
  type EPSSimulationResult,
} from "@epanet-js/simulation/engine";
import { OPFSStorage } from "src/infra/storage";
import type { IKeyBufferStore } from "@epanet-js/simulation";
import * as Comlink from "comlink";

export type SimulationResultsWriter = IKeyBufferStore["save"];

export {
  RESULTS_OUT_KEY,
  TANK_VOLUMES_KEY,
  PUMP_STATUS_KEY,
  NODE_STATS_KEY,
} from "@epanet-js/simulation";
export {
  warmupSimulationEngine,
  resetSimulationWorkerForTest,
  type EPSSimulationResult,
  type SimulationProgress,
  type ProgressCallback,
} from "@epanet-js/simulation/engine";

export const runSimulation = async (
  inp: string,
  appId: string,
  onProgress: EngineProgressCallback,
  flags: Record<string, boolean> = {},
  scenarioKey?: string,
  runId?: string,
  saveResults?: SimulationResultsWriter,
): Promise<EPSSimulationResult> => {
  try {
    return await runEngineSimulation(inp, {
      store: saveResults
        ? {
            save: (key, data) =>
              saveResults(key, Comlink.transfer(data, [data])),
          }
        : new OPFSStorage(appId, scenarioKey, runId),
      onProgress,
      flags,
    });
  } finally {
    (saveResults as Partial<Comlink.ProxyMethods> | undefined)?.[
      Comlink.releaseProxy
    ]?.();
  }
};
