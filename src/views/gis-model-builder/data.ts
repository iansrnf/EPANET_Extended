import { z } from "zod";
import type { Feature } from "geojson";
import type { SourceFile, SourceUnits } from "@epanet-js/converters";
import type { FlowUnit } from "@epanet-js/quantity";
import type { SourceAttribute, SourceGeometry } from "@epanet-js/gis-importers";
import type {
  NetworkLayer,
  NetworkLayerRole,
  NetworkValue,
} from "src/lib/model-builder/network";
import { matchesNetworkFilter } from "src/lib/model-builder/network";
import {
  matchesAssignmentPartition,
  type AssignmentPartition,
} from "./assignment-rules-data";

export type BuilderSource = {
  id: string;
  name: string;
  fileNames: string[];
  files: SourceFile[];
  features: Feature[];
  attributes: SourceAttribute[];
  groups: {
    geometry: SourceGeometry;
    features: Feature[];
    attributes: SourceAttribute[];
  }[];
  projection: string;
  warnings: string[];
  status: "ready" | "coordinates" | "projection" | "error";
  error?: string;
  epsg?: number;
  coordinateAttributes?: { x: string; y: string };
};

export type BuilderLayer = NetworkLayer & {
  sourceId: string;
  sourceName: string;
  geometry: SourceGeometry;
  enabled: boolean;
  partition?: AssignmentPartition;
};

export type BuilderSettings = {
  name: string;
  unitSystem: "metric" | "us";
  flowUnit: FlowUnit;
  headlossFormula: "H-W" | "D-W" | "C-M";
  fetchElevations: boolean;
  snapTolerance: number;
  splitAtIntersections: boolean;
  splitAtVertices: boolean;
  removeDuplicatePipes: boolean;
  keepLargestComponent: boolean;
  junctionElevation?: number;
  labelPrefixes: Partial<Record<NetworkLayerRole, string>>;
};

export type MappingField = {
  key: string;
  label: string;
  numeric?: boolean;
  unit?: keyof SourceUnits;
  options?: string[];
  hint?: string;
};

export const roleOrder: NetworkLayerRole[] = [
  "pipe",
  "junction",
  "reservoir",
  "tank",
  "pump",
  "valve",
  "customerPoint",
  "zone",
];

export const roleNames: Record<NetworkLayerRole, string> = {
  pipe: "Pipes",
  junction: "Junctions",
  reservoir: "Reservoirs",
  tank: "Tanks",
  pump: "Pumps",
  valve: "Valves",
  customerPoint: "Customer points",
  zone: "Zones",
};

export const roleColors: Record<NetworkLayerRole, string> = {
  pipe: "text-accent",
  junction: "text-info",
  reservoir: "text-success",
  tank: "text-warning",
  pump: "text-error",
  valve: "text-default",
  customerPoint: "text-subtle",
  zone: "text-info",
};

export const flowUnits: {
  value: FlowUnit;
  label: string;
  system: "metric" | "us";
}[] = [
  { value: "l/s", label: "LPS (liters/sec)", system: "metric" },
  { value: "l/min", label: "LPM (liters/min)", system: "metric" },
  { value: "m^3/h", label: "CMH (cubic meters/hour)", system: "metric" },
  { value: "m^3/d", label: "CMD (cubic meters/day)", system: "metric" },
  { value: "Ml/d", label: "MLD (megaliters/day)", system: "metric" },
  { value: "ft^3/s", label: "CFS (cubic feet/sec)", system: "us" },
  { value: "gal/min", label: "GPM (gallons/min)", system: "us" },
  { value: "Mgal/d", label: "MGD (million gallons/day)", system: "us" },
  {
    value: "IMgal/d",
    label: "IMGD (imperial million gallons/day)",
    system: "us",
  },
  { value: "acft/d", label: "AFD (acre-feet/day)", system: "us" },
];

const idField: MappingField = {
  key: "label",
  label: "ID",
  hint: "Leave unmapped to generate unique IDs.",
};
const elevationField: MappingField = {
  key: "elevation",
  label: "Elevation",
  numeric: true,
  unit: "elevation",
};
const diameterField: MappingField = {
  key: "diameter",
  label: "Diameter",
  numeric: true,
  unit: "diameter",
};
const minorLossField: MappingField = {
  key: "minorLoss",
  label: "Minor loss",
  numeric: true,
};
const statusField: MappingField = {
  key: "initialStatus",
  label: "Initial status",
  options: ["open", "closed"],
};

