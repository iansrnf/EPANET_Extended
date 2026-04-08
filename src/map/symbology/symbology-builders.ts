import type { UnitsSpec } from "src/lib/project-settings/quantities-spec";
import { initializeColorRule } from "./range-color-rule";
import {
  NodeSymbology,
  LinkSymbology,
  nullSymbologySpec,
} from "./symbology-types";
import { nullLabelRule } from "./labeling";
import type { RangeColorPreference } from "src/state/map-symbology";
import type { RangeColorRule } from "./range-color-rule";
import type { RangeEndpoints } from "./range-color-rule";
import type { Unit } from "src/quantity";

const applyCustomColors = (
  colorRule: RangeColorRule,
  preference?: RangeColorPreference,
): RangeColorRule => {
  if (
    preference?.customColors &&
    preference.customColors.length === colorRule.colors.length
  ) {
    return { ...colorRule, colors: preference.customColors };
  }
  return colorRule;
};

const VELOCITY_FALLBACK_ENDPOINTS: Record<string, RangeEndpoints> = {
  "m/s": [0, 4],
  "ft/s": [0, 10],
};

const UNIT_HEADLOSS_FALLBACK_ENDPOINTS: Record<string, RangeEndpoints> = {
  "m/km": [0, 5],
  "ft/kft": [3, 12],
};

const getFallbackEndpoints = (
  unit: Unit,
  endpoints: Record<string, RangeEndpoints>,
): RangeEndpoints => {
  const result = endpoints[unit as string];
  if (!result) throw new Error(`No fallback endpoints for unit: ${unit}`);
  return result;
};

type SymbologyBuilderFn<T> = (
  units: UnitsSpec,
  sortedData: number[],
  preference?: RangeColorPreference,
) => T;

type SymbologyBuilders = {
  flow: SymbologyBuilderFn<LinkSymbology>;
  diameter: SymbologyBuilderFn<LinkSymbology>;
  roughness: SymbologyBuilderFn<LinkSymbology>;
  unitHeadloss: SymbologyBuilderFn<LinkSymbology>;
  velocity: SymbologyBuilderFn<LinkSymbology>;
  pressure: SymbologyBuilderFn<NodeSymbology>;
  actualDemand: SymbologyBuilderFn<NodeSymbology>;
  elevation: SymbologyBuilderFn<NodeSymbology>;
  head: SymbologyBuilderFn<NodeSymbology>;
  waterAge: SymbologyBuilderFn<NodeSymbology & LinkSymbology>;
};

