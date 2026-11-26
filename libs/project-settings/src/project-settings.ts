import { UnitsSpec, FormattingSpec, presets } from "./quantities-spec";
import { Projection, WGS84_UTM_51N } from "@epanet-js/projections";
import { HeadlossFormula, type DefaultsSpec } from "@epanet-js/hydraulic-model";
import type { Logger } from "./loggers";

export const defaultProjectName = "";
export const defaultProjectProjection = WGS84_UTM_51N;

export type ProjectSettings = {
  name: string;
  units: UnitsSpec;
  defaults: DefaultsSpec;
  headlossFormula: HeadlossFormula;
  formatting: FormattingSpec;
  projection: Projection;
  uniqueId?: string;
  loggers?: Logger[];
};

export const defaultProjectSettings: ProjectSettings = {
  name: defaultProjectName,
  units: presets.LPS.units,
  defaults: presets.LPS.defaults,
  headlossFormula: "H-W",
  formatting: { decimals: presets.LPS.decimals, defaultDecimals: 3 },
  projection: defaultProjectProjection,
};
