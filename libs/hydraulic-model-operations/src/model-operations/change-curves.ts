import { Curves, type ICurve } from "@epanet-js/hydraulic-model";
import { ModelOperation } from "../model-operation";
import { changeSet, replaceCurves } from "../change-sets";

type InputData = {
  curves: Curves;
};

export const changeCurves: ModelOperation<InputData> = (model, { curves }) => {
  for (const definition of model.pumpDefinitions) {
    for (const id of [definition.headCurveId, definition.efficiencyCurveId]) {
      if (id === undefined) continue;
      if (!sameCurve(model.curves.get(id), curves.get(id))) {
        throw new Error(
          "Pump definition curves must be edited through Pump Definition",
        );
      }
    }
  }
  return changeSet(model, "changeCurves", [replaceCurves(curves)]);
};

function sameCurve(
  left: ICurve | undefined,
  right: ICurve | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.id === right.id &&
    left.label === right.label &&
    left.type === right.type &&
    left.points.length === right.points.length &&
    left.points.every(
      (point, index) =>
        point.x === right.points[index].x && point.y === right.points[index].y,
    )
  );
}
