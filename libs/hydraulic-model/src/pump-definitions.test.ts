import { describe, expect, it } from "vitest";
import { pumpDefinitionSchema } from "@epanet-js/model-schema";
import {
  changePumpDefinitionHeadType,
  clonePumpDefinition,
  createDefaultPumpDefinition,
  getPumpDefinitionEfficiencyPoints,
  getPumpDefinitionEpanetEfficiencyPoints,
  getPumpDefinitionErrors,
  getPumpDefinitionHeadPoints,
  getPumpDefinitionHeadCoefficients,
  getPumpDefinitionWireEfficiencyPoints,
} from "./pump-definitions";

describe("pump definitions", () => {
  it("creates valid definitions and independent clones", () => {
    const definition = createDefaultPumpDefinition("1", "Pump 1");
    expect(pumpDefinitionSchema.safeParse(definition).success).toBe(true);
    expect(getPumpDefinitionErrors(definition)).toEqual([]);
    const copy = clonePumpDefinition(definition);
    copy.head.points[0].y = 80;
    copy.efficiency.points[0].y = 20;
    copy.motor.points[0].y = 60;
    expect(definition.head.points[0].y).toBe(50);
    expect(definition.efficiency.points[0].y).toBe(50);
    expect(definition.motor.points[0].y).toBe(90);
  });

  it("samples the fitted head through all three operating points", () => {
    const definition = createDefaultPumpDefinition("1", "Pump 1");
    const points = getPumpDefinitionHeadPoints(definition);
    expect(points).toHaveLength(25);
    for (const input of definition.head.points)
      expect(points).toContainEqual(input);
    expect(points.find((point) => point.x === 5)?.y).toBeCloseTo(47.5);
    expect(points.at(-1)).toEqual({ x: 20, y: 10 });
  });

  it("extends the standard curve automatically to zero head", () => {
    const definition = createDefaultPumpDefinition("1", "Pump 1");
    definition.head.type = "standardExtended";
    const points = getPumpDefinitionHeadPoints(definition);
    expect(points).toContainEqual({ x: 20, y: 10 });
    expect(points.at(-1)?.x).toBeCloseTo(Math.sqrt(500));
    expect(points.at(-1)?.y).toBe(0);
  });

  it("omits rounded-flat samples from steep curves", () => {
    const definition = createDefaultPumpDefinition("1", "Pump 1");
    definition.head.points = [
      { x: 0, y: 200 },
      { x: 1, y: 199.9999 },
      { x: 2, y: 95.1424 },
    ];
    expect(getPumpDefinitionErrors(definition)).toEqual([]);
    const points = getPumpDefinitionHeadPoints(definition);
    for (const input of definition.head.points)
      expect(points).toContainEqual(input);
    expect(points.length).toBeGreaterThan(3);
    expect(
      points.every(
        (point, index) => index === 0 || point.y < points[index - 1].y,
      ),
    ).toBe(true);
  });

  it("uses the custom zero-head flow without moving operating points", () => {
    const definition = createDefaultPumpDefinition("1", "Pump 1");
    definition.head.type = "customExtended";
    definition.head.extendedFlow = 30;
    const points = getPumpDefinitionHeadPoints(definition);
    expect(points.at(-2)).toEqual({ x: 20, y: 10 });
    expect(points.at(-1)).toEqual({ x: 30, y: 0 });
    definition.head.extendedFlow = 19;
    expect(getPumpDefinitionErrors(definition)).toContainEqual({
      path: "head.extendedFlow",
      code: "extendedFlow",
    });
    expect(getPumpDefinitionHeadPoints(definition)).toEqual([]);
  });

  it("keeps three-point multiple-point data piecewise linear in EPANET", () => {
    const definition = createDefaultPumpDefinition("1", "Pump 1");
    definition.head.type = "multiplePoint";
    const points = getPumpDefinitionHeadPoints(definition);
    expect(points).toEqual([
      { x: 0, y: 50 },
      { x: 5, y: 45 },
      { x: 10, y: 40 },
      { x: 20, y: 10 },
    ]);
    expect(definition.head.points).toHaveLength(3);
    const withoutInterpolation = getPumpDefinitionHeadPoints(definition);
    definition.head.interpolation = "linear";
    expect(getPumpDefinitionHeadPoints(definition)).toEqual(
      withoutInterpolation,
    );
    expect(getPumpDefinitionHeadCoefficients(definition)).toBeNull();
  });

  it("recovers a five-point power curve with fitted interpolation", () => {
    const definition = createDefaultPumpDefinition("1", "Pump 1");
    definition.head.type = "multiplePoint";
    definition.head.interpolation = "fitted";
    definition.head.points = [0, 5, 10, 20, 30].map((x) => ({
      x,
      y: 120 - 0.02 * Math.pow(x, 2.3),
    }));
    expect(getPumpDefinitionErrors(definition)).toEqual([]);
    const coefficients = getPumpDefinitionHeadCoefficients(definition)!;
    expect(coefficients.a).toBeCloseTo(120, 6);
    expect(coefficients.b).toBeCloseTo(0.02, 8);
    expect(coefficients.c).toBeCloseTo(2.3, 6);
    for (const point of definition.head.points) {
      const prediction =
        coefficients.a - coefficients.b * Math.pow(point.x, coefficients.c);
      expect(prediction).toBeCloseTo(point.y, 6);
    }
    const normalized = getPumpDefinitionHeadPoints(definition);
    expect(normalized.at(-1)?.y).toBe(0);
    expect(normalized.at(-1)?.x).toBeCloseTo(Math.pow(6000, 1 / 2.3), 6);
    expect(
      normalized.every(
        (point, index) => index === 0 || point.y < normalized[index - 1].y,
      ),
    ).toBe(true);
  });

  it("fits noisy points without forcing the curve through markers", () => {
    const definition = createDefaultPumpDefinition("1", "Pump 1");
    definition.head.type = "multiplePoint";
    definition.head.interpolation = "fitted";
    const noise = [0.2, -0.2, 0.15, -0.3, 0.1];
    definition.head.points = [0, 5, 10, 20, 30].map((x, index) => ({
      x,
      y: 120 - 0.02 * Math.pow(x, 2.3) + noise[index],
    }));
    expect(getPumpDefinitionErrors(definition)).toEqual([]);
    const coefficients = getPumpDefinitionHeadCoefficients(definition)!;
    const error = definition.head.points.reduce((sum, point) => {
      const residual =
        point.y -
        (coefficients.a - coefficients.b * Math.pow(point.x, coefficients.c));
      return sum + residual * residual;
    }, 0);
    expect(error).toBeLessThan(0.203);
    expect(error).toBeGreaterThan(0.001);
    expect(getPumpDefinitionHeadPoints(definition).length).toBeGreaterThan(5);
    definition.head.points = definition.head.points.slice(0, 2);
    expect(getPumpDefinitionErrors(definition)).toContainEqual({
      path: "head.points",
      code: "pointCount",
    });
    expect(getPumpDefinitionHeadCoefficients(definition)).toBeNull();
    expect(getPumpDefinitionHeadPoints(definition)).toEqual([]);
  });

  it("scales head by the affinity laws", () => {
    const definition = createDefaultPumpDefinition("1", "Pump 1");
    const points = getPumpDefinitionHeadPoints(definition, 0.5);
    expect(points).toContainEqual({ x: 5, y: 10 });
    expect(points.at(-1)).toEqual({ x: 10, y: 2.5 });
    expect(getPumpDefinitionHeadPoints(definition, 0)).toEqual([]);
  });

  it("retains design data when changing head modes", () => {
    let definition = createDefaultPumpDefinition("1", "Pump 1");
    definition = changePumpDefinitionHeadType(definition, "designPoint");
    expect(definition.head.points).toEqual([{ x: 10, y: 40 }]);
    expect(getPumpDefinitionHeadPoints(definition).at(-1)).toEqual({
      x: 20,
      y: 0,
    });
    definition = changePumpDefinitionHeadType(definition, "customExtended");
    expect(getPumpDefinitionErrors(definition)).toEqual([]);
    expect(definition.head.points[1]).toEqual({ x: 10, y: 40 });
    definition = changePumpDefinitionHeadType(definition, "power");
    expect(getPumpDefinitionErrors(definition)).toEqual([]);
    expect(getPumpDefinitionHeadPoints(definition)).toEqual([]);
  });

  it("rejects bad point ordering and zero active efficiencies", () => {
    const definition = createDefaultPumpDefinition("1", "Pump 1");
    definition.head.points[2].x = 5;
    definition.efficiency.value = 0;
    definition.motor.efficiency = 0;
    expect(getPumpDefinitionErrors(definition)).toEqual(
      expect.arrayContaining([
        { path: "head.points.2.x", code: "flowOrder" },
        { path: "efficiency.value", code: "percentage" },
        { path: "motor.efficiency", code: "percentage" },
      ]),
    );
  });

  it("allows unused settings to retain drafts while validating the active type", () => {
    const definition = createDefaultPumpDefinition("1", "Pump 1");
    definition.head.power = 0;
    definition.efficiency.bepFlow = 0;
    definition.efficiency.maxFlow = 0;
    definition.motor.points = [];
    expect(getPumpDefinitionErrors(definition)).toEqual([]);
    definition.motor.variableSpeedDrive = true;
    expect(getPumpDefinitionErrors(definition)).toContainEqual({
      path: "motor.points",
      code: "pointCount",
    });
  });

  it("samples constant and BEP efficiency with the peak preserved", () => {
    const definition = createDefaultPumpDefinition("1", "Pump 1");
    expect(getPumpDefinitionEfficiencyPoints(definition)).toEqual([
      { x: 0, y: 75 },
      { x: 20, y: 75 },
    ]);
    definition.efficiency.type = "bep";
    definition.efficiency.maxFlow = 30;
    const points = getPumpDefinitionEfficiencyPoints(definition);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points).toContainEqual({ x: 10, y: 75 });
    expect(points.at(-1)).toEqual({ x: 30, y: 0 });
    expect(points.every((point) => point.y >= 0 && point.y <= 75)).toBe(true);
    definition.efficiency.maxFlow = 5;
    expect(getPumpDefinitionEfficiencyPoints(definition)).toEqual([]);
  });

  it("allows bell-shaped multiple efficiencies and rejects duplicate flow", () => {
    const definition = createDefaultPumpDefinition("1", "Pump 1");
    definition.efficiency.type = "multiplePoint";
    expect(getPumpDefinitionErrors(definition)).toEqual([]);
    expect(getPumpDefinitionEfficiencyPoints(definition)).toEqual(
      definition.efficiency.points,
    );
    definition.efficiency.points[2].x = 10;
    expect(getPumpDefinitionErrors(definition)).toContainEqual({
      path: "efficiency.points.2.x",
      code: "flowOrder",
    });
    expect(getPumpDefinitionEfficiencyPoints(definition)).toEqual([]);
  });

  it("multiplies pump, motor and interpolated drive efficiency once", () => {
    const definition = createDefaultPumpDefinition("1", "Pump 1");
    definition.efficiency.value = 80;
    definition.motor.efficiency = 90;
    definition.motor.variableSpeedDrive = true;
    definition.motor.points = [
      { x: 0.5, y: 80 },
      { x: 1, y: 100 },
    ];
    const points = getPumpDefinitionWireEfficiencyPoints(definition, 0.75);
    expect(points).toEqual([
      { x: 0, y: 64.8 },
      { x: 15, y: 64.8 },
    ]);
    definition.motor.variableSpeedDrive = false;
    expect(getPumpDefinitionWireEfficiencyPoints(definition)[0].y).toBe(72);
  });

  it.each([0.8, 1.2])(
    "offsets native speed correction at speed %s",
    (speed) => {
      const definition = createDefaultPumpDefinition("1", "Pump 1");
      definition.efficiency.value = 80;
      definition.motor.efficiency = 90;
      definition.motor.variableSpeedDrive = true;
      definition.motor.points = [
        { x: 0.5, y: 80 },
        { x: 1, y: 100 },
      ];
      const target = getPumpDefinitionWireEfficiencyPoints(definition, speed);
      const epanet = getPumpDefinitionEpanetEfficiencyPoints(definition, speed);
      expect(epanet.at(-1)?.x).toBeCloseTo(20);
      for (let index = 0; index < target.length; index++) {
        const actual = Math.max(
          1,
          Math.min(
            100,
            100 - (100 - epanet[index].y) * Math.pow(1 / speed, 0.1),
          ),
        );
        expect(actual).toBeCloseTo(target[index].y, 10);
        expect(epanet[index].x * speed).toBeCloseTo(target[index].x, 10);
      }
      expect(target[0].y).toBeCloseTo(speed === 0.8 ? 66.24 : 72);
    },
  );

  it("respects native efficiency limits when the target is unattainable", () => {
    const definition = createDefaultPumpDefinition("1", "Pump 1");
    definition.efficiency.value = 1;
    definition.motor.efficiency = 1;
    expect(getPumpDefinitionEpanetEfficiencyPoints(definition)[0].y).toBe(1);
    expect(getPumpDefinitionEpanetEfficiencyPoints(definition, 1.2)[0].y).toBe(
      1,
    );
    const nativeEfficiency = 100 - 99 * Math.pow(1 / 1.2, 0.1);
    expect(nativeEfficiency).toBeGreaterThan(1);
    expect(getPumpDefinitionEpanetEfficiencyPoints(definition, 0)).toEqual([]);
  });

  it("returns no graph points for nonfinite drafts instead of throwing", () => {
    const definition = createDefaultPumpDefinition("1", "Pump 1");
    definition.head.points[1].x = Number.NaN;
    expect(getPumpDefinitionErrors(definition).length).toBeGreaterThan(0);
    expect(getPumpDefinitionHeadPoints(definition)).toEqual([]);
    expect(getPumpDefinitionEfficiencyPoints(definition)).toEqual([]);
    expect(getPumpDefinitionWireEfficiencyPoints(definition)).toEqual([]);
  });
});
