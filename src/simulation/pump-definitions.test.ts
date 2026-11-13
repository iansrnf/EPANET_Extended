import {
  changePumpDefinitionHeadType,
  createDefaultPumpDefinition,
  getPumpDefinitionHeadPoints,
  getPumpDefinitionWireEfficiencyPoints,
  pumpDefinitionHeadTypes,
  type Pump,
} from "@epanet-js/hydraulic-model";
import {
  HydraulicModelBuilder,
  buildTestFactories,
} from "@epanet-js/hydraulic-model-testing";
import { ConsecutiveIdsGenerator } from "@epanet-js/id-generator";
import {
  applyChangeSet,
  changePumpDefinitions,
} from "@epanet-js/hydraulic-model-operations";
import { presets } from "@epanet-js/project-settings";
import {
  runSimulation,
  resetSimulationWorkerForTest,
} from "@epanet-js/simulation/engine";
import { EPSResultsReader } from "./epanet/eps-results-reader";
import { InMemoryStorage } from "src/infra/storage";
import { patchEpanetLoader } from "src/__helpers__/epanet-loader";
import { SimulationSettingsBuilder } from "src/__helpers__/simulation-settings-builder";
import { buildInp } from "./build-inp";

const IDS = { RESERVOIR: 1, JUNCTION: 2, PUMP: 3 } as const;

beforeAll(() => patchEpanetLoader());
afterEach(() => {
  resetSimulationWorkerForTest();
  InMemoryStorage.resetAll();
});

it.each(pumpDefinitionHeadTypes)(
  "simulates the %s definition using the plotted curve",
  async (type) => {
    const { model, definition, inp } = network(type);
    const store = new InMemoryStorage(`pump-definition-${type}`);
    const result = await runSimulation(inp, { store, onProgress: () => {} });
    expect(result.status).toBe("success");
    const reader = new EPSResultsReader(store);
    await reader.initialize();
    const flow = await reader.getTimeSeries(IDS.PUMP, "pump", "flow");
    expect(flow?.values[0]).toBeCloseTo(5, 4);
    if (type !== "power") {
      const pump = model.assets.get(IDS.PUMP) as Pump;
      expect(model.curves.get(pump.curveId!)?.points).toEqual(
        getPumpDefinitionHeadPoints(definition),
      );
      const head = await reader.getTimeSeries(IDS.PUMP, "pump", "head");
      expect(head?.values[0]).toBeGreaterThan(0);
    }
  },
);

it.each([0.8, 1.2])(
  "uses separate pump, motor, and drive efficiencies at fixed speed %s",
  async (speed) => {
    const { definition, inp } = network("standard", speed);
    const store = new InMemoryStorage(`pump-efficiency-${speed}`);
    const result = await runSimulation(inp, { store, onProgress: () => {} });
    expect(result.status).toBe("success");
    const reader = new EPSResultsReader(store);
    await reader.initialize();
    const expected = getPumpDefinitionWireEfficiencyPoints(definition, speed)[0]
      .y;
    const results = await reader.getResultsForTimestep(0);
    expect(results.getPumpEnergy(IDS.PUMP)?.averageEfficiency).toBeCloseTo(
      expected,
      3,
    );
  },
);

it("simulates a fitted multipoint curve using its sampled head values", async () => {
  const { inp } = network("multiplePoint", 1, "fitted");
  const store = new InMemoryStorage("pump-definition-fitted");
  const result = await runSimulation(inp, { store, onProgress: () => {} });
  expect(result.status).toBe("success");
  const reader = new EPSResultsReader(store);
  await reader.initialize();
  const head = await reader.getTimeSeries(IDS.PUMP, "pump", "head");
  expect(head?.values[0]).toBeCloseTo(47.5, 3);
});

function network(
  type: (typeof pumpDefinitionHeadTypes)[number],
  speed = 1,
  interpolation?: "linear" | "fitted",
) {
  const { labelManager } = buildTestFactories();
  const model = HydraulicModelBuilder.with({ labelManager })
    .aReservoir(IDS.RESERVOIR, { head: 0 })
    .aJunction(IDS.JUNCTION, { elevation: 0 })
    .aJunctionDemand(IDS.JUNCTION, [{ baseDemand: 5 }])
    .aPump(IDS.PUMP, {
      startNodeId: IDS.RESERVOIR,
      endNodeId: IDS.JUNCTION,
      initialStatus: "on",
      speed,
    })
    .build();
  const definition = changePumpDefinitionHeadType(
    createDefaultPumpDefinition("test", "Test pump"),
    type,
  );
  definition.head.interpolation = interpolation;
  definition.efficiency.value = 80;
  definition.motor.efficiency = 90;
  definition.motor.variableSpeedDrive = true;
  definition.motor.points = [
    { x: 0.5, y: 90 },
    { x: 1, y: 95 },
    { x: 1.5, y: 97 },
  ];
  const change = changePumpDefinitions(model, {
    definitions: [definition],
    assignment: { pumpId: IDS.PUMP, definitionId: definition.id },
    curveIds: new ConsecutiveIdsGenerator(),
  });
  applyChangeSet(model, change, "forward", labelManager);
  const inp = buildInp(model, {
    units: presets.LPS.units,
    simulationSettings: SimulationSettingsBuilder.with()
      .timing({ duration: 3600 })
      .build(),
  });
  return { model, definition, inp };
}
