import { useState } from "react";
import type { Feature } from "geojson";
import type { SourceAttribute } from "@epanet-js/gis-importers";
import type { SourceUnits } from "@epanet-js/converters";
import { Button } from "src/components/elements";
import { CloseIcon } from "src/icons";
import type {
  NetworkAttributeRule,
  NetworkFilter,
} from "src/lib/model-builder/network";
import {
  featuresForLayer,
  mappingFields,
  roleNames,
  valueAsText,
  type BuilderLayer,
  type MappingField,
} from "./data";

export const controlClass =
  "min-h-9 w-full rounded-sm border bg-base px-2 py-1.5 text-sm text-default outline-hidden focus:border-accent focus:ring-1 focus:ring-accent";

const operators: { value: NetworkFilter["operator"]; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "notEquals", label: "does not equal" },
  { value: "contains", label: "contains" },
  { value: "greaterOrEquals", label: "is at least (≥)" },
  { value: "lessOrEquals", label: "is at most (≤)" },
  { value: "greaterThan", label: "is greater than (>)" },
  { value: "lessThan", label: "is less than (<)" },
  { value: "isEmpty", label: "is empty" },
  { value: "isNotEmpty", label: "is not empty" },
];

export const Field = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <label className="block space-y-1.5 text-sm">
    <span className="block text-subtle">{label}</span>
    {children}
    {hint && (
      <span className="block text-xs leading-relaxed text-subtle">{hint}</span>
    )}
  </label>
);

export const FiltersEditor = ({
  filters,
  attributes,
  onChange,
}: {
  filters: NetworkFilter[];
  attributes: SourceAttribute[];
  onChange: (filters: NetworkFilter[]) => void;
}) => (
  <div className="space-y-3">
    <div>
      <h3 className="text-sm font-medium">Record filters</h3>
      <p className="mt-1 text-xs text-subtle">
        Keep records that match every condition. Leave empty to include all
        records.
      </p>
    </div>
    {filters.map((filter, index) => (
      <div className="space-y-2 rounded-sm border bg-panel p-3" key={index}>
        <div className="flex items-center gap-2">
          <span className="text-xs text-subtle">
            {index === 0 ? "Where" : "AND"}
          </span>
          <Button
            className="ml-auto"
            variant="quiet"
            size="sm"
            aria-label={`Remove filter ${index + 1}`}
            onClick={() =>
              onChange(filters.filter((_, current) => current !== index))
            }
          >
            <CloseIcon size="sm" />
          </Button>
        </div>
        <FilterInputs
          filter={filter}
          attributes={attributes}
          onChange={(next) =>
            onChange(
              filters.map((value, current) =>
                current === index ? next : value,
              ),
            )
          }
        />
      </div>
    ))}
    <Button
      size="sm"
      disabled={attributes.length === 0}
      onClick={() =>
        onChange([
          ...filters,
          {
            attribute: attributes[0]?.name ?? "",
            operator: "equals",
            value: "",
          },
        ])
      }
    >
      Add condition
    </Button>
  </div>
);

