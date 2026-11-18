import { useMemo } from "react";
import type { Feature } from "geojson";
import type { SourceUnits } from "@epanet-js/converters";
import { convertTo, type Unit } from "@epanet-js/quantity";
import { useLocale } from "src/hooks/use-locale";
import { WarningIcon } from "src/icons";
import type {
  NetworkBuildIssue,
  NetworkValue,
} from "src/lib/model-builder/network";
import {
  matchesNetworkFilter,
  readBooleanAttribute,
  readNetworkAttributes,
  readNumericAttribute,
  readTextAttribute,
} from "src/lib/model-builder/network/attributes";
import {
  pipeStatus,
  pumpStatus,
  valveKind,
  valveStatus,
} from "src/lib/model-builder/network/build-network";
import { geographicLength } from "src/lib/model-builder/network/geometry";
import {
  featuresForLayer,
  mappingFields,
  sourceUnitsFor,
  valueAsText,
  type BuilderLayer,
  type BuilderSettings,
  type BuilderSource,
  type MappingField,
} from "./data";

type PreviewCell = {
  value: NetworkValue | undefined;
  fromDefault: boolean;
  warning?: string;
};
type PreviewRow = { cells: Record<string, PreviewCell> };
type PreviewColumn = { key: string; label: string; unit?: string };

