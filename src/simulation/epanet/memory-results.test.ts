import { MessageChannel } from "node:worker_threads";
import * as Comlink from "comlink";
import { type Mock } from "vitest";
import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import { presets } from "@epanet-js/project-settings";
import { SimulationSettingsBuilder } from "src/__helpers__/simulation-settings-builder";
import { patchEpanetLoader } from "src/__helpers__/epanet-loader";
import { InMemoryStorage } from "src/infra/storage";
import { lib } from "src/lib/worker";
import { buildInp } from "../build-inp";
import { EPSResultsReader } from "./eps-results-reader";
import { cancelSimulation, runSimulation } from "./main";
import {
  runSimulation as workerRunSimulation,
  resetSimulationWorkerForTest,
  RESULTS_OUT_KEY,
  TANK_VOLUMES_KEY,
} from "./worker";

vi.mock("src/lib/worker", () => ({
  lib: { runSimulation: vi.fn() },
}));

vi.mock("src/infra/error-tracking", () => ({
  captureError: vi.fn(),
  captureWarning: vi.fn(),
}));

const IDS = { reservoir: 1, junction: 2, pipe: 3 } as const;

describe("simulation without browser storage", () => {
  let channel: MessageChannel;

  beforeAll(() => patchEpanetLoader());

  beforeEach(() => {
    channel = new MessageChannel();
    Comlink.expose(
      {
        runSimulation: async (
          ...args: Parameters<typeof workerRunSimulation>
        ) => {
          try {
            return await workerRunSimulation(...args);
          } finally {
            (args[2] as Partial<Comlink.ProxyMethods>)[
              Comlink.releaseProxy
            ]?.();
          }
        },
      },
      channel.port1 as unknown as Comlink.Endpoint,
    );
    const remote = Comlink.wrap<{ runSimulation: typeof workerRunSimulation }>(
      channel.port2 as unknown as Comlink.Endpoint,
    );
    (lib.runSimulation as unknown as Mock).mockImplementation(
      (...args: Parameters<typeof workerRunSimulation>) =>
        remote.runSimulation(...args),
    );
  });

  afterEach(() => {
    channel.port1.close();
    channel.port2.close();
    resetSimulationWorkerForTest();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("reads worker results and time series from memory", async () => {
    const storage = new InMemoryStorage("memory-run", { shared: false });
    const result = await runWithStorage(buildNetwork(), storage);

    expect(result.status).toBe("success");
    const reader = new EPSResultsReader(storage);
    await reader.initialize(result.metadata);

    const step = await reader.getResultsForTimestep(2);
    const junction = step.getJunction(IDS.junction);
    const series = await reader.getTimeSeries(
      IDS.junction,
      "junction",
      "pressure",
    );

    expect(reader.timestepCount).toBe(3);
    expect(junction?.pressure).toBeGreaterThan(0);
    expect(step.getPipe(IDS.pipe)?.flow).toBeCloseTo(10);
    expect(series?.intervalsCount).toBe(3);
    expect(series?.values[2]).toBeCloseTo(junction!.pressure);
    await reader.dispose();
    expect(storage.getCount()).toBe(0);
  });

  it("keeps consecutive direct runs independent", async () => {
    (lib.runSimulation as unknown as Mock).mockImplementation(
      workerRunSimulation,
    );
    const firstStorage = new InMemoryStorage("same-run", { shared: false });
    const secondStorage = new InMemoryStorage("same-run", { shared: false });
    const first = await runWithStorage(buildNetwork(100), firstStorage);
    const second = await runWithStorage(buildNetwork(80), secondStorage);

    expect(first.status).toBe("success");
    expect(second.status).toBe("success");
    const firstReader = new EPSResultsReader(firstStorage);
    const secondReader = new EPSResultsReader(secondStorage);
    await firstReader.initialize(first.metadata);
    await secondReader.initialize(second.metadata);
    const firstStep = await firstReader.getResultsForTimestep(0);
    const secondStep = await secondReader.getResultsForTimestep(0);

    expect(
      firstStep.getJunction(IDS.junction)!.head -
        secondStep.getJunction(IDS.junction)!.head,
    ).toBeCloseTo(20);

    await firstReader.dispose();
    expect(firstStorage.getCount()).toBe(0);
    expect(
      (await secondReader.getResultsForTimestep(1)).getPipe(IDS.pipe)?.flow,
    ).toBeCloseTo(10);
    await secondReader.dispose();
  });

  it("releases partial results when saving fails", async () => {
    const storage = new InMemoryStorage("failed-run", { shared: false });
    const save = storage.save.bind(storage);
    let hadPartialResults = false;
    vi.spyOn(storage, "save").mockImplementation((key, data) => {
      if (key === TANK_VOLUMES_KEY) {
        hadPartialResults = storage.has(RESULTS_OUT_KEY);
        return Promise.reject(new Error("Could not retain results"));
      }
      return save(key, data);
    });

    const result = await runWithStorage(buildNetwork(), storage);

    expect(result).toMatchObject({ status: "failure", errorKind: "storage" });
    expect(hadPartialResults).toBe(true);
    expect(storage.getCount()).toBe(0);
  });

  it("releases retained results when cancelled", async () => {
    const storage = new InMemoryStorage("cancelled-run", { shared: false });
    await storage.save(RESULTS_OUT_KEY, new ArrayBuffer(16));

    const result = await runSimulation(
      buildNetwork(),
      "memory-app",
      () => cancelSimulation(),
      {},
      "scenario",
      "cancelled-run",
      storage,
    );

    expect(result.status).toBe("stopped");
    expect(storage.getCount()).toBe(0);
  });
});

const runWithStorage = (inp: string, storage: InMemoryStorage) =>
  runSimulation(inp, "memory-app", undefined, {}, "scenario", "run", storage);

const buildNetwork = (head = 100) => {
  const hydraulicModel = HydraulicModelBuilder.with()
    .aReservoir(IDS.reservoir, { head })
    .aJunction(IDS.junction, { elevation: 10 })
    .aJunctionDemand(IDS.junction, [{ baseDemand: 10 }])
    .aPipe(IDS.pipe, {
      startNodeId: IDS.reservoir,
      endNodeId: IDS.junction,
      length: 1000,
      diameter: 300,
      roughness: 130,
    })
    .build();
  return buildInp(hydraulicModel, {
    units: presets.LPS.units,
    simulationSettings: SimulationSettingsBuilder.with()
      .timing({ duration: 7200, hydraulicTimestep: 3600 })
      .build(),
  });
};
