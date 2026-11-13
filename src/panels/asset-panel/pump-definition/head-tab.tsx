import {
  changePumpDefinitionHeadType,
  getPumpDefinitionHeadPoints,
  getPumpDefinitionHeadCoefficients,
  type CurvePoint,
  type PumpDefinition,
  type PumpDefinitionHeadType,
} from "@epanet-js/hydraulic-model";
import { Selector } from "@epanet-js/ui-kit";
import { CurveTable } from "src/dialogs/curves/curve-table";
import { useTranslate } from "src/hooks/use-translate";
import { useTranslateUnit } from "src/hooks/use-translate-unit";
import { NumericField } from "src/components/form/numeric-field";
import { localizeDecimal } from "@epanet-js/i18n";
import { DefinitionCard, DefinitionNumberField } from "./definition-fields";
import { DefinitionGraph } from "./definition-graph";
import type { PumpDefinitionEditorProps } from "./pump-definition-editor";

const HEAD_TYPES: PumpDefinitionHeadType[] = [
  "power",
  "designPoint",
  "standard",
  "standardExtended",
  "customExtended",
  "multiplePoint",
];

export const HeadTab = ({
  definition,
  units,
  readOnly = false,
  onChange,
}: PumpDefinitionEditorProps) => {
  const translate = useTranslate();
  const translateUnit = useTranslateUnit();
  const head = definition.head;
  const graphPoints = getPumpDefinitionHeadPoints(definition);
  const coefficients = getPumpDefinitionHeadCoefficients(definition);
  const flowUnit = translateUnit(units.flow);
  const headUnit = translateUnit(units.head);
  const updatePoints = (points: CurvePoint[]) =>
    onChange({ ...definition, head: { ...head, points } });

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <DefinitionCard
        title={translate("pumpDefinitionEditor.headSettings")}
        description={translate("pumpDefinitionEditor.headDescription")}
      >
        <div className="space-y-4">
          <div className="space-y-2 [&_button]:min-h-11">
            <span className="text-size-base text-subtle">
              {translate("pumpDefinitionEditor.definitionType")}
            </span>
            <Selector
              ariaLabel={translate("pumpDefinitionEditor.definitionType")}
              selected={head.type}
              options={HEAD_TYPES.map((type) => ({
                value: type,
                label: translate(`pumpDefinitionEditor.headTypes.${type}`),
              }))}
              disabled={readOnly}
              onChange={(type) =>
                onChange(changePumpDefinitionHeadType(definition, type))
              }
              styleOptions={{
                border: true,
                paddingY: 2,
                textSize: "text-size-base",
              }}
            />
          </div>
          {head.type === "power" ? (
            <DefinitionNumberField
              label={translate("pumpDefinitionEditor.waterPower")}
              value={head.power}
              unit={translateUnit(units.power)}
              readOnly={readOnly}
              validate={(value) => value > 0}
              onChange={(power) =>
                onChange({ ...definition, head: { ...head, power } })
              }
            />
          ) : head.type === "multiplePoint" ? (
            <>
              <div className="space-y-2 [&_button]:min-h-11">
                <span className="text-size-base text-subtle">
                  {translate("pumpDefinitionEditor.interpolation")}
                </span>
                <Selector
                  ariaLabel={translate("pumpDefinitionEditor.interpolation")}
                  selected={head.interpolation ?? "linear"}
                  options={[
                    {
                      value: "linear" as const,
                      label: translate(
                        "pumpDefinitionEditor.linearInterpolation",
                      ),
                    },
                    {
                      value: "fitted" as const,
                      label: translate(
                        "pumpDefinitionEditor.fittedInterpolation",
                      ),
                    },
                  ]}
                  disabled={readOnly}
                  onChange={(interpolation) =>
                    onChange({
                      ...definition,
                      head: { ...head, interpolation },
                    })
                  }
                  styleOptions={{
                    border: true,
                    paddingY: 2,
                    textSize: "text-size-base",
                  }}
                />
              </div>
              <div className="h-56 min-w-0 overflow-hidden rounded-md border">
                <CurveTable
                  points={head.points}
                  curveType="pump"
                  units={units}
                  readOnly={readOnly}
                  onChange={updatePoints}
                />
              </div>
            </>
          ) : (
            <HeadPointFields
              definition={definition}
              flowUnit={flowUnit}
              headUnit={headUnit}
              readOnly={readOnly}
              onChange={updatePoints}
            />
          )}
          {head.type === "customExtended" && (
            <DefinitionNumberField
              label={translate("pumpDefinitionEditor.zeroHeadFlow")}
              value={head.extendedFlow ?? 0}
              unit={flowUnit}
              readOnly={readOnly}
              validate={(value) => value > 0}
              onChange={(extendedFlow) =>
                onChange({ ...definition, head: { ...head, extendedFlow } })
              }
            />
          )}
          {head.type === "standardExtended" && (
            <p className="rounded-md bg-panel p-3 text-size-small leading-relaxed text-subtle">
              {translate("pumpDefinitionEditor.automaticExtension")}
            </p>
          )}
          {head.type === "power" && (
            <p className="text-size-small leading-relaxed text-subtle">
              {translate("pumpDefinitionEditor.constantPowerDescription")}
            </p>
          )}
          {coefficients && (
            <section className="space-y-3 rounded-md bg-panel p-3">
              <h4 className="text-size-small font-medium text-subtle">
                {translate("pumpDefinitionEditor.curveEquation")}
              </h4>
              <p className="font-mono text-size-base text-default">
                H = A − B × Q<sup>C</sup>
              </p>
              <dl className="grid grid-cols-3 gap-2">
                {(["a", "b", "c"] as const).map((coefficient) => (
                  <div key={coefficient} className="min-w-0">
                    <dt className="text-size-small text-subtle">
                      {coefficient.toUpperCase()}
                    </dt>
                    <dd className="break-all font-mono text-size-base tabular-nums text-default">
                      {localizeDecimal(coefficients[coefficient])}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-size-small text-subtle">
                {translate(
                  "pumpDefinitionEditor.coefficientUnits",
                  flowUnit,
                  headUnit,
                )}
              </p>
              {head.type === "customExtended" && (
                <p className="text-size-small text-subtle">
                  {translate("pumpDefinitionEditor.customExtensionEquation")}
                </p>
              )}
            </section>
          )}
        </div>
      </DefinitionCard>
      {head.type !== "power" && (
        <DefinitionGraph
          title={translate("pumpDefinitionEditor.headGraph")}
          description={translate("pumpDefinitionEditor.headGraphDescription")}
          points={head.points}
          linePoints={graphPoints}
          xLabel={`${translate("flow")} (${flowUnit})`}
          yLabel={`${translate("head")} (${headUnit})`}
        />
      )}
    </div>
  );
};

const HeadPointFields = ({
  definition,
  flowUnit,
  headUnit,
  readOnly,
  onChange,
}: {
  definition: PumpDefinition;
  flowUnit: string;
  headUnit: string;
  readOnly: boolean;
  onChange: (points: CurvePoint[]) => void;
}) => {
  const translate = useTranslate();
  const isDesignPoint = definition.head.type === "designPoint";
  const labels = isDesignPoint
    ? [translate("designPointLabel")]
    : [
        translate("shutoffPoint"),
        translate("designPointLabel"),
        translate("maxOperatingPoint"),
      ];

  return (
    <div className="space-y-3">
      {definition.head.points.map((point, index) => (
        <fieldset key={index} className="rounded-md border bg-panel p-3">
          <legend className="px-1 text-size-small font-medium text-subtle">
            {labels[index]}
          </legend>
          <div className="grid grid-cols-2 gap-3">
            {(["x", "y"] as const).map((axis) => {
              const label = `${labels[index]}: ${translate(axis === "x" ? "flow" : "head")} (${axis === "x" ? flowUnit : headUnit})`;
              return (
                <div
                  key={axis}
                  className="min-w-0 space-y-1 [&_input]:min-h-11"
                >
                  <span className="text-size-small text-subtle">
                    {translate(axis === "x" ? "flow" : "head")} (
                    {axis === "x" ? flowUnit : headUnit})
                  </span>
                  <NumericField
                    label={label}
                    displayValue={localizeDecimal(point[axis])}
                    readOnly={
                      readOnly ||
                      (!isDesignPoint && index === 0 && axis === "x")
                    }
                    isRequired
                    commitInvalidValues
                    validate={(value) => value >= 0}
                    onChangeValue={(value, isEmpty) => {
                      if (isEmpty) return;
                      onChange(
                        definition.head.points.map((current, pointIndex) =>
                          pointIndex === index
                            ? { ...current, [axis]: value }
                            : current,
                        ),
                      );
                    }}
                  />
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
};
