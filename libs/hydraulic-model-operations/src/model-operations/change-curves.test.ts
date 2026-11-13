import { describe, expect, it } from "vitest";
import { createDefaultPumpDefinition } from "@epanet-js/hydraulic-model";
import { ConsecutiveIdsGenerator } from "@epanet-js/id-generator";
import {
  buildTestFactories,
  HydraulicModelBuilder,
} from "@epanet-js/hydraulic-model-testing";
import { applyOperation } from "../__helpers__/apply-operation";
import { snapshot } from "../__helpers__/model-snapshot";
import { changePumpDefinitions } from "./change-pump-definitions";
import { changeCurves } from "./change-curves";

const IDS = { FREE_CURVE: 80 } as const;

describe("change curves", () => {
  it.each([
    ["head", "points"],
    ["efficiency", "points"],
    ["head", "delete"],
    ["efficiency", "delete"],
    ["head", "label"],
    ["efficiency", "type"],
  ] as const)("rejects definition-owned %s curve %s changes", (kind, edit) => {
    const fixture = aModel();
    const { model } = fixture;
    const definition = model.pumpDefinitions[0];
    const curveId =
      kind === "head" ? definition.headCurveId! : definition.efficiencyCurveId!;
    const curves = new Map(model.curves);
    const original = curves.get(curveId)!;
    if (edit === "delete") curves.delete(curveId);
    if (edit === "points") {
      curves.set(curveId, {
        ...original,
        points: original.points.map((point, index) => ({
          ...point,
          y: point.y + (index === 0 ? 1 : 0),
        })),
      });
    }
    if (edit === "label")
      curves.set(curveId, { ...original, label: "Changed" });
    if (edit === "type") curves.set(curveId, { ...original, type: "volume" });
    const before = snapshot(fixture);

    expect(() => changeCurves(model, { curves })).toThrow(
      "Pump definition curves must be edited through Pump Definition",
    );
    expect(snapshot(fixture)).toEqual(before);
  });

  it("allows ordinary curve edits while preserving cloned definition curves", () => {
    const { model, labelManager } = aModel();
    const curves = new Map(
      [...model.curves].map(([id, curve]) => [
        id,
        { ...curve, points: curve.points.map((point) => ({ ...point })) },
      ]),
    );
    const original = curves.get(IDS.FREE_CURVE)!;
    curves.set(IDS.FREE_CURVE, {
      ...original,
      points: [{ x: 5, y: 11 }],
    });

    const operation = applyOperation(
      model,
      changeCurves(model, { curves }),
      labelManager,
    );

    expect(model.curves.get(IDS.FREE_CURVE)?.points).toEqual([{ x: 5, y: 11 }]);
    expect(model.pumpDefinitions).toHaveLength(1);
    operation.undo();
    expect(model.curves.get(IDS.FREE_CURVE)).toEqual(original);
  });
});

function aModel() {
  const factories = buildTestFactories();
  const model = HydraulicModelBuilder.with(factories)
    .aPumpCurve({ id: IDS.FREE_CURVE, points: [{ x: 5, y: 10 }] })
    .build();
  applyOperation(
    model,
    changePumpDefinitions(model, {
      definitions: [createDefaultPumpDefinition("1", "Booster")],
      curveIds: new ConsecutiveIdsGenerator(),
    }),
    factories.labelManager,
  );
  return { model, labelManager: factories.labelManager };
}
