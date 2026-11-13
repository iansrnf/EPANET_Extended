import { useMemo } from "react";
import {
  getPumpDefinitionWireEfficiencyPoints,
  getPumpDefinitionErrors,
  type CurvePoint,
} from "@epanet-js/hydraulic-model";
import { localizeDecimal } from "@epanet-js/i18n";
import {
  DataGrid,
  floatColumn,
  type GridColumn,
  type RowAction,
} from "src/components/data-grid";
import { Checkbox } from "src/components/form/Checkbox";
import { DeleteIcon } from "src/icons";
import { useTranslate } from "src/hooks/use-translate";
import { useTranslateUnit } from "src/hooks/use-translate-unit";
import { DefinitionCard, DefinitionNumberField } from "./definition-fields";
import { DefinitionGraph } from "./definition-graph";
import type { PumpDefinitionEditorProps } from "./pump-definition-editor";

export const MotorTab = ({
  definition,
  units,
  readOnly = false,
  speed = 1,
  onChange,
}: PumpDefinitionEditorProps) => {
  const translate = useTranslate();
  const translateUnit = useTranslateUnit();
  const motor = definition.motor;
  const wirePoints = getPumpDefinitionWireEfficiencyPoints(definition, speed);
  const drivePoints = getPumpDefinitionErrors(definition).some((error) =>
    error.path.startsWith("motor.points"),
  )
    ? []
    : motor.points;
  const update = (changes: Partial<typeof motor>) =>
    onChange({ ...definition, motor: { ...motor, ...changes } });

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <p
        role="note"
        className="rounded-lg border border-info bg-info-subtle p-3 text-size-base leading-relaxed text-info lg:col-span-2"
      >
        {translate("pumpDefinitionEditor.energySpeedNote")}
      </p>
      <DefinitionCard
        title={translate("pumpDefinitionEditor.motorSettings")}
        description={translate("pumpDefinitionEditor.motorDescription")}
      >
        <div className="space-y-4">
          <DefinitionNumberField
            label={translate("pumpDefinitionEditor.motorEfficiency")}
            value={motor.efficiency}
            unit="%"
            readOnly={readOnly}
            validate={(value) => value > 0 && value <= 100}
            onChange={(efficiency) => update({ efficiency })}
          />
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md bg-panel px-3 py-2 text-size-base text-default">
            <Checkbox
              checked={motor.variableSpeedDrive}
              disabled={readOnly}
              onChange={(event) =>
                update({ variableSpeedDrive: event.target.checked })
              }
            />
            {translate("pumpDefinitionEditor.includeDriveEfficiency")}
          </label>
          {motor.variableSpeedDrive && (
            <div className="space-y-3">
              <p className="text-size-small leading-relaxed text-subtle">
                {translate("pumpDefinitionEditor.driveDescription")}
              </p>
              <DriveEfficiencyTable
                points={motor.points}
                readOnly={readOnly}
                onChange={(points) => update({ points })}
              />
            </div>
          )}
        </div>
      </DefinitionCard>
      <div className="min-w-0 space-y-4">
        <DefinitionGraph
          title={translate("pumpDefinitionEditor.wireGraph")}
          description={translate(
            "pumpDefinitionEditor.wireDescription",
            localizeDecimal(speed),
          )}
          points={wirePoints.filter(
            (_, index) => index === 0 || index === wirePoints.length - 1,
          )}
          linePoints={wirePoints}
          xLabel={`${translate("flow")} (${translateUnit(units.flow)})`}
          yLabel={`${translate("pumpDefinitionEditor.wireEfficiency")} (%)`}
        />
        <p className="text-size-small leading-relaxed text-subtle">
          {translate("pumpDefinitionEditor.energyEfficiencyLimit")}
        </p>
        {motor.variableSpeedDrive && (
          <DefinitionGraph
            title={translate("pumpDefinitionEditor.driveGraph")}
            points={drivePoints}
            linePoints={drivePoints}
            xLabel={translate("pumpDefinitionEditor.relativeSpeed")}
            yLabel={`${translate("pumpDefinitionEditor.driveEfficiency")} (%)`}
          />
        )}
      </div>
    </div>
  );
};

const DriveEfficiencyTable = ({
  points,
  onChange,
  readOnly,
}: {
  points: CurvePoint[];
  onChange: (points: CurvePoint[]) => void;
  readOnly: boolean;
}) => {
  const translate = useTranslate();
  const columns: GridColumn<CurvePoint>[] = useMemo(
    () => [
      floatColumn("x", {
        header: translate("pumpDefinitionEditor.relativeSpeed"),
        size: 110,
        emptyValue: 0,
      }),
      floatColumn("y", {
        header: `${translate("pumpDefinitionEditor.driveEfficiency")} (%)`,
        size: 110,
        emptyValue: 0,
      }),
    ],
    [translate],
  );
  const rowActions: RowAction[] = [
    {
      label: translate("delete"),
      icon: <DeleteIcon size="sm" />,
      onSelect: (index) =>
        onChange(points.filter((_, pointIndex) => pointIndex !== index)),
    },
  ];

  return (
    <div className="h-48 min-w-0 overflow-hidden rounded-md border">
      <DataGrid<CurvePoint>
        data={points}
        columns={columns}
        onChange={onChange}
        onDelete={(removed) => {
          const selected = new Set(removed);
          onChange(points.filter((point) => !selected.has(point)));
        }}
        createRow={() => ({ x: 1, y: 95 })}
        rowActions={rowActions}
        addRowLabel={translate("addPoint")}
        gutterColumn="numbered"
        variant="spreadsheet"
        readOnly={readOnly}
        autoAddNewRows
        cellHasWarning={(index, column) => {
          const point = points[index];
          if (!point) return false;
          return column === "y"
            ? !(point.y > 0 && point.y <= 100)
            : !Number.isFinite(point.x) ||
                point.x < 0 ||
                (index > 0 && point.x <= points[index - 1].x);
        }}
      />
    </div>
  );
};
