import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import { presets } from "@epanet-js/project-settings";
import { runSimulation } from "@epanet-js/simulation/engine";
import { patchEpanetLoader } from "src/__helpers__/epanet-loader";
import { SimulationSettingsBuilder } from "src/__helpers__/simulation-settings-builder";
import { InMemoryStorage } from "src/infra/storage";
import { EPSResultsReader } from "src/simulation";
import { buildInp } from "src/simulation/build-inp";
import { setSimulationClockTime } from "./simulation-clock-time";

describe("simulation clock time input", () => {
  it("adds the selected local hours minutes and seconds without changing timing", () => {
    const inp = "[TIMES]\nDuration\t24\nReport Timestep\t1\n[END]\n";

    const updated = setSimulationClockTime(
      inp,
      new Date(2026, 10, 19, 14, 23, 45).getTime(),
    );

    expect(updated).toBe(
      "[TIMES]\nStart Clocktime\t14:23:45\nDuration\t24\nReport Timestep\t1\n[END]\n",
    );
  });

  it("replaces an existing clock while preserving report start and line endings", () => {
    const inp =
      "[TIMES]\r\nStart Clocktime\t0\r\nReport Start\t0:30\r\n[END]\r\n";

    const updated = setSimulationClockTime(
      inp,
      new Date(2026, 10, 19, 8, 5, 6).getTime(),
    );

    expect(updated).toBe(
      "[TIMES]\r\nStart Clocktime\t08:05:06\r\nReport Start\t0:30\r\n[END]\r\n",
    );
  });

  it("rejects an invalid start or missing timing section", () => {
    expect(() => setSimulationClockTime("[TIMES]\n", NaN)).toThrow(RangeError);
    expect(() => setSimulationClockTime("[END]\n", Date.now())).toThrow(
      "TIMES section",
    );
  });
});

describe("simulation clock time controls", () => {
  beforeAll(() => patchEpanetLoader());

  it.each([
    [45, "closed"],
    [0, "open"],
  ] as const)(
    "starts the engine at the selected second %s",
    async (seconds, status) => {
      const IDS = { R1: 1, J1: 2, P1: 3, P2: 4 } as const;
      const hydraulicModel = HydraulicModelBuilder.with()
        .aReservoir(IDS.R1, { head: 100 })
        .aJunction(IDS.J1, { elevation: 0 })
        .aJunctionDemand(IDS.J1, [{ baseDemand: 1 }])
        .aPipe(IDS.P1, {
          startNodeId: IDS.R1,
          endNodeId: IDS.J1,
          length: 100,
          diameter: 100,
          roughness: 100,
        })
        .aPipe(IDS.P2, {
          startNodeId: IDS.R1,
          endNodeId: IDS.J1,
          length: 200,
          diameter: 100,
          roughness: 100,
        })
        .aSimpleControl({
          template: "LINK {{0}} CLOSED AT CLOCKTIME 8:00 AM",
          assetReferences: [{ assetId: IDS.P1, isActionTarget: true }],
        })
        .build();
      const settings = SimulationSettingsBuilder.with()
        .timing({
          duration: 30,
          hydraulicTimestep: 10,
          reportTimestep: 10,
        })
        .build();
      const inp = setSimulationClockTime(
        buildInp(hydraulicModel, {
          units: presets.LPS.units,
          simulationSettings: settings,
        }),
        new Date(2026, 10, 19, 7, 59, seconds).getTime(),
      );
      const storage = new InMemoryStorage("clock-time-test");

      const result = await runSimulation(inp, {
        store: storage,
        onProgress: () => undefined,
      });

      expect(result.status).toBe("success");
      const reader = new EPSResultsReader(storage);
      await reader.initialize(result.metadata);
      const initial = await reader.getResultsForTimestep(0);
      const afterTwentySeconds = await reader.getResultsForTimestep(2);
      expect(initial.getPipe(IDS.P1)?.status).toBe("open");
      expect(afterTwentySeconds.getPipe(IDS.P1)?.status).toBe(status);
    },
  );
});
