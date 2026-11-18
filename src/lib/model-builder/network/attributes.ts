import type { Feature } from "geojson";
import { convertTo, type Unit } from "@epanet-js/quantity";
import type { SourceUnits } from "@epanet-js/converters";
import type {
  NetworkBuildIssue,
  NetworkFilter,
  NetworkLayer,
  NetworkValue,
} from "./types";

type AttributeContext = {
  layer: NetworkLayer;
  feature: Feature;
  ref: string;
  units: SourceUnits;
  issues: NetworkBuildIssue[];
};

export const matchesNetworkFilter = (
  feature: Feature,
  filter: NetworkFilter,
): boolean => {
  const actual: unknown = feature.properties?.[filter.attribute];
  const empty =
    actual === null || actual === undefined || String(actual).trim() === "";
  const actualNumber = numeric(actual);
  const expectedNumber = numeric(filter.value);
  switch (filter.operator) {
    case "isEmpty":
      return empty;
    case "isNotEmpty":
      return !empty;
    case "equals":
      return !empty && String(actual) === String(filter.value ?? "");
    case "notEquals":
      return empty || String(actual) !== String(filter.value ?? "");
    case "contains":
      return (
        !empty &&
        String(actual)
          .toLowerCase()
          .includes(String(filter.value ?? "").toLowerCase())
      );
    case "greaterThan":
      return (
        actualNumber !== undefined &&
        expectedNumber !== undefined &&
        actualNumber > expectedNumber
      );
    case "lessThan":
      return (
        actualNumber !== undefined &&
        expectedNumber !== undefined &&
        actualNumber < expectedNumber
      );
    case "greaterOrEquals":
      return (
        actualNumber !== undefined &&
        expectedNumber !== undefined &&
        actualNumber >= expectedNumber
      );
    case "lessOrEquals":
      return (
        actualNumber !== undefined &&
        expectedNumber !== undefined &&
        actualNumber <= expectedNumber
      );
  }
};

export const readNetworkAttributes = (
  context: AttributeContext,
): Record<string, NetworkValue> => {
  const values: Record<string, NetworkValue> = { ...context.layer.defaults };
  for (const [property, attribute] of Object.entries(
    context.layer.mapping ?? {},
  )) {
    if (!attribute) continue;
    const value: unknown = context.feature.properties?.[attribute];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      )
        values[property] = value;
      else if (
        property === "year" &&
        value instanceof Date &&
        Number.isFinite(value.getTime())
      )
        values[property] = value.getFullYear();
      else invalid(context, property);
    }
  }
  for (const rule of context.layer.rules ?? []) {
    if (matchesNetworkFilter(context.feature, rule))
      values[rule.property] = rule.result;
  }
  return values;
};

export const readNumericAttribute = (
  values: Record<string, NetworkValue>,
  property: string,
  context: AttributeContext,
  quantity?: keyof SourceUnits,
): number | undefined => {
  const raw = values[property];
  if (raw === undefined || raw === "") return undefined;
  const parsed = parseNumericProperty(property, raw);
  const valid = parsed !== undefined && validNumericProperty(property, parsed);
  if (!valid) {
    invalid(context, property);
  }
  const fallback = parseNumericProperty(
    property,
    context.layer.defaults?.[property],
  );
  const value = valid
    ? parsed
    : fallback !== undefined && validNumericProperty(property, fallback)
      ? fallback
      : undefined;
  if (value === undefined) return undefined;
  if (!quantity) return value;
  const sourceUnit = context.layer.units?.[quantity];
  const targetUnit = context.units[quantity];
  if (!sourceUnit || !targetUnit || sourceUnit === targetUnit) return value;
  try {
    return convertTo({ value, unit: sourceUnit as Unit }, targetUnit as Unit);
  } catch {
    invalid(context, property);
    return undefined;
  }
};

export const readTextAttribute = (
  values: Record<string, NetworkValue>,
  property: string,
): string | undefined => {
  const value = values[property];
  if (value === undefined || String(value).trim() === "") return undefined;
  return String(value).trim();
};

export const readBooleanAttribute = (
  values: Record<string, NetworkValue>,
  property: string,
): boolean | undefined => {
  const value = values[property];
  if (typeof value === "boolean") return value;
  if (value === undefined) return undefined;
  if (["true", "yes", "1"].includes(String(value).toLowerCase())) return true;
  if (["false", "no", "0"].includes(String(value).toLowerCase())) return false;
  return undefined;
};

const numeric = (value: unknown): number | undefined => {
  if (typeof value === "boolean" || value === null || value === undefined)
    return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  const number = Number(
    typeof value === "string"
      ? value.trim().replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, "")
      : value,
  );
  return Number.isFinite(number) ? number : undefined;
};

const parseNumericProperty = (
  property: string,
  raw: unknown,
): number | undefined => {
  if (property === "year" && typeof raw === "string") {
    const year = raw.match(/(?:^|[/.-])(\d{4})(?:$|T|[/.-])/);
    if (year) return Number(year[1]);
  }
  return numeric(raw);
};

const validNumericProperty = (property: string, value: number): boolean => {
  if (["diameter", "length"].includes(property)) return value > 0;
  if (
    ["minorLoss", "minVolume", "roughness", "speed", "setting"].includes(
      property,
    )
  )
    return value >= 0;
  if (property === "year")
    return Number.isInteger(value) && value >= 0 && value <= 9999;
  return true;
};

const invalid = (context: AttributeContext, property: string) => {
  context.issues.push({
    code: "invalidValue",
    severity: "warning",
    layerId: context.layer.id,
    ref: context.ref,
    context: {
      property,
      attribute: context.layer.mapping?.[property] ?? property,
    },
  });
};