export const AttributeMapping = ({
  layer,
  attributes,
  prefix,
  onPrefixChange,
  onChange,
}: {
  layer: BuilderLayer;
  attributes: SourceAttribute[];
  prefix: string;
  onPrefixChange: (value: string) => void;
  onChange: (layer: BuilderLayer) => void;
}) => {
  const [tab, setTab] = useState<"properties" | "rules" | "custom">(
    "properties",
  );
  const fields = mappingFields[layer.role];
  const setDefault = (field: MappingField, raw: string) => {
    const defaults = { ...layer.defaults };
    if (raw === "") delete defaults[field.key];
    else if (field.numeric) {
      const value = Number(raw);
      if (Number.isFinite(value)) defaults[field.key] = value;
    } else if (field.key === "overflow") defaults[field.key] = raw === "true";
    else defaults[field.key] = raw;
    onChange({ ...layer, defaults });
  };

  return (
    <div className="min-w-0 space-y-5 p-5">
      <div>
        <h2 className="text-base font-semibold">
          {roleNames[layer.role]} · {layer.name}
        </h2>
        <p className="mt-1 text-sm text-subtle">
          Map source attributes to model properties. Defaults apply when a
          mapped value is empty.
        </p>
      </div>
      <div
        className="flex gap-1 border-b"
        role="tablist"
        aria-label="Mapping options"
      >
        {(
          [
            ["properties", "Properties"],
            ["rules", "Value rules"],
            ["custom", "Custom attributes"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={`min-h-10 border-b-2 px-3 text-sm ${tab === value ? "border-accent font-medium text-accent" : "border-transparent text-subtle hover:text-default"}`}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "properties" && (
        <div className="space-y-5">
          <Field
            label="Generated ID prefix"
            hint="Used when an ID is not mapped. This prefix applies to this element type."
          >
            <input
              className={controlClass}
              value={prefix}
              onChange={(event) => onPrefixChange(event.target.value)}
              maxLength={16}
            />
          </Field>
          <div className="space-y-4">
            {fields.map((field) => (
              <div
                key={field.key}
                className="space-y-2 border-b pb-4 last:border-0"
              >
                <div className="text-sm font-medium">{field.label}</div>
                <Field label="Source attribute">
                  <select
                    className={controlClass}
                    value={layer.mapping?.[field.key] ?? ""}
                    onChange={(event) =>
                      onChange({
                        ...layer,
                        mapping: {
                          ...layer.mapping,
                          [field.key]: event.target.value || null,
                        },
                      })
                    }
                  >
                    <option value="">
                      {field.key === "label"
                        ? "Generate unique IDs"
                        : field.key === "length"
                          ? "Calculate from geometry"
                          : "Use default / leave empty"}
                    </option>
                    {attributes.map(({ name }) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>
                {field.key !== "label" && (
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <Field label="Default value">
                        {field.options ? (
                          <select
                            className={controlClass}
                            value={valueAsText(layer.defaults?.[field.key])}
                            onChange={(event) =>
                              setDefault(field, event.target.value)
                            }
                          >
                            <option value="">
                              {field.key === "initialStatus" &&
                              layer.role === "valve"
                                ? "Automatic"
                                : "No default"}
                            </option>
                            {field.options.map((option) => (
                              <option key={option} value={option}>
                                {option === "true"
                                  ? "Yes"
                                  : option === "false"
                                    ? "No"
                                    : option.toUpperCase()}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={field.numeric ? "number" : "text"}
                            step="any"
                            className={controlClass}
                            placeholder="Empty"
                            value={valueAsText(layer.defaults?.[field.key])}
                            onChange={(event) =>
                              setDefault(field, event.target.value)
                            }
                          />
                        )}
                      </Field>
                    </div>
                    {field.unit && (
                      <div className="w-24">
                        <Field label="Units">
                          <select
                            className={controlClass}
                            value={layer.units?.[field.unit] ?? ""}
                            onChange={(event) =>
                              onChange({
                                ...layer,
                                units: {
                                  ...layer.units,
                                  [field.unit as keyof SourceUnits]:
                                    event.target.value,
                                },
                              })
                            }
                          >
                            {unitChoices(field.unit).map((unit) => (
                              <option key={unit} value={unit}>
                                {unit}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </div>
                    )}
                  </div>
                )}
                {field.hint && (
                  <p className="text-xs leading-relaxed text-subtle">
                    {field.hint}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === "rules" && (
        <AttributeRules
          layer={layer}
          attributes={attributes}
          onChange={(rules) => onChange({ ...layer, rules })}
        />
      )}
      {tab === "custom" && (
        <div className="space-y-3">
          <p className="text-sm text-subtle">
            Keep source attributes alongside the hydraulic properties. Selected
            numeric and text values are available in the model's custom
            attributes.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() =>
                onChange({
                  ...layer,
                  customAttributes: attributes.map(({ name }) => name),
                })
              }
            >
              Select all
            </Button>
            <Button
              size="sm"
              variant="quiet"
              onClick={() => onChange({ ...layer, customAttributes: [] })}
            >
              Clear
            </Button>
          </div>
          {attributes.map(({ name, type }) => (
            <label
              key={name}
              className="flex min-h-10 items-center gap-3 rounded-sm border px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                className="accent-accent"
                checked={layer.customAttributes?.includes(name) ?? false}
                onChange={(event) =>
                  onChange({
                    ...layer,
                    customAttributes: event.target.checked
                      ? [...(layer.customAttributes ?? []), name]
                      : layer.customAttributes?.filter(
                          (value) => value !== name,
                        ),
                  })
                }
              />
              <span className="min-w-0 flex-1 truncate">{name}</span>
              <span className="text-xs text-subtle">{type}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

export const SourceTable = ({
  features,
  attributes,
  caption,
}: {
  features: Feature[];
  attributes: SourceAttribute[];
  caption?: string;
}) => (
  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="border-b px-4 py-3 text-sm">
      <span className="font-medium">Source data</span>
      <span className="ml-2 text-subtle">
        {caption ?? `${features.length.toLocaleString()} records`}
      </span>
    </div>
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full border-collapse whitespace-nowrap text-left text-xs">
        <thead className="sticky top-0 z-10 bg-panel">
          <tr>
            <th className="border-b border-r px-3 py-2 font-medium text-subtle">
              #
            </th>
            {attributes.map(({ name }) => (
              <th
                key={name}
                className="border-b border-r px-3 py-2 font-medium"
              >
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {features.slice(0, 100).map((feature, index) => (
            <tr key={index} className="hover:bg-base-hover">
              <td className="border-b border-r px-3 py-2 text-subtle">
                {index + 1}
              </td>
              {attributes.map(({ name }) => {
                const text = valueAsText(feature.properties?.[name]);
                return (
                  <td
                    key={name}
                    className="max-w-56 truncate border-b border-r px-3 py-2"
                    title={text}
                  >
                    {text || <span className="text-disabled">—</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {features.length === 0 && (
        <p className="p-6 text-sm text-subtle">
          No records match the current filters.
        </p>
      )}
    </div>
    <p className="border-t px-4 py-2 text-xs text-subtle">
      Showing the first {Math.min(100, features.length).toLocaleString()}{" "}
      records. All matching records are included in the build.
    </p>
  </div>
);

const AttributeRules = ({
  layer,
  attributes,
  onChange,
}: {
  layer: BuilderLayer;
  attributes: SourceAttribute[];
  onChange: (rules: NetworkAttributeRule[]) => void;
}) => {
  const rules = layer.rules ?? [];
  const fields = mappingFields[layer.role].filter(({ key }) => key !== "label");
  const change = (index: number, patch: Partial<NetworkAttributeRule>) =>
    onChange(
      rules.map((rule, current) =>
        current === index ? { ...rule, ...patch } : rule,
      ),
    );
  return (
    <div className="space-y-4">
      <p className="text-sm text-subtle">
        Set model properties when a source value matches. Rules run in order;
        later matching rules override earlier values.
      </p>
      {rules.map((rule, index) => {
        const target = fields.find(({ key }) => key === rule.property);
        return (
          <div key={index} className="space-y-3 rounded-sm border bg-panel p-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium">Rule {index + 1}</h3>
              <Button
                variant="quiet"
                size="sm"
                className="ml-auto"
                aria-label={`Remove value rule ${index + 1}`}
                onClick={() =>
                  onChange(rules.filter((_, current) => current !== index))
                }
              >
                <CloseIcon size="sm" />
              </Button>
            </div>
            <FilterInputs
              filter={rule}
              attributes={attributes}
              onChange={(filter) => change(index, filter)}
            />
            <Field label="Set property">
              <select
                className={controlClass}
                value={rule.property}
                onChange={(event) =>
                  change(index, { property: event.target.value, result: "" })
                }
              >
                {fields.map(({ key, label }) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="To value">
              {target?.options ? (
                <select
                  className={controlClass}
                  value={valueAsText(rule.result)}
                  onChange={(event) =>
                    change(index, { result: event.target.value })
                  }
                >
                  <option value="">Choose value</option>
                  {target.options.map((option) => (
                    <option key={option} value={option}>
                      {option.toUpperCase()}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={controlClass}
                  type={target?.numeric ? "number" : "text"}
                  step="any"
                  value={valueAsText(rule.result)}
                  onChange={(event) => {
                    const raw = event.target.value;
                    change(index, {
                      result: target?.numeric && raw !== "" ? Number(raw) : raw,
                    });
                  }}
                />
              )}
            </Field>
          </div>
        );
      })}
      <Button
        size="sm"
        disabled={attributes.length === 0 || fields.length === 0}
        onClick={() =>
          onChange([
            ...rules,
            {
              attribute: attributes[0]?.name ?? "",
              operator: "equals",
              value: "",
              property: fields[0]?.key ?? "",
              result: "",
            },
          ])
        }
      >
        Add value rule
      </Button>
      {rules.length > 0 && (
        <p className="text-xs text-subtle">
          {featuresForLayer(layer).length.toLocaleString()} records are included
          before value rules.
        </p>
      )}
    </div>
  );
};

const FilterInputs = ({
  filter,
  attributes,
  onChange,
}: {
  filter: NetworkFilter;
  attributes: SourceAttribute[];
  onChange: (filter: NetworkFilter) => void;
}) => (
  <div className="space-y-2">
    <select
      aria-label="Condition attribute"
      className={controlClass}
      value={filter.attribute}
      onChange={(event) =>
        onChange({ ...filter, attribute: event.target.value })
      }
    >
      {attributes.map(({ name }) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
    <select
      aria-label="Condition operator"
      className={controlClass}
      value={filter.operator}
      onChange={(event) =>
        onChange({
          ...filter,
          operator: event.target.value as NetworkFilter["operator"],
        })
      }
    >
      {operators.map(({ value, label }) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
    {!(["isEmpty", "isNotEmpty"] as string[]).includes(filter.operator) && (
      <input
        aria-label="Condition value"
        className={controlClass}
        placeholder="Value"
        value={valueAsText(filter.value)}
        onChange={(event) => onChange({ ...filter, value: event.target.value })}
      />
    )}
  </div>
);

const unitChoices = (quantity: keyof SourceUnits): string[] => {
  if (quantity === "flow" || quantity === "customerDemand")
    return [
      "l/s",
      "l/min",
      "l/d",
      "m^3/h",
      "m^3/d",
      "Ml/d",
      "gal/min",
      "gal/d",
      "Mgal/d",
      "IMgal/d",
      "ft^3/s",
      "acft/d",
    ];
  if (quantity === "diameter") return ["mm", "in", "m", "ft"];
  if (quantity === "volume") return ["m^3", "ft^3"];
  if (quantity === "pressure") return ["mwc", "psi", "kPa", "bar", "fwc"];
  return ["m", "ft", "mm", "km", "in"];
};
