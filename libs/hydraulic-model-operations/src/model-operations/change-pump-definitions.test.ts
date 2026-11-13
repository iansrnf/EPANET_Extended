import { describe, expect, it } from "vitest";
import {
  clonePumpDefinition,
  createDefaultPumpDefinition,
  type Pump,
} from "@epanet-js/hydraulic-model";
import { ConsecutiveIdsGenerator } from "@epanet-js/id-generator";
import {
  buildTestFactories,
  HydraulicModelBuilder,
} from "@epanet-js/hydraulic-model-testing";
import { applyOperation } from "../__helpers__/apply-operation";
import { snapshot } from "../__helpers__/model-snapshot";
import { changePumpDefinitions } from "./change-pump-definitions";

const IDS = { J1: 1, J2: 2, PU1: 3, PU2: 4, USER_CURVE: 80 } as const;

describe("change pump definitions", () => {
  it("updates all assigned pumps together and restores their curves on undo", () => {
    const fixture = aNetwork();
    const { model, labelManager } = fixture;
    const curveIds = new ConsecutiveIdsGenerator();
    applyOperation(
      model,
      changePumpDefinitions(model, {
        definitions: [createDefaultPumpDefinition("1", "Booster")],
        assignment: { pumpId: IDS.PU1, definitionId: "1" },
        curveIds,
      }),
      labelManager,
    );
    applyOperation(
      model,
      changePumpDefinitions(model, {
        definitions: model.pumpDefinitions,
        assignment: { pumpId: IDS.PU2, definitionId: "1" },
        curveIds,
      }),
      labelManager,
    );
    const before = snapshot(fixture);
    const original = model.pumpDefinitions[0];
    const edited = clonePumpDefinition(original);
    edited.name = "Updated booster";
    edited.head.points[1].y = 42;
    edited.efficiency.value = 80;
    edited.motor.efficiency = 90;

    const operation = applyOperation(
      model,
      changePumpDefinitions(model, { definitions: [edited], curveIds }),
      labelManager,
    );

    for (const id of [IDS.PU1, IDS.PU2]) {
      const pump = model.assets.get(id) as Pump;
      expect(pump.pumpDefinitionId).toBe(edited.id);
      expect(pump.definitionType).toBe("curveId");
      expect(pump.curveId).toBe(original.headCurveId);
      expect(pump.efficiencyCurveId).toBe(original.efficiencyCurveId);
    }
    expect(model.curves.get(original.headCurveId!)?.points).toEqual(
      expect.arrayContaining([
        { x: 0, y: 50 },
        { x: 10, y: 42 },
        { x: 20, y: 10 },
      ]),
    );
    expect(
      model.curves
        .get(original.efficiencyCurveId!)
        ?.points.map((point) => point.y),
    ).toEqual([72, 72]);
    expect((model.assets.get(IDS.PU1) as Pump).speed).toBe(0.8);
    expect((model.assets.get(IDS.PU1) as Pump).energyPrice).toBe(0.2);
    expect(original.head.points[1].y).toBe(40);

    operation.undo();
    expect(snapshot(fixture)).toEqual(before);
    operation.redo();
    expect(model.pumpDefinitions[0].name).toBe("Updated booster");
  });

  it("rejects deletion of an assigned definition without changing the model", () => {
    const fixture = aNetwork();
    const { model, labelManager } = fixture;
    const curveIds = new ConsecutiveIdsGenerator();
    applyOperation(
      model,
      changePumpDefinitions(model, {
        definitions: [createDefaultPumpDefinition("1", "Booster")],
        assignment: { pumpId: IDS.PU1, definitionId: "1" },
        curveIds,
      }),
      labelManager,
    );
    const before = snapshot(fixture);
    const generated = curveIds.totalGenerated;

    expect(() =>
      changePumpDefinitions(model, { definitions: [], curveIds }),
    ).toThrow("Cannot delete a pump definition that is in use");
    expect(snapshot(fixture)).toEqual(before);
    expect(curveIds.totalGenerated).toBe(generated);
  });

  it("allocates new identifiers without overwriting unrelated curves", () => {
    const fixture = aNetwork();
    const { model, labelManager } = fixture;
    const curve = {
      id: IDS.USER_CURVE,
      label: "PD_H_new",
      type: "pump" as const,
      points: [{ x: 5, y: 12 }],
    };
    model.curves.set(curve.id, curve);
    const definition = createDefaultPumpDefinition("new", "Booster");
    definition.headCurveId = IDS.USER_CURVE;
    definition.efficiencyCurveId = IDS.USER_CURVE;
    const curveIds = new ConsecutiveIdsGenerator();

    applyOperation(
      model,
      changePumpDefinitions(model, { definitions: [definition], curveIds }),
      labelManager,
    );

    const saved = model.pumpDefinitions[0];
    expect(model.curves.get(IDS.USER_CURVE)).toEqual(curve);
    expect(saved.headCurveId).toBeGreaterThan(IDS.USER_CURVE);
    expect(saved.efficiencyCurveId).toBeGreaterThan(IDS.USER_CURVE);
    expect(saved.headCurveId).not.toBe(saved.efficiencyCurveId);
    expect(model.curves.get(saved.headCurveId!)?.label).not.toBe(curve.label);
    expect(definition.headCurveId).toBe(IDS.USER_CURVE);
  });

  it("gives duplicated definitions their own generated curves", () => {
    const fixture = aNetwork();
    const { model, labelManager } = fixture;
    const curveIds = new ConsecutiveIdsGenerator();
    applyOperation(
      model,
      changePumpDefinitions(model, {
        definitions: [createDefaultPumpDefinition("1", "Booster")],
        curveIds,
      }),
      labelManager,
    );
    const original = model.pumpDefinitions[0];
    const duplicate = clonePumpDefinition(original);
    duplicate.id = "2";
    duplicate.name = "Booster copy";

    applyOperation(
      model,
      changePumpDefinitions(model, {
        definitions: [duplicate, original],
        curveIds: new ConsecutiveIdsGenerator(),
      }),
      labelManager,
    );

    const [savedCopy, savedOriginal] = model.pumpDefinitions;
    expect(savedOriginal.headCurveId).toBe(original.headCurveId);
    expect(savedOriginal.efficiencyCurveId).toBe(original.efficiencyCurveId);
    expect(
      new Set([
        savedCopy.headCurveId,
        savedCopy.efficiencyCurveId,
        savedOriginal.headCurveId,
        savedOriginal.efficiencyCurveId,
      ]).size,
    ).toBe(4);
    expect(model.curves.size).toBe(4);
  });

  it("retains owned head identifiers in power mode and discards copied ones", () => {
    const fixture = aNetwork();
    const { model, labelManager } = fixture;
    const curveIds = new ConsecutiveIdsGenerator();
    applyOperation(
      model,
      changePumpDefinitions(model, {
        definitions: [createDefaultPumpDefinition("1", "Booster")],
        assignment: { pumpId: IDS.PU1, definitionId: "1" },
        curveIds,
      }),
      labelManager,
    );
    const original = model.pumpDefinitions[0];
    const power = clonePumpDefinition(original);
    const originalHeadPoints = model.curves.get(original.headCurveId!)?.points;
    power.head.type = "power";
    power.head.power = 30;
    const duplicate = clonePumpDefinition(power);
    duplicate.id = "2";
    duplicate.name = "Power copy";

    const operation = applyOperation(
      model,
      changePumpDefinitions(model, {
        definitions: [duplicate, power],
        curveIds: new ConsecutiveIdsGenerator(),
      }),
      labelManager,
    );

    const [savedCopy, savedOriginal] = model.pumpDefinitions;
    expect(savedCopy.headCurveId).toBeUndefined();
    expect(savedOriginal.headCurveId).toBe(original.headCurveId);
    expect(savedCopy.efficiencyCurveId).not.toBe(original.efficiencyCurveId);
    expect(model.curves.get(original.headCurveId!)?.points).toEqual(
      originalHeadPoints,
    );
    const pump = model.assets.get(IDS.PU1) as Pump;
    expect(pump.definitionType).toBe("power");
    expect(pump.power).toBe(30);
    expect(pump.curveId).toBeNull();

    operation.undo();
    expect((model.assets.get(IDS.PU1) as Pump).definitionType).toBe("curveId");
    expect(model.pumpDefinitions).toEqual([original]);
  });
});

function aNetwork() {
  const factories = buildTestFactories();
  const model = HydraulicModelBuilder.with(factories)
    .aJunction(IDS.J1)
    .aJunction(IDS.J2)
    .aPump(IDS.PU1, {
      startNodeId: IDS.J1,
      endNodeId: IDS.J2,
      speed: 0.8,
      energyPrice: 0.2,
    })
    .aPump(IDS.PU2, { startNodeId: IDS.J1, endNodeId: IDS.J2 })
    .build();
  return { model, labelManager: factories.labelManager };
}
