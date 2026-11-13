import { describe, it, expect } from "vitest";
import { isCurveInUse, isCurveOwnedByPumpDefinition } from "./curve-usage";
import { createDefaultPumpDefinition } from "./pump-definitions";
import type { Curves } from "./curves";
import { initializeHydraulicModel } from "./hydraulic-model";
import type { Asset } from "./asset-types";
import { buildPump, buildTank, buildValve } from "./test-helpers";

describe("isCurveInUse", () => {
  const IDS = { CURVE: 10, OTHER_CURVE: 11, J1: 1, J2: 2, LINK: 3, T1: 4 };
  const points = [{ x: 0, y: 0 }];

  it("detects a tank volume curve", () => {
    const hydraulicModel = aModel(
      [buildTank({ id: IDS.T1, volumeCurveId: IDS.CURVE })],
      curves([IDS.CURVE, "volume"]),
    );

    expect(isCurveInUse(hydraulicModel, IDS.CURVE)).toBe(true);
  });

  it("detects a valve curve", () => {
    const hydraulicModel = aModel(
      [
        buildValve({
          id: IDS.LINK,
          connections: [IDS.J1, IDS.J2],
          kind: "gpv",
          curveId: IDS.CURVE,
        }),
      ],
      curves([IDS.CURVE, "headloss"]),
    );

    expect(isCurveInUse(hydraulicModel, IDS.CURVE)).toBe(true);
  });

  it("detects a pump efficiency curve", () => {
    const hydraulicModel = aModel(
      [
        buildPump({
          id: IDS.LINK,
          connections: [IDS.J1, IDS.J2],
          efficiencyCurveId: IDS.CURVE,
        }),
      ],
      curves([IDS.CURVE, "efficiency"]),
    );

    expect(isCurveInUse(hydraulicModel, IDS.CURVE)).toBe(true);
  });

  it("ignores curves nothing references", () => {
    const hydraulicModel = aModel(
      [buildTank({ id: IDS.T1, volumeCurveId: IDS.OTHER_CURVE })],
      curves([IDS.CURVE, "volume"], [IDS.OTHER_CURVE, "volume"]),
    );

    expect(isCurveInUse(hydraulicModel, IDS.CURVE)).toBe(false);
  });

  it("keeps definition-owned curves in use without assigned pumps", () => {
    const definition = createDefaultPumpDefinition("1", "Booster");
    definition.headCurveId = IDS.CURVE;
    definition.efficiencyCurveId = IDS.OTHER_CURVE;
    const model = initializeHydraulicModel({ pumpDefinitions: [definition] });

    expect(isCurveInUse(model, IDS.CURVE)).toBe(true);
    expect(isCurveInUse(model, IDS.OTHER_CURVE)).toBe(true);
    expect(isCurveOwnedByPumpDefinition(model, IDS.CURVE)).toBe(true);
    expect(isCurveOwnedByPumpDefinition(model, IDS.OTHER_CURVE)).toBe(true);

    definition.head.type = "power";
    expect(isCurveInUse(model, IDS.CURVE)).toBe(true);
    model.pumpDefinitions = [];
    expect(isCurveOwnedByPumpDefinition(model, IDS.CURVE)).toBe(false);
    expect(isCurveInUse(model, IDS.CURVE)).toBe(false);
  });

  const curves = (
    ...entries: [number, "volume" | "headloss" | "efficiency"][]
  ): Curves =>
    new Map(
      entries.map(([id, type]) => [id, { id, label: `C${id}`, type, points }]),
    );
});

const aModel = (assets: Asset[], curves: Curves) =>
  initializeHydraulicModel({
    assets: new Map(assets.map((asset) => [asset.id, asset])),
    curves,
  });