export const mappingFields: Record<NetworkLayerRole, MappingField[]> = {
  pipe: [
    idField,
    diameterField,
    { key: "roughness", label: "Roughness", numeric: true },
    minorLossField,
    { ...statusField, options: ["open", "closed", "cv"] },
    { key: "material", label: "Material" },
    { key: "year", label: "Installation year", numeric: true },
    {
      key: "length",
      label: "Length",
      numeric: true,
      unit: "length",
      hint: "Leave unmapped to calculate from pipe geometry.",
    },
  ],
  junction: [
    idField,
    elevationField,
    { key: "demand", label: "Base demand", numeric: true, unit: "flow" },
  ],
  reservoir: [
    idField,
    { key: "head", label: "Total head", numeric: true, unit: "elevation" },
  ],
  tank: [
    idField,
    elevationField,
    {
      key: "initialLevel",
      label: "Initial level",
      numeric: true,
      unit: "level",
    },
    { key: "minLevel", label: "Minimum level", numeric: true, unit: "level" },
    { key: "maxLevel", label: "Maximum level", numeric: true, unit: "level" },
    { key: "diameter", label: "Diameter", numeric: true, unit: "tankDiameter" },
    {
      key: "minVolume",
      label: "Minimum volume",
      numeric: true,
      unit: "volume",
    },
    { key: "overflow", label: "Can overflow", options: ["true", "false"] },
  ],
  pump: [
    idField,
    statusField,
    { key: "speed", label: "Relative speed", numeric: true },
  ],
  valve: [
    idField,
    diameterField,
    {
      key: "kind",
      label: "Valve type",
      options: ["tcv", "prv", "psv", "pbv", "fcv", "gpv"],
    },
    { key: "setting", label: "Setting", numeric: true },
    minorLossField,
    { ...statusField, options: ["active", "open", "closed"] },
  ],
  customerPoint: [
    idField,
    { key: "demand", label: "Demand", numeric: true, unit: "customerDemand" },
  ],
  zone: [idField],
};

export const initialSettings = (): BuilderSettings => ({
  name: "New GIS model",
  unitSystem: "metric",
  flowUnit: "l/s",
  headlossFormula: "H-W",
  fetchElevations: true,
  snapTolerance: 0.1,
  splitAtIntersections: false,
  splitAtVertices: false,
  removeDuplicatePipes: true,
  keepLargestComponent: false,
  labelPrefixes: {
    pipe: "P",
    junction: "J",
    reservoir: "R",
    tank: "T",
    pump: "PU",
    valve: "V",
    customerPoint: "CP",
    zone: "Z",
  },
});

export const sourceUnitsFor = (settings: BuilderSettings): SourceUnits => ({
  flow: settings.flowUnit,
  customerDemand: settings.unitSystem === "us" ? "gal/d" : "l/d",
  pressure: settings.unitSystem === "us" ? "psi" : "mwc",
  elevation: settings.unitSystem === "us" ? "ft" : "m",
  level: settings.unitSystem === "us" ? "ft" : "m",
  diameter: settings.unitSystem === "us" ? "in" : "mm",
  tankDiameter: settings.unitSystem === "us" ? "ft" : "m",
  length: settings.unitSystem === "us" ? "ft" : "m",
  volume: settings.unitSystem === "us" ? "ft^3" : "m^3",
});

export const compatibleRoles = (
  geometry: SourceGeometry,
): NetworkLayerRole[] => {
  if (geometry === "line") return ["pipe", "pump", "valve"];
  if (geometry === "point")
    return ["junction", "reservoir", "tank", "pump", "valve", "customerPoint"];
  if (geometry === "polygon") return ["zone"];
  return [];
};

export const defaultsForRole = (
  role: NetworkLayerRole,
  settings: BuilderSettings,
): Record<string, NetworkValue> => {
  switch (role) {
    case "pipe":
      return { initialStatus: "open" };
    case "junction":
      return settings.junctionElevation === undefined
        ? {}
        : { elevation: settings.junctionElevation };
    case "reservoir":
      return {};
    case "tank":
      return { overflow: true };
    case "pump":
      return { initialStatus: "open" };
    case "valve":
      return { kind: "tcv" };
    case "customerPoint":
      return {};
    case "zone":
      return {};
  }
};

