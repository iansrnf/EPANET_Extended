import {
  clonePumpDefinition,
  getPumpDefinitionErrors,
  getPumpDefinitionHeadPoints,
  getPumpDefinitionWireEfficiencyPoints,
  type AssetId,
  type ICurve,
  type PumpDefinition,
  type Pump,
} from "@epanet-js/hydraulic-model";
import type { IdGenerator } from "@epanet-js/id-generator";
import type { ModelOperation } from "../model-operation";
import {
  changeSet,
  replaceCurves,
  setAsset,
  setPumpDefinitions,
  type Intent,
} from "../change-sets";

type InputData = {
  definitions: PumpDefinition[];
  assignment?: { pumpId: AssetId; definitionId: string };
  curveIds: IdGenerator;
};

export const changePumpDefinitions: ModelOperation<InputData> = (
  model,
  { definitions, assignment, curveIds },
) => {
  const names = new Set<string>();
  const ids = new Set<string>();
  const nextDefinitions = definitions.map((source) => {
    const definition = clonePumpDefinition(source);
    definition.name = definition.name.trim();
    if (getPumpDefinitionErrors(definition).length > 0) {
      throw new Error("Invalid pump definition");
    }
    const name = definition.name.toLocaleLowerCase();
    if (names.has(name) || ids.has(definition.id)) {
      throw new Error(
        "Pump definitions must have unique names and identifiers",
      );
    }
    names.add(name);
    ids.add(definition.id);
    return definition;
  });

  if (assignment) {
    if (model.assets.get(assignment.pumpId)?.type !== "pump") {
      throw new Error("Pump definition can only be assigned to a pump");
    }
    if (!ids.has(assignment.definitionId)) {
      throw new Error("Assigned pump definition does not exist");
    }
  }

  const byId = new Map(
    nextDefinitions.map((definition) => [definition.id, definition]),
  );
  const assignments: { pumpId: AssetId; definition: PumpDefinition }[] = [];
  for (const asset of model.assets.values()) {
    if (asset.type !== "pump") continue;
    const pump = asset as Pump;
    const definitionId =
      assignment?.pumpId === pump.id
        ? assignment.definitionId
        : pump.pumpDefinitionId;
    if (!definitionId) continue;
    const definition = byId.get(definitionId);
    if (!definition)
      throw new Error("Cannot delete a pump definition that is in use");
    assignments.push({ pumpId: pump.id, definition });
  }

  const previousById = new Map(
    model.pumpDefinitions.map((definition) => [definition.id, definition]),
  );
  for (const id of model.curves.keys()) curveIds.observe(id);
  for (const definition of model.pumpDefinitions) {
    if (definition.headCurveId !== undefined)
      curveIds.observe(definition.headCurveId);
    if (definition.efficiencyCurveId !== undefined) {
      curveIds.observe(definition.efficiencyCurveId);
    }
  }

  const curves = new Map(model.curves);
  const claimedCurveIds = new Set<number>();
  for (const definition of nextDefinitions) {
    const previous = previousById.get(definition.id);
    definition.headCurveId = retainCurveId(
      definition.headCurveId,
      previous?.headCurveId,
      claimedCurveIds,
    );
    definition.efficiencyCurveId = retainCurveId(
      definition.efficiencyCurveId,
      previous?.efficiencyCurveId,
      claimedCurveIds,
    );
    if (definition.head.type !== "power") {
      definition.headCurveId ??= curveIds.newId();
      curves.set(definition.headCurveId, {
        id: definition.headCurveId,
        label: curveLabel(curves, definition.headCurveId, definition, "H"),
        type: "pump",
        points: getPumpDefinitionHeadPoints(definition),
      });
    }
    definition.efficiencyCurveId ??= curveIds.newId();
    curves.set(definition.efficiencyCurveId, {
      id: definition.efficiencyCurveId,
      label: curveLabel(curves, definition.efficiencyCurveId, definition, "E"),
      type: "efficiency",
      points: getPumpDefinitionWireEfficiencyPoints(definition),
    });
  }

  const intents: Intent[] = [];
  for (const { pumpId, definition } of assignments) {
    intents.push(
      setAsset(pumpId, {
        pumpDefinitionId: definition.id,
        definitionType: definition.head.type === "power" ? "power" : "curveId",
        power: definition.head.type === "power" ? definition.head.power : null,
        curveId:
          definition.head.type === "power" ? null : definition.headCurveId,
        curve: null,
        efficiencyCurveId: definition.efficiencyCurveId,
      }),
    );
  }

  return changeSet(model, "changePumpDefinitions", [
    setPumpDefinitions(nextDefinitions),
    replaceCurves(curves),
    ...intents,
  ]);
};

function retainCurveId(
  candidate: number | undefined,
  previous: number | undefined,
  claimed: Set<number>,
): number | undefined {
  if (
    candidate === undefined ||
    candidate !== previous ||
    claimed.has(candidate)
  ) {
    return undefined;
  }
  claimed.add(candidate);
  return candidate;
}

function curveLabel(
  curves: Map<number, ICurve>,
  curveId: number,
  definition: PumpDefinition,
  suffix: string,
): string {
  const existing = curves.get(curveId);
  if (existing) return existing.label;
  const base = `PD_${suffix}_${definition.id}`;
  const labels = new Set([...curves.values()].map((curve) => curve.label));
  let label = base;
  let index = 2;
  while (labels.has(label)) label = `${base}_${index++}`;
  return label;
}
