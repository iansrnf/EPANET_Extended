import type { ChangeSet } from "@epanet-js/change-set";
import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import { buildTestFactories } from "@epanet-js/hydraulic-model-testing";
import { applyOperation } from "../__helpers__/apply-operation";
import {
  createDefaultPumpDefinition,
  type HydraulicModel,
  type Pump,
} from "@epanet-js/hydraulic-model";
import { snapshot } from "../__helpers__/model-snapshot";
import {
  changeProperty,
  changeProperties,
  type ChangeableProperty,
  type PropertyChange,
} from "./change-property";

const { labelManager } = buildTestFactories();

const aModel = () => HydraulicModelBuilder.with({ labelManager });

const apply = (model: HydraulicModel, changeSet: ChangeSet) => {
  applyOperation(model, changeSet, labelManager);
  return changeSet;
};

const changedIds = (changeSet: ChangeSet) =>
  changeSet.records.map((record) => record.id);

const prop = (model: HydraulicModel, id: number, name: string) =>
  model.assets.get(id)!.getProperty(name);

describe("change property", () => {
  it("changes a property of an asset", () => {
    const IDS = { junctionID: 1 } as const;
    const hydraulicModel = aModel()
      .aJunction(IDS.junctionID, { elevation: 15 })
      .build();

    apply(
      hydraulicModel,
      changeProperty(hydraulicModel, {
        assetIds: [IDS.junctionID],
        property: "elevation",
        value: 20,
      }),
    );

    expect(prop(hydraulicModel, IDS.junctionID, "elevation")).toBe(20);
  });

  it("can change properties of many assets", () => {
    const IDS = { A: 1, B: 2 } as const;
    const hydraulicModel = aModel()
      .aJunction(IDS.A, { elevation: 15 })
      .aReservoir(IDS.B, { elevation: 35 })
      .build();

    apply(
      hydraulicModel,
      changeProperty(hydraulicModel, {
        assetIds: [IDS.A, IDS.B],
        property: "elevation",
        value: 20,
      }),
    );

    expect(prop(hydraulicModel, IDS.A, "elevation")).toBe(20);
    expect(prop(hydraulicModel, IDS.B, "elevation")).toBe(20);
  });

  it("ignores assets that do not have the property provided", () => {
    const IDS = { A: 1, B: 2, PIPE: 3 } as const;
    const hydraulicModel = aModel()
      .aJunction(IDS.A)
      .aJunction(IDS.B)
      .aPipe(IDS.PIPE, { diameter: 10 })
      .build();

    const changeSet = apply(
      hydraulicModel,
      changeProperty(hydraulicModel, {
        assetIds: [IDS.A, IDS.B, IDS.PIPE],
        property: "diameter",
        value: 20,
      }),
    );

    expect(changedIds(changeSet)).toEqual([IDS.PIPE]);
    expect(prop(hydraulicModel, IDS.PIPE, "diameter")).toBe(20);
  });

  it("silently ignores isActive property changes", () => {
    const IDS = { J1: 1 } as const;
    const hydraulicModel = aModel().aJunction(IDS.J1).build();

    const changeSet = changeProperty(hydraulicModel, {
      assetIds: [IDS.J1],
      property: "isActive",
      value: false,
    });

    expect(changeSet.size).toBe(0);
  });
});