export const MappedPreview = ({
  layer,
  settings,
  sources,
}: {
  layer: BuilderLayer;
  settings: BuilderSettings;
  sources: BuilderSource[];
}) => {
  const { locale } = useLocale();
  const preview = useMemo(
    () => mappedPreviewOf(layer, settings, sources),
    [layer, settings, sources],
  );
  const numberFormat = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        maximumFractionDigits: 6,
        useGrouping: false,
      }),
    [locale],
  );
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="border-b px-4 py-3 text-sm">
        <span className="font-medium">Imported preview</span>
        <span className="ml-2 text-subtle">
          {preview.total.toLocaleString()} matching records
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse whitespace-nowrap text-left text-xs">
          <caption className="sr-only">
            Mapped properties and defaults for {layer.name}
          </caption>
          <thead className="sticky top-0 z-10 bg-panel">
            <tr>
              <th
                scope="col"
                className="border-b border-r px-3 py-2 font-medium text-subtle"
              >
                #
              </th>
              {preview.columns.map((column) => (
                <th
                  scope="col"
                  key={column.key}
                  className="border-b border-r px-3 py-2 font-medium"
                >
                  {column.label}
                  {column.unit ? ` (${column.unit})` : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, index) => (
              <tr key={index} className="hover:bg-base-hover">
                <th
                  scope="row"
                  className="border-b border-r px-3 py-2 font-normal text-subtle"
                >
                  {index + 1}
                </th>
                {preview.columns.map(({ key }) => {
                  const cell = row.cells[key];
                  const value = cell?.value;
                  const text =
                    value === undefined
                      ? "Empty"
                      : typeof value === "number"
                        ? numberFormat.format(value)
                        : valueAsText(value);
                  return (
                    <td
                      key={key}
                      className={`max-w-56 border-b border-r px-3 py-2 ${cell?.warning ? "bg-warning-subtle" : ""}`}
                      title={cell?.warning ?? text}
                    >
                      <span className="inline-flex max-w-full items-center gap-2">
                        <span
                          className={`truncate ${cell?.fromDefault ? "italic text-subtle" : value === undefined ? "text-disabled" : ""}`}
                        >
                          {text}
                        </span>
                        {cell?.warning && (
                          <span
                            className="inline-flex shrink-0 text-warning"
                            role="img"
                            aria-label={cell.warning}
                          >
                            <WarningIcon size="sm" />
                          </span>
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {preview.total === 0 && (
          <p className="p-6 text-sm text-subtle">
            No records match this layer's assignment and filters.
          </p>
        )}
      </div>
      <div className="space-y-1 border-t px-4 py-2 text-xs text-subtle">
        <p>
          Showing the first {preview.rows.length} of{" "}
          {preview.total.toLocaleString()} records. All matching records are
          included in the build.
        </p>
        <p>
          Normal text is mapped data.{" "}
          <em>Italic text is a default or calculated value.</em> Warning marks
          show an unreadable source value and the fallback that will be
          imported.
        </p>
        <p>
          Topology can change generated IDs and pipe lengths. Terrain elevations
          are resolved during the build.
          {layer.role === "zone"
            ? " Zones with the same mapped ID are merged during the build."
            : ""}
        </p>
      </div>
    </div>
  );
};

export const mappedPreviewOf = (
  layer: BuilderLayer,
  settings: BuilderSettings,
  sources: BuilderSource[],
): { columns: PreviewColumn[]; rows: PreviewRow[]; total: number } => {
  const units = sourceUnitsFor(settings);
  const features = featuresForLayer(layer);
  const source = sources.find(({ id }) => id === layer.sourceId);
  const attributes =
    source?.groups.find(({ geometry }) => geometry === layer.geometry)
      ?.attributes ?? source?.attributes;
  const columns: PreviewColumn[] = mappingFields[layer.role].map((field) => ({
    key: field.key,
    label: field.label,
    unit: fieldUnit(field, layer, units),
  }));
  if (layer.role === "customerPoint")
    columns.splice(
      1,
      0,
      { key: "latitude", label: "Latitude" },
      { key: "longitude", label: "Longitude" },
    );
  for (const name of layer.customAttributes ?? [])
    columns.push({ key: `custom:${name}`, label: name });

  const rows = features.slice(0, 100).map((feature, index) => {
    const issues: NetworkBuildIssue[] = [];
    const context = {
      layer,
      feature,
      ref: `${layer.id}:${index}`,
      units,
      issues,
    };
    const values = readNetworkAttributes(context);
    const cells: Record<string, PreviewCell> = {};
    const kind =
      valveKind(values.kind) ?? valveKind(layer.defaults?.kind) ?? "tcv";
    const settingQuantity =
      kind === "fcv"
        ? "flow"
        : ["prv", "psv", "pbv"].includes(kind)
          ? "pressure"
          : undefined;
    const setting =
      layer.role === "valve"
        ? readNumericAttribute(values, "setting", context, settingQuantity)
        : undefined;

    for (const field of mappingFields[layer.role]) {
      let value: NetworkValue | undefined;
      let invalidEnum = false;
      if (field.key === "label")
        value =
          readTextAttribute(values, "label") ??
          `${settings.labelPrefixes[layer.role] ?? ""}${index + 1}`;
      else if (field.key === "kind") {
        value = kind;
        invalidEnum =
          values.kind !== undefined && valveKind(values.kind) === undefined;
      } else if (field.key === "initialStatus") {
        const parse =
          layer.role === "pump"
            ? pumpStatus
            : layer.role === "valve"
              ? valveStatus
              : pipeStatus;
        value =
          parse(values.initialStatus) ??
          parse(layer.defaults?.initialStatus) ??
          (layer.role === "valve"
            ? setting === undefined
              ? "open"
              : "active"
            : undefined);
        invalidEnum =
          values.initialStatus !== undefined &&
          parse(values.initialStatus) === undefined;
      } else if (field.key === "overflow") {
        value =
          readBooleanAttribute(values, "overflow") ??
          readBooleanAttribute(layer.defaults ?? {}, "overflow");
        invalidEnum =
          values.overflow !== undefined &&
          readBooleanAttribute(values, "overflow") === undefined;
      } else if (field.numeric) {
        const quantity = field.key === "setting" ? settingQuantity : field.unit;
        value = readNumericAttribute(values, field.key, context, quantity);
        if (
          field.key === "elevation" &&
          value === undefined &&
          feature.geometry?.type === "Point" &&
          Number.isFinite(feature.geometry.coordinates[2])
        ) {
          value = readNumericAttribute(
            { elevation: feature.geometry.coordinates[2] },
            "elevation",
            context,
            "elevation",
          );
        }
        if (
          field.key === "elevation" &&
          value === undefined &&
          settings.fetchElevations
        )
          value = "Terrain lookup";
        if (
          field.key === "length" &&
          value === undefined &&
          feature.geometry?.type === "LineString"
        ) {
          value = convertTo(
            {
              value: geographicLength(feature.geometry.coordinates),
              unit: "m",
            },
            (units.length ?? "m") as Unit,
          );
        }
      } else value = readTextAttribute(values, field.key);

      const invalid =
        invalidEnum ||
        issues.some((issue) => issue.context?.property === field.key);
      const attribute = layer.mapping?.[field.key];
      const attributeMissing =
        !!attribute &&
        attributes !== undefined &&
        !attributes.some(({ name }) => name === attribute);
      const fromDefault =
        !hasMappedOrRuleValue(feature, layer, field.key) || invalid;
      const warning = invalid
        ? `Cannot read ${attribute ?? field.label} as ${field.label}. Imported value: ${value === undefined ? "empty" : String(value)}.`
        : attributeMissing
          ? `Source attribute "${attribute}" is missing. Imported value: ${value === undefined ? "empty" : String(value)}.`
          : undefined;
      cells[field.key] = {
        value,
        fromDefault: value !== undefined && fromDefault,
        warning,
      };
    }
    if (layer.role === "customerPoint") {
      const coordinates =
        feature.geometry?.type === "Point" ? feature.geometry.coordinates : [];
      cells.latitude = { value: coordinates[1], fromDefault: false };
      cells.longitude = { value: coordinates[0], fromDefault: false };
    }
    for (const name of layer.customAttributes ?? []) {
      const value: unknown = feature.properties?.[name];
      cells[`custom:${name}`] = {
        value:
          value === null || value === undefined
            ? undefined
            : typeof value === "number" || typeof value === "boolean"
              ? value
              : valueAsText(value),
        fromDefault: false,
      };
    }
    return { cells };
  });
  return { columns, rows, total: features.length };
};

const hasMappedOrRuleValue = (
  feature: Feature,
  layer: BuilderLayer,
  property: string,
): boolean => {
  if (
    layer.rules?.some(
      (rule) =>
        rule.property === property && matchesNetworkFilter(feature, rule),
    )
  )
    return true;
  const attribute = layer.mapping?.[property];
  const value: unknown = attribute
    ? feature.properties?.[attribute]
    : undefined;
  return value !== null && value !== undefined && String(value).trim() !== "";
};

const fieldUnit = (
  field: MappingField,
  layer: BuilderLayer,
  units: SourceUnits,
): string | undefined => {
  if (field.unit) return units[field.unit];
  if (field.key === "setting" && layer.role === "valve") return "by valve type";
  return undefined;
};
