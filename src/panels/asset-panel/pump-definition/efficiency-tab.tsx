import {
  getPumpDefinitionEfficiencyPoints,
  type PumpDefinitionEfficiencyType,
} from "@epanet-js/hydraulic-model";
import { Selector } from "@epanet-js/ui-kit";
import { CurveTable } from "src/dialogs/curves/curve-table";
import { Checkbox } from "src/components/form/Checkbox";
import { useTranslate } from "src/hooks/use-translate";
import { useTranslateUnit } from "src/hooks/use-translate-unit";
import { DefinitionCard, DefinitionNumberField } from "./definition-fields";
import { DefinitionGraph } from "./definition-graph";
import type { PumpDefinitionEditorProps } from "./pump-definition-editor";

const EFFICIENCY_TYPES: PumpDefinitionEfficiencyType[] = [
  "constant",
  "bep",
  "multiplePoint",
];

export const EfficiencyTab = ({
  definition,
  units,
  readOnly = false,
  onChange,
}: PumpDefinitionEditorProps) => {
  const translate = useTranslate();
  const translateUnit = useTranslateUnit();
  const efficiency = definition.efficiency;
  const linePoints = getPumpDefinitionEfficiencyPoints(definition);
  const flowUnit = translateUnit(units.flow);
  const update = (changes: Partial<typeof efficiency>) =>
    onChange({ ...definition, efficiency: { ...efficiency, ...changes } });
  const graphPoints =
    efficiency.type === "multiplePoint"
      ? efficiency.points
      : efficiency.type === "bep"
        ? [{ x: efficiency.bepFlow, y: efficiency.value }]
        : linePoints;

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <DefinitionCard
        title={translate("pumpDefinitionEditor.efficiencySettings")}
        description={translate("pumpDefinitionEditor.efficiencyDescription")}
      >
        <div className="space-y-4">
          <div className="space-y-2 [&_button]:min-h-11">
            <span className="text-size-base text-subtle">
              {translate("pumpDefinitionEditor.efficiencyType")}
            </span>
            <Selector
              ariaLabel={translate("pumpDefinitionEditor.efficiencyType")}
              selected={efficiency.type}
              options={EFFICIENCY_TYPES.map((type) => ({
                value: type,
                label: translate(
                  `pumpDefinitionEditor.efficiencyTypes.${type}`,
                ),
              }))}
              disabled={readOnly}
              onChange={(type) => update({ type })}
              styleOptions={{
                border: true,
                paddingY: 2,
                textSize: "text-size-base",
              }}
            />
          </div>
          {efficiency.type === "multiplePoint" ? (
            <div className="h-56 min-w-0 overflow-hidden rounded-md border">
              <CurveTable
                points={efficiency.points}
                curveType="efficiency"
                units={units}
                readOnly={readOnly}
                onChange={(points) => update({ points })}
              />
            </div>
          ) : (
            <DefinitionNumberField
              label={translate(
                efficiency.type === "bep"
                  ? "pumpDefinitionEditor.bepEfficiency"
                  : "pumpDefinitionEditor.constantEfficiency",
              )}
              value={efficiency.value}
              unit="%"
              readOnly={readOnly}
              validate={isPercentage}
              onChange={(value) => update({ value })}
            />
          )}
          {efficiency.type === "bep" && (
            <>
              <DefinitionNumberField
                label={translate("pumpDefinitionEditor.bepFlow")}
                value={efficiency.bepFlow}
                unit={flowUnit}
                readOnly={readOnly}
                validate={(value) => value > 0}
                onChange={(bepFlow) => update({ bepFlow })}
              />
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md bg-panel px-3 py-2 text-size-base text-default">
                <Checkbox
                  checked={efficiency.maxFlow !== undefined}
                  disabled={readOnly}
                  onChange={(event) =>
                    update({
                      maxFlow: event.target.checked
                        ? efficiency.bepFlow * 2
                        : undefined,
                    })
                  }
                />
                {translate("pumpDefinitionEditor.customMaximumFlow")}
              </label>
              {efficiency.maxFlow !== undefined && (
                <DefinitionNumberField
                  label={translate(
                    "pumpDefinitionEditor.maximumEfficiencyFlow",
                  )}
                  value={efficiency.maxFlow}
                  unit={flowUnit}
                  readOnly={readOnly}
                  validate={(value) => value > efficiency.bepFlow}
                  onChange={(maxFlow) => update({ maxFlow })}
                />
              )}
            </>
          )}
        </div>
      </DefinitionCard>
      <DefinitionGraph
        title={translate("pumpDefinitionEditor.efficiencyGraph")}
        description={translate(
          "pumpDefinitionEditor.efficiencyGraphDescription",
        )}
        points={graphPoints}
        linePoints={linePoints}
        xLabel={`${translate("flow")} (${flowUnit})`}
        yLabel={`${translate("pumpDefinitionEditor.pumpEfficiency")} (%)`}
      />
    </div>
  );
};

const isPercentage = (value: number) => value > 0 && value <= 100;
