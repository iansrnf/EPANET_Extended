import { convertTo, type Unit } from "@epanet-js/quantity";
import type { UnitsSpec } from "@epanet-js/project-settings";

const psiProperties = {
  pressurePsi: "pressure",
  minPressurePsi: "minPressure",
  maxPressurePsi: "maxPressure",
} as const;

export type PsiPressureProperty = keyof typeof psiProperties;
type PressureProperty = (typeof psiProperties)[PsiPressureProperty];

export const isPsiPressureProperty = (
  property: string,
): property is PsiPressureProperty =>
  Object.prototype.hasOwnProperty.call(psiProperties, property);

export const pressurePropertyFor = (
  property: string,
): PressureProperty | null => {
  if (isPsiPressureProperty(property)) return psiProperties[property];
  if (
    property === "pressure" ||
    property === "minPressure" ||
    property === "maxPressure"
  ) {
    return property;
  }
  return null;
};

export const pressureToPsiFactor = (sourceUnit: Unit): number => {
  if (!sourceUnit) throw new Error("Pressure source unit is required");
  const unit =
    sourceUnit === "m" ? "mwc" : sourceUnit === "ft" ? "fwc" : sourceUnit;
  return convertTo({ value: 1, unit }, "psi");
};

export const symbologyUnitFor = (property: string, units: UnitsSpec): Unit => {
  if (isPsiPressureProperty(property)) return "psi";
  if (pressurePropertyFor(property)) return units.pressure;
  return units[property as keyof UnitsSpec] ?? null;
};