const aliases: Record<string, string[]> = {
  label: ["id", "label", "name", "assetid", "asset_id", "objectid", "fid"],
  diameter: ["diameter", "diam", "pipe_dia", "diam_mm", "size"],
  roughness: ["roughness", "c_factor", "hazen_williams", "hw_c"],
  elevation: ["elevation", "elev", "groundlevel", "ground_level", "z"],
  demand: ["demand", "base_demand", "basedemand", "consumption"],
  head: ["head", "total_head", "water_level"],
  minorLoss: ["minorloss", "minor_loss", "loss"],
  initialStatus: ["status", "initial_status", "initialstatus"],
  material: ["material", "pipe_material", "mat"],
  year: ["year", "installation_year", "inst_year", "year_installed"],
  kind: ["kind", "valve_type", "type"],
  setting: ["setting", "valve_setting"],
  initialLevel: ["initiallevel", "initial_level", "init_level"],
  minLevel: ["minlevel", "min_level", "minimum_level"],
  maxLevel: ["maxlevel", "max_level", "maximum_level"],
  minVolume: ["minvolume", "min_volume", "minimum_volume"],
  speed: ["speed", "relative_speed"],
  power: ["power", "pump_power"],
  length: ["length", "length_m", "pipe_length"],
};

export const inferredMapping = (
  role: NetworkLayerRole,
  attributes: SourceAttribute[],
): Record<string, string | null> => {
  const byLowerName = new Map(
    attributes.map(({ name }) => [
      name.toLowerCase().replace(/\s/g, "_"),
      name,
    ]),
  );
  const mapping: Record<string, string | null> = {};
  for (const field of mappingFields[role]) {
    const match = aliases[field.key]
      ?.map((name) => byLowerName.get(name))
      .find(Boolean);
    if (match) mapping[field.key] = match;
  }
  return mapping;
};

export const layersForSource = (
  source: BuilderSource,
  settings: BuilderSettings,
): BuilderLayer[] =>
  source.groups.flatMap((group, index) => {
    const roles = compatibleRoles(group.geometry);
    if (roles.length === 0) return [];
    const inferred = roles.find((role) =>
      source.name
        .toLowerCase()
        .includes(role === "customerPoint" ? "customer" : role),
    );
    const role = inferred ?? roles[0];
    return [
      {
        id: `${source.id}-${index}`,
        name: source.name,
        sourceId: source.id,
        sourceName: source.name,
        geometry: group.geometry,
        role,
        features: group.features,
        mapping: inferredMapping(role, group.attributes),
        defaults: defaultsForRole(role, settings),
        units: sourceUnitsFor(settings),
        customAttributes: [],
        filters: [],
        rules: [],
        enabled: true,
      },
    ];
  });

const valueSchema = z.union([z.string(), z.number().finite(), z.boolean()]);
const roleSchema = z.enum([
  "pipe",
  "junction",
  "reservoir",
  "tank",
  "pump",
  "valve",
  "customerPoint",
  "zone",
]);
const operatorSchema = z.enum([
  "equals",
  "notEquals",
  "contains",
  "greaterThan",
  "lessThan",
  "isEmpty",
  "isNotEmpty",
  "greaterOrEquals",
  "lessOrEquals",
]);
const filterSchema = z.object({
  attribute: z.string(),
  operator: operatorSchema,
  value: valueSchema.optional(),
});
const flowUnitSchema = z.enum([
  "l/s",
  "l/min",
  "l/h",
  "l/d",
  "gal/min",
  "gal/d",
  "m^3/h",
  "m^3/d",
  "Mgal/d",
  "IMgal/d",
  "Ml/d",
  "acft/d",
  "ft^3/s",
  "ft^3/d",
]);
const lengthUnitSchema = z.enum(["m", "mm", "in", "ft", "km"]);
const unitsSchema = z
  .object({
    flow: flowUnitSchema,
    customerDemand: flowUnitSchema,
    pressure: z.enum(["mwc", "psi", "kPa", "bar", "fwc"]),
    elevation: lengthUnitSchema,
    level: lengthUnitSchema,
    diameter: lengthUnitSchema,
    tankDiameter: lengthUnitSchema,
    length: lengthUnitSchema,
    volume: z.enum(["m^3", "ft^3"]),
  })
  .partial();