describe("change properties", () => {
  it("changes multiple properties of a single asset", () => {
    const IDS = { junctionID: 1 } as const;
    const hydraulicModel = aModel()
      .aJunction(IDS.junctionID, { elevation: 15 })
      .build();

    apply(
      hydraulicModel,
      changeProperties(hydraulicModel, {
        assetIds: [IDS.junctionID],
        changes: [
          { property: "elevation", value: 20 },
          { property: "label", value: "RENAMED" },
        ],
      }),
    );

    expect(prop(hydraulicModel, IDS.junctionID, "elevation")).toBe(20);
    expect(prop(hydraulicModel, IDS.junctionID, "label")).toBe("RENAMED");
  });

  it("changes multiple properties across multiple assets", () => {
    const IDS = { A: 1, B: 2 } as const;
    const hydraulicModel = aModel()
      .aJunction(IDS.A, { elevation: 15 })
      .aReservoir(IDS.B, { elevation: 35 })
      .build();

    apply(
      hydraulicModel,
      changeProperties(hydraulicModel, {
        assetIds: [IDS.A, IDS.B],
        changes: [{ property: "elevation", value: 20 }],
      }),
    );

    expect(prop(hydraulicModel, IDS.A, "elevation")).toBe(20);
    expect(prop(hydraulicModel, IDS.B, "elevation")).toBe(20);
  });

  it("ignores properties an asset does not have", () => {
    const IDS = { A: 1, PIPE: 2 } as const;
    const hydraulicModel = aModel()
      .aJunction(IDS.A)
      .aPipe(IDS.PIPE, { diameter: 10 })
      .build();

    const changeSet = apply(
      hydraulicModel,
      changeProperties(hydraulicModel, {
        assetIds: [IDS.A, IDS.PIPE],
        changes: [{ property: "diameter", value: 20 }],
      }),
    );

    expect(changedIds(changeSet)).toEqual([IDS.PIPE]);
    expect(prop(hydraulicModel, IDS.PIPE, "diameter")).toBe(20);
  });

  it("silently ignores isActive property changes", () => {
    const IDS = { J1: 1 } as const;
    const hydraulicModel = aModel()
      .aJunction(IDS.J1, { elevation: 10 })
      .build();

    const changeSet = apply(
      hydraulicModel,
      changeProperties(hydraulicModel, {
        assetIds: [IDS.J1],
        changes: [
          { property: "isActive", value: false },
          { property: "elevation", value: 20 },
        ],
      }),
    );

    expect(changeSet.records[0].after).toEqual({ elevation: 20 });
    expect(prop(hydraulicModel, IDS.J1, "isActive")).toBe(true);
    expect(prop(hydraulicModel, IDS.J1, "elevation")).toBe(20);
  });

  it("throws on invalid asset id", () => {
    const hydraulicModel = aModel().aJunction(1).build();

    expect(() =>
      changeProperties(hydraulicModel, {
        assetIds: [999],
        changes: [{ property: "elevation", value: 20 }],
      }),
    ).toThrow("Invalid asset id 999");
  });
});

describe("custom attribute properties", () => {
  it("sets a custom-<id> property even when the asset does not have it yet", () => {
    const IDS = { J1: 1 } as const;
    const hydraulicModel = aModel().aJunction(IDS.J1).build();

    apply(
      hydraulicModel,
      changeProperty(hydraulicModel, {
        assetIds: [IDS.J1],
        property: "custom-1" as ChangeableProperty,
        value: "high" as never,
      }),
    );

    expect(prop(hydraulicModel, IDS.J1, "custom-1")).toBe("high");
  });

  it("keeps mapped keys while carrying the custom key in a mixed change", () => {
    const IDS = { J1: 1 } as const;
    const hydraulicModel = aModel()
      .aJunction(IDS.J1, { elevation: 15 })
      .build();

    apply(
      hydraulicModel,
      changeProperties(hydraulicModel, {
        assetIds: [IDS.J1],
        changes: [
          { property: "elevation", value: 20 },
          { property: "custom-2", value: 5 },
        ] as PropertyChange[],
      }),
    );

    expect(prop(hydraulicModel, IDS.J1, "elevation")).toBe(20);
    expect(prop(hydraulicModel, IDS.J1, "custom-2")).toBe(5);
  });
});

