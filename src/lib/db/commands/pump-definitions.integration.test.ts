import { describe, expect, it } from "vitest";
import {
  createDefaultPumpDefinition,
  type Pump,
} from "@epanet-js/hydraulic-model";
import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import { defaultProjectSettings } from "@epanet-js/project-settings";
import { withTransaction } from "@epanet-js/ejsdb/worker-api";
import {
  applyChangeSet,
  changeSet,
  setAsset,
  setPumpDefinitions,
} from "@epanet-js/hydraulic-model-operations";
import { defaultSimulationSettings } from "src/simulation/simulation-settings";
import { useInProcessDb } from "../__test-helpers__/in-process-db";
import { applyChangeSetToDb } from "./apply-change-set";
import { exportDb } from "./export-db";
import { fetchProject } from "./fetch-project";
import { importProject } from "./import-project";
import { openProject } from "./open-project";

describe("pump definition persistence", () => {
  useInProcessDb();

  it("saves shared definitions and restores assignments through undo", async () => {
    const IDS = { J1: 1, J2: 2, PU1: 3, PU2: 4 } as const;
    const builder = HydraulicModelBuilder.with()
      .aJunction(IDS.J1)
      .aJunction(IDS.J2)
      .aPump(IDS.PU1, { startNodeId: IDS.J1, endNodeId: IDS.J2 })
      .aPump(IDS.PU2, { startNodeId: IDS.J1, endNodeId: IDS.J2 });
    const model = builder.build();
    await importProject({
      newDb: true,
      hydraulicModel: model,
      projectSettings: defaultProjectSettings,
      simulationSettings: defaultSimulationSettings,
    });

    const definition = createDefaultPumpDefinition("1", "Shared booster");
    definition.head.type = "customExtended";
    definition.head.extendedFlow = 25;
    definition.efficiency.type = "bep";
    definition.efficiency.maxFlow = 24;
    definition.motor.variableSpeedDrive = true;
    definition.notes = "Manufacturer curve";
    const change = changeSet(model, "changeProperty", [
      setPumpDefinitions([definition]),
      setAsset([IDS.PU1, IDS.PU2], { pumpDefinitionId: definition.id }),
    ]);

    await applyChangeSetToDb(change, "forward");
    const saved = await fetchProject();
    expect(saved.hydraulicModel.pumpDefinitions).toEqual([definition]);
    for (const id of [IDS.PU1, IDS.PU2]) {
      expect(
        (saved.hydraulicModel.assets.get(id) as Pump).pumpDefinitionId,
      ).toBe(definition.id);
    }

    applyChangeSet(model, change, "forward", saved.factories.labelManager);
    expect(model.pumpDefinitions).toEqual([definition]);
    applyChangeSet(model, change, "reverse", saved.factories.labelManager);
    expect(model.pumpDefinitions).toEqual([]);
    expect(
      (model.assets.get(IDS.PU1) as Pump).pumpDefinitionId,
    ).toBeUndefined();
    await applyChangeSetToDb(change, "reverse");
    const undone = await fetchProject();
    expect(undone.hydraulicModel.pumpDefinitions).toEqual([]);
    expect(
      (undone.hydraulicModel.assets.get(IDS.PU1) as Pump).pumpDefinitionId,
    ).toBeUndefined();

    await applyChangeSetToDb(change, "forward");
    const blob = await exportDb();
    expect(
      (await openProject(new File([blob], "pump-definitions.epnt"))).status,
    ).toBe("ok");
    const reopened = await fetchProject();
    expect(reopened.hydraulicModel.pumpDefinitions).toEqual([definition]);
    expect(
      (reopened.hydraulicModel.assets.get(IDS.PU2) as Pump).pumpDefinitionId,
    ).toBe(definition.id);

    await importProject({
      newDb: true,
      hydraulicModel: reopened.hydraulicModel,
      projectSettings: defaultProjectSettings,
      simulationSettings: defaultSimulationSettings,
    });
    expect((await fetchProject()).hydraulicModel.pumpDefinitions).toEqual([
      definition,
    ]);
  });

  it("migrates previous projects with empty definitions and keeps their pumps", async () => {
    const IDS = { J1: 1, J2: 2, PU1: 3 } as const;
    const model = HydraulicModelBuilder.with()
      .aJunction(IDS.J1)
      .aJunction(IDS.J2)
      .aPump(IDS.PU1, {
        startNodeId: IDS.J1,
        endNodeId: IDS.J2,
        definitionType: "power",
        power: 25,
      })
      .build();
    await importProject({
      newDb: true,
      hydraulicModel: model,
      projectSettings: defaultProjectSettings,
      simulationSettings: defaultSimulationSettings,
    });
    await withTransaction("previous-pump-format", (db) => {
      db.exec("ALTER TABLE project DROP COLUMN pump_definitions");
      db.exec("ALTER TABLE pumps DROP COLUMN pump_definition_id");
      db.exec("PRAGMA user_version = 29");
    });
    const blob = await exportDb();

    expect(
      await openProject(new File([blob], "previous-pump-format.epnt")),
    ).toMatchObject({ status: "migrated", fileVersion: 29 });
    const migrated = (await fetchProject()).hydraulicModel;
    expect(migrated.pumpDefinitions).toEqual([]);
    const pump = migrated.assets.get(IDS.PU1) as Pump;
    expect(pump.pumpDefinitionId).toBeUndefined();
    expect(pump.definitionType).toBe("power");
    expect(pump.power).toBe(25);
    expect(pump.connections).toEqual([IDS.J1, IDS.J2]);
  });
});