const layerRecipeSchema = z.object({
  id: z.string(),
  name: z.string(),
  sourceName: z.string(),
  geometry: z.enum(["point", "line", "polygon", "unknown"]),
  role: roleSchema,
  enabled: z.boolean(),
  mapping: z.record(z.string().nullable()).optional(),
  defaults: z.record(valueSchema).optional(),
  customAttributes: z.array(z.string()).optional(),
  filters: z.array(filterSchema).optional(),
  rules: z
    .array(filterSchema.extend({ property: z.string(), result: valueSchema }))
    .optional(),
  partition: z
    .object({
      rules: z.array(
        z.object({
          name: z.string(),
          role: roleSchema.nullable(),
          conditions: z.array(filterSchema),
        }),
      ),
      index: z.union([z.number().int().nonnegative(), z.literal("fallback")]),
      fallbackRole: roleSchema.nullable(),
      groupId: z.string().optional(),
    })
    .optional(),
  units: unitsSchema.optional(),
});
const settingsSchema = z.object({
  version: z.literal(1),
  savedAt: z.string(),
  settings: z.object({
    name: z.string().min(1),
    unitSystem: z.enum(["metric", "us"]),
    flowUnit: flowUnitSchema,
    headlossFormula: z.enum(["H-W", "D-W", "C-M"]),
    fetchElevations: z.boolean(),
    snapTolerance: z.number().min(0).max(1000),
    splitAtIntersections: z.boolean(),
    splitAtVertices: z.boolean(),
    removeDuplicatePipes: z.boolean(),
    keepLargestComponent: z.boolean(),
    junctionElevation: z.number().finite().optional(),
    labelPrefixes: z.record(z.string()),
  }),
  layers: z.array(layerRecipeSchema),
  sourceNames: z.array(z.string()),
  sourceSettings: z
    .array(
      z.object({
        name: z.string(),
        epsg: z.number().int().positive().optional(),
        coordinateAttributes: z
          .object({ x: z.string(), y: z.string() })
          .optional(),
      }),
    )
    .optional(),
});

export type SavedBuildSettings = z.infer<typeof settingsSchema>;

export const saveBuildRecipe = (
  settings: BuilderSettings,
  layers: BuilderLayer[],
  sources: BuilderSource[],
): SavedBuildSettings => ({
  version: 1,
  savedAt: new Date().toISOString(),
  settings,
  sourceNames: sources.map(({ name }) => name),
  sourceSettings: sources.map(({ name, epsg, coordinateAttributes }) => ({
    name,
    epsg,
    coordinateAttributes,
  })),
  layers: layers.map(({ features, sourceId, ...layer }) => {
    void features;
    void sourceId;
    return layer;
  }),
});

export const parseBuildRecipe = (value: unknown): SavedBuildSettings =>
  settingsSchema.parse(value);

export const restoreSourceLayers = (
  source: BuilderSource,
  recipe: SavedBuildSettings,
): BuilderLayer[] => {
  const savedLayers = recipe.layers.filter(
    ({ sourceName }) => sourceName === source.name,
  );
  if (savedLayers.length === 0) return layersForSource(source, recipe.settings);
  return savedLayers.flatMap((saved) => {
    const group = source.groups.find(
      ({ geometry }) => geometry === saved.geometry,
    );
    if (!group || !compatibleRoles(group.geometry).includes(saved.role))
      return [];
    return [{ ...saved, sourceId: source.id, features: group.features }];
  });
};

export const layerAttributes = (
  layer: BuilderLayer,
  sources: BuilderSource[],
): SourceAttribute[] =>
  sources
    .find(({ id }) => id === layer.sourceId)
    ?.groups.find(({ geometry }) => geometry === layer.geometry)?.attributes ??
  [];

export const valueAsText = (value: unknown): string =>
  value == null
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);

const filteredFeatures = new WeakMap<BuilderLayer, Feature[]>();

export const featuresForLayer = (layer: BuilderLayer): Feature[] => {
  if (!layer.partition && !layer.filters?.length) return layer.features;
  const cached = filteredFeatures.get(layer);
  if (cached) return cached;
  const features = layer.features.filter(
    (feature) =>
      (!layer.partition ||
        matchesAssignmentPartition(feature, layer.partition)) &&
      (layer.filters ?? []).every((filter) =>
        matchesNetworkFilter(feature, filter),
      ),
  );
  filteredFeatures.set(layer, features);
  return features;
};

let nextId = 0;

export const newBuilderId = (): string =>
  `gis-${Date.now().toString(36)}-${(nextId++).toString(36)}`;

export const downloadText = (
  name: string,
  text: string,
  type = "application/json",
) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};
