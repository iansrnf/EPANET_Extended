import {
  createDefaultPumpDefinition,
  getCurvePointsType,
  type Curves,
  type Pump,
  type PumpDefinition,
} from "@epanet-js/hydraulic-model";

export const pumpDefinitionFromPump = (
  pump: Pump,
  curves: Curves,
  id: string,
  name: string,
  globalEfficiency: number,
): PumpDefinition => {
  const definition = createDefaultPumpDefinition(id, name);
  const points = pump.getCurvePoints(curves);
  if (pump.definitionType === "power") {
    definition.head.type = "power";
    definition.head.power = pump.power ?? definition.head.power;
  } else if (points?.length) {
    const type = getCurvePointsType(points);
    definition.head.type =
      type === "designPointCurve"
        ? "designPoint"
        : type === "standardCurve"
          ? "standard"
          : "multiplePoint";
    definition.head.points = points.map((point) => ({ ...point }));
  }
  definition.efficiency.value = globalEfficiency;
  definition.motor.efficiency = 100;
  const efficiency = pump.efficiencyCurveId
    ? curves.get(pump.efficiencyCurveId)
    : undefined;
  if (efficiency?.points.length) {
    definition.efficiency.type = "multiplePoint";
    definition.efficiency.points = efficiency.points.map((point) => ({
      ...point,
    }));
  }
  return definition;
};
