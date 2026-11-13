import { describe, expect, it } from "vitest";
import {
  getPumpDefinitionWireEfficiencyPoints,
  type Pump,
} from "@epanet-js/hydraulic-model";
import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import { pumpDefinitionFromPump } from "./from-pump";

describe("pump definition from pump", () => {
  it("preserves imported overall efficiency without applying motor losses twice", () => {
    const IDS = { J1: 1, J2: 2, PU1: 3, EFFICIENCY: 4 } as const;
    const points = [
      { x: 0, y: 50 },
      { x: 10, y: 80 },
      { x: 20, y: 65 },
    ];
    const model = HydraulicModelBuilder.with()
      .aJunction(IDS.J1)
      .aJunction(IDS.J2)
      .aPump(IDS.PU1, {
        startNodeId: IDS.J1,
        endNodeId: IDS.J2,
        efficiencyCurveId: IDS.EFFICIENCY,
      })
      .build();
    model.curves.set(IDS.EFFICIENCY, {
      id: IDS.EFFICIENCY,
      label: "Efficiency",
      type: "efficiency",
      points,
    });

    const definition = pumpDefinitionFromPump(
      model.assets.get(IDS.PU1) as Pump,
      model.curves,
      "1",
      "Booster",
      75,
    );

    expect(definition.motor.efficiency).toBe(100);
    expect(definition.motor.variableSpeedDrive).toBe(false);
    expect(getPumpDefinitionWireEfficiencyPoints(definition)).toEqual(points);
    definition.efficiency.points[0].y = 60;
    expect(points[0].y).toBe(50);
  });

  it("preserves the global efficiency and constant pump power", () => {
    const IDS = { PU1: 1 } as const;
    const model = HydraulicModelBuilder.with()
      .aPump(IDS.PU1, { definitionType: "power", power: 25 })
      .build();

    const definition = pumpDefinitionFromPump(
      model.assets.get(IDS.PU1) as Pump,
      model.curves,
      "1",
      "Booster",
      82,
    );

    expect(definition.head.type).toBe("power");
    expect(definition.head.power).toBe(25);
    expect(definition.motor.efficiency).toBe(100);
    expect(
      getPumpDefinitionWireEfficiencyPoints(definition).map((point) => point.y),
    ).toEqual([82, 82]);
  });
});