describe("pump definition overrides", () => {
  const IDS = {
    J1: 1,
    J2: 2,
    PU1: 3,
    HEAD: 10,
    EFFICIENCY: 11,
    OVERRIDE: 12,
  } as const;

  it.each<PropertyChange>([
    { property: "definitionType", value: "power" },
    { property: "power", value: 25 },
    { property: "curve", value: [{ x: 5, y: 20 }] },
    { property: "curveId", value: IDS.OVERRIDE },
    { property: "efficiencyCurveId", value: IDS.OVERRIDE },
  ])(
    "detaches a direct $property override and restores it on undo",
    (override) => {
      const fixture = aManagedPump();
      const { model, labelManager } = fixture;
      const before = snapshot(fixture);

      const operation = applyOperation(
        model,
        changeProperty(model, { assetIds: [IDS.PU1], ...override }),
        labelManager,
      );

      const pump = model.assets.get(IDS.PU1) as Pump;
      expect(pump.pumpDefinitionId).toBeUndefined();
      expect(pump.getProperty(override.property)).toEqual(override.value);
      expect(model.pumpDefinitions).toHaveLength(1);
      operation.undo();
      expect(snapshot(fixture)).toEqual(before);
    },
  );

  it("detaches a grouped head override atomically", () => {
    const fixture = aManagedPump();
    const { model, labelManager } = fixture;
    const before = snapshot(fixture);

    const operation = applyOperation(
      model,
      changeProperties(model, {
        assetIds: [IDS.PU1],
        changes: [
          { property: "definitionType", value: "power" },
          { property: "power", value: 30 },
          { property: "curveId", value: null },
          { property: "speed", value: 0.8 },
        ],
      }),
      labelManager,
    );

    const pump = model.assets.get(IDS.PU1) as Pump;
    expect(pump.pumpDefinitionId).toBeUndefined();
    expect(pump.definitionType).toBe("power");
    expect(pump.power).toBe(30);
    expect(pump.speed).toBe(0.8);
    operation.undo();
    expect(snapshot(fixture)).toEqual(before);
  });

  it("keeps status, speed and energy price edits attached", () => {
    const { model, labelManager } = aManagedPump();

    applyOperation(
      model,
      changeProperties(model, {
        assetIds: [IDS.PU1],
        changes: [
          { property: "initialStatus", value: "off" },
          { property: "speed", value: 0.6 },
          { property: "energyPrice", value: 0.4 },
        ],
      }),
      labelManager,
    );

    const pump = model.assets.get(IDS.PU1) as Pump;
    expect(pump.pumpDefinitionId).toBe("1");
    expect(pump.initialStatus).toBe("off");
    expect(pump.speed).toBe(0.6);
    expect(pump.energyPrice).toBe(0.4);
  });

  it("keeps unchanged head values attached", () => {
    const { model } = aManagedPump();
    const pump = model.assets.get(IDS.PU1) as Pump;

    const change = changeProperties(model, {
      assetIds: [IDS.PU1],
      changes: [
        { property: "definitionType", value: "curveId" },
        { property: "power", value: null },
        {
          property: "curve",
          value: pump.curve?.map((point) => ({ ...point })) ?? null,
        },
        { property: "curveId", value: IDS.HEAD },
        { property: "efficiencyCurveId", value: IDS.EFFICIENCY },
      ],
    });

    expect(change.size).toBe(0);
    expect((model.assets.get(IDS.PU1) as Pump).pumpDefinitionId).toBe("1");
  });

  function aManagedPump() {
    const factories = buildTestFactories();
    const model = HydraulicModelBuilder.with(factories)
      .aJunction(IDS.J1)
      .aJunction(IDS.J2)
      .aPump(IDS.PU1, {
        startNodeId: IDS.J1,
        endNodeId: IDS.J2,
        pumpDefinitionId: "1",
        definitionType: "curveId",
        curveId: IDS.HEAD,
        efficiencyCurveId: IDS.EFFICIENCY,
      })
      .build();
    const definition = createDefaultPumpDefinition("1", "Booster");
    definition.headCurveId = IDS.HEAD;
    definition.efficiencyCurveId = IDS.EFFICIENCY;
    model.pumpDefinitions = [definition];
    return { model, labelManager: factories.labelManager };
  }
});
