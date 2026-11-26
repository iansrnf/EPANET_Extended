import { HydraulicModel, Pipe } from "src/hydraulic-model";
import { effectiveRoughness } from "@epanet-js/hydraulic-model";
import { getSortedValues } from "@epanet-js/hydraulic-model";
import { EPSResultsReader } from "src/simulation/epanet/eps-results-reader";
import {
  type ResultsReader,
  type SimulationProperty as NativeSimulationProperty,
  isSimulationProperty as isNativeSimulationProperty,
  simulationProperties as nativeSimulationProperties,
} from "@epanet-js/simulation";
import type { Unit } from "@epanet-js/quantity";
import {
  type PsiPressureProperty,
  isPsiPressureProperty,
  pressurePropertyFor,
  pressureToPsiFactor,
} from "./pressure-properties";

export const simulationProperties = [
  ...nativeSimulationProperties,
  "pressurePsi",
  "minPressurePsi",
  "maxPressurePsi",
] as const;

export type SimulationProperty = NativeSimulationProperty | PsiPressureProperty;

export const isSimulationProperty = (
  property: string,
): property is SimulationProperty =>
  isNativeSimulationProperty(property) || isPsiPressureProperty(property);

type SimulationValueOptions = {
  absValues?: boolean;
  pressureUnit?: Unit;
};

const getSimulationValues = (
  resultsReader: ResultsReader,
  property: SimulationProperty,
  { absValues = false, pressureUnit }: SimulationValueOptions = {},
): Float32Array => {
  let values: Float32Array;
  if (isPsiPressureProperty(property)) {
    if (pressureUnit == null) {
      throw new Error("A source pressure unit is required for PSI symbology");
    }
    const factor = pressureToPsiFactor(pressureUnit);
    const sourceProperty = pressurePropertyFor(property)!;
    values = Float32Array.from(
      resultsReader.getAllValues(sourceProperty),
      (value) => value * factor,
    );
  } else {
    values = resultsReader.getAllValues(property);
  }
  if (absValues) {
    for (let i = 0; i < values.length; i++) values[i] = Math.abs(values[i]);
  }
  return values;
};

export const getSortedSimulationValues = (
  resultsReader: ResultsReader,
  property: SimulationProperty,
  options?: SimulationValueOptions,
): number[] =>
  Array.from(getSimulationValues(resultsReader, property, options).sort());

export type BreaksDataMode = "currentStep" | "initial" | "allSteps";

export type SimulationDataSource =
  | { mode: "currentStep"; resultsReader: ResultsReader }
  | {
      mode: "initial";
      epsReader: EPSResultsReader;
      resultsReader?: ResultsReader | null;
    }
  | {
      mode: "allSteps";
      epsReader: EPSResultsReader;
      resultsReader?: ResultsReader | null;
    };

export const getSortedSimulationDataForBreaks = async (
  property: SimulationProperty,
  source: SimulationDataSource,
  options?: SimulationValueOptions,
): Promise<number[] | null> => {
  const resolvedOptions: SimulationValueOptions | undefined =
    isPsiPressureProperty(property) &&
    options?.pressureUnit == null &&
    source.mode !== "currentStep"
      ? {
          ...options,
          pressureUnit:
            source.epsReader.pressureUnits === "m"
              ? "mwc"
              : source.epsReader.pressureUnits === "ft"
                ? "fwc"
                : source.epsReader.pressureUnits,
        }
      : options;
  switch (source.mode) {
    case "currentStep":
      return getSortedSimulationValues(
        source.resultsReader,
        property,
        resolvedOptions,
      );
    case "initial": {
      const data = await getInitialSortedValues(
        source.epsReader,
        property,
        resolvedOptions,
      );
      if (data) return data;
      return source.resultsReader
        ? getSortedSimulationValues(
            source.resultsReader,
            property,
            resolvedOptions,
          )
        : null;
    }
    case "allSteps": {
      const data = await getAllStepsSortedValues(
        source.epsReader,
        property,
        resolvedOptions,
      );
      if (data) return data;
      return source.resultsReader
        ? getSortedSimulationValues(
            source.resultsReader,
            property,
            resolvedOptions,
          )
        : null;
    }
  }
};

const getAllStepsSortedValues = async (
  epsReader: EPSResultsReader,
  property: SimulationProperty,
  options?: SimulationValueOptions,
): Promise<number[] | null> => {
  const timestepCount = epsReader.timestepCount;
  if (timestepCount <= 0) return null;

  let allValues = new Float32Array(0);
  let totalValues = 0;
  for (let t = 0; t < timestepCount; t++) {
    const reader = await epsReader.getResultsForTimestep(t);
    const values = getSimulationValues(reader, property, options);
    if (totalValues + values.length > allValues.length) {
      const grown = new Float32Array(
        totalValues + values.length * (timestepCount - t),
      );
      grown.set(allValues.subarray(0, totalValues));
      allValues = grown;
    }
    allValues.set(values, totalValues);
    totalValues += values.length;
  }

  return Array.from(allValues.subarray(0, totalValues).sort());
};

const getInitialSortedValues = async (
  epsReader: EPSResultsReader,
  property: SimulationProperty,
  options?: SimulationValueOptions,
): Promise<number[] | null> => {
  const lastIndex = epsReader.timestepCount - 1;
  if (lastIndex < 0) return null;

  const firstReader = await epsReader.getResultsForTimestep(0);
  const firstValues = getSortedSimulationValues(firstReader, property, options);
  if (lastIndex === 0) return firstValues;

  const lastReader = await epsReader.getResultsForTimestep(lastIndex);
  const lastValues = getSortedSimulationValues(lastReader, property, options);
  return mergeSorted(firstValues, lastValues);
};

const mergeSorted = (a: number[], b: number[]): number[] => {
  const result: number[] = new Array(a.length + b.length);
  let i = 0;
  let j = 0;
  let k = 0;
  while (i < a.length && j < b.length) {
    if (a[i] <= b[j]) {
      result[k++] = a[i++];
    } else {
      result[k++] = b[j++];
    }
  }
  while (i < a.length) result[k++] = a[i++];
  while (j < b.length) result[k++] = b[j++];
  return result;
};

/**
 * Synchronous helper for the common "current visible timestep" path. Used by
 * the regenerate hook and the symbology builders, which both run inline and
 * don't need the async dispatch wrapper.
 */
export const getSortedDataForProperty = (
  property: string,
  hydraulicModel: HydraulicModel,
  resultsReader: ResultsReader | null,
  options?: SimulationValueOptions,
): number[] => {
  if (resultsReader && isSimulationProperty(property)) {
    return getSortedSimulationValues(resultsReader, property, options);
  }
  if (property === "roughness") {
    return sortedEffectiveRoughness(hydraulicModel);
  }
  return getSortedValues(hydraulicModel.assets, property, options);
};

const sortedEffectiveRoughness = (hydraulicModel: HydraulicModel): number[] => {
  const values: number[] = [];
  for (const asset of hydraulicModel.assets.values()) {
    if (asset.type !== "pipe") continue;

    const value = effectiveRoughness(
      asset as Pipe,
      hydraulicModel.pipeMaterials,
    );
    if (value !== null) values.push(value);
  }
  return values.sort((a, b) => a - b);
};