export const symbologyBuilders: SymbologyBuilders = {
  diameter: (units, sortedData, preference): LinkSymbology => {
    const colorRule = initializeColorRule({
      property: "diameter",
      unit: units.diameter,
      rampName: preference?.rampName ?? "SunsetDark",
      mode: preference?.mode ?? "prettyBreaks",
      numIntervals: preference?.numIntervals ?? 7,
      reverseRamp: preference?.reversedRamp,
      sortedData,
    });
    return {
      colorRule: applyCustomColors(colorRule, preference),
      labelRule: nullLabelRule,
      defaults: nullSymbologySpec.link.defaults,
    };
  },

  roughness: (units, sortedData, preference): LinkSymbology => {
    const colorRule = initializeColorRule({
      property: "roughness",
      unit: units.roughness,
      rampName: preference?.rampName ?? "Emrld",
      mode: preference?.mode ?? "ckmeans",
      numIntervals: preference?.numIntervals,
      reverseRamp: preference?.reversedRamp,
      sortedData,
    });
    return {
      colorRule: applyCustomColors(colorRule, preference),
      labelRule: nullLabelRule,
      defaults: nullSymbologySpec.link.defaults,
    };
  },

  elevation: (units, sortedData, preference): NodeSymbology => {
    const colorRule = initializeColorRule({
      property: "elevation",
      unit: units.elevation,
      rampName: preference?.rampName ?? "Fall",
      mode: preference?.mode ?? "prettyBreaks",
      numIntervals: preference?.numIntervals,
      reverseRamp: preference?.reversedRamp,
      fallbackEndpoints: [0, 100],
      sortedData,
    });
    return {
      colorRule: applyCustomColors(colorRule, preference),
      labelRule: nullLabelRule,
      defaults: nullSymbologySpec.node.defaults,
    };
  },

  flow: (units, sortedData, preference): LinkSymbology => {
    const colorRule = initializeColorRule({
      property: "flow",
      unit: units.flow,
      rampName: preference?.rampName ?? "Teal",
      mode: preference?.mode ?? "equalQuantiles",
      numIntervals: preference?.numIntervals,
      reverseRamp: preference?.reversedRamp,
      absValues: true,
      sortedData,
    });
    return {
      colorRule: applyCustomColors(colorRule, preference),
      labelRule: nullLabelRule,
      defaults: nullSymbologySpec.link.defaults,
    };
  },

  velocity: (units, sortedData, preference): LinkSymbology => {
    const colorRule = initializeColorRule({
      property: "velocity",
      unit: units.velocity,
      rampName: preference?.rampName ?? "RedOr",
      mode: preference?.mode ?? "prettyBreaks",
      numIntervals: preference?.numIntervals,
      reverseRamp: preference?.reversedRamp,
      sortedData,
      fallbackEndpoints: getFallbackEndpoints(
        units.velocity,
        VELOCITY_FALLBACK_ENDPOINTS,
      ),
    });
    return {
      colorRule: applyCustomColors(colorRule, preference),
      labelRule: nullLabelRule,
      defaults: nullSymbologySpec.link.defaults,
    };
  },

  unitHeadloss: (units, sortedData, preference): LinkSymbology => {
    const colorRule = initializeColorRule({
      property: "unitHeadloss",
      unit: units.unitHeadloss,
      rampName: preference?.rampName ?? "Emrld",
      mode: preference?.mode ?? "prettyBreaks",
      numIntervals: preference?.numIntervals,
      reverseRamp: preference?.reversedRamp,
      sortedData,
      fallbackEndpoints: getFallbackEndpoints(
        units.unitHeadloss,
        UNIT_HEADLOSS_FALLBACK_ENDPOINTS,
      ),
    });
    return {
      colorRule: applyCustomColors(colorRule, preference),
      labelRule: nullLabelRule,
      defaults: nullSymbologySpec.link.defaults,
    };
  },

  pressure: (units, sortedData, preference): NodeSymbology => {
    const colorRule = initializeColorRule({
      property: "pressure",
      unit: units.pressure,
      rampName: preference?.rampName ?? "Temps",
      mode: preference?.mode ?? "prettyBreaks",
      numIntervals: preference?.numIntervals,
      reverseRamp: preference?.reversedRamp,
      fallbackEndpoints: [0, 100],
      sortedData,
    });
    return {
      colorRule: applyCustomColors(colorRule, preference),
      labelRule: nullLabelRule,
      defaults: nullSymbologySpec.node.defaults,
    };
  },

  actualDemand: (units, sortedData, preference): NodeSymbology => {
    const colorRule = initializeColorRule({
      property: "actualDemand",
      unit: units.actualDemand,
      rampName: preference?.rampName ?? "Emrld",
      mode: preference?.mode ?? "prettyBreaks",
      numIntervals: preference?.numIntervals,
      reverseRamp: preference?.reversedRamp,
      fallbackEndpoints: [0, 100],
      sortedData,
    });
    return {
      colorRule: applyCustomColors(colorRule, preference),
      labelRule: nullLabelRule,
      defaults: nullSymbologySpec.node.defaults,
    };
  },

  head: (units, sortedData, preference): NodeSymbology => {
    const colorRule = initializeColorRule({
      property: "head",
      unit: units.head,
      rampName: preference?.rampName ?? "Purp",
      mode: preference?.mode ?? "prettyBreaks",
      numIntervals: preference?.numIntervals,
      reverseRamp: preference?.reversedRamp,
      fallbackEndpoints: [0, 100],
      sortedData,
    });
    return {
      colorRule: applyCustomColors(colorRule, preference),
      labelRule: nullLabelRule,
      defaults: nullSymbologySpec.node.defaults,
    };
  },

  waterAge: (units, sortedData, preference): NodeSymbology & LinkSymbology => {
    const colorRule = initializeColorRule({
      property: "waterAge",
      unit: units.waterAge,
      rampName: preference?.rampName ?? "Sunset",
      mode: preference?.mode ?? "prettyBreaks",
      numIntervals: preference?.numIntervals,
      reverseRamp: preference?.reversedRamp,
      fallbackEndpoints: [0, 48],
      sortedData,
    });
    return {
      colorRule: applyCustomColors(colorRule, preference),
      labelRule: nullLabelRule,
      defaults: nullSymbologySpec.node.defaults,
    };
  },
};
