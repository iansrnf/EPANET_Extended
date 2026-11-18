import type { Feature } from "geojson";
import type {
  HeadlossFormula,
  NetworkData,
  SourceUnits,
} from "@epanet-js/converters";

export type NetworkLayerRole =
  | "pipe"
  | "junction"
  | "reservoir"
  | "tank"
  | "pump"
  | "valve"
  | "customerPoint"
  | "zone";

export type NetworkValue = string | number | boolean;

export type NetworkFilter = {
  attribute: string;
  operator:
    | "equals"
    | "notEquals"
    | "contains"
    | "greaterThan"
    | "lessThan"
    | "greaterOrEquals"
    | "lessOrEquals"
    | "isEmpty"
    | "isNotEmpty";
  value?: NetworkValue;
};

export type NetworkAttributeRule = NetworkFilter & {
  property: string;
  result: NetworkValue;
};

export type NetworkLayer = {
  id: string;
  name: string;
  role: NetworkLayerRole;
  features: Feature[];
  mapping?: Record<string, string | null>;
  defaults?: Record<string, NetworkValue>;
  units?: SourceUnits;
  customAttributes?: string[];
  filters?: NetworkFilter[];
  rules?: NetworkAttributeRule[];
};

export type NetworkBuildOptions = {
  units: SourceUnits;
  headlossFormula: HeadlossFormula;
  snapTolerance: number;
  splitAtIntersections?: boolean;
  splitAtVertices?: boolean;
  removeDuplicatePipes?: boolean;
  keepLargestComponent?: boolean;
  junctionDefaults?: Record<string, NetworkValue>;
  labelPrefixes?: Partial<Record<NetworkLayerRole, string>>;
};

export type NetworkBuildIssue = {
  code:
    | "invalidGeometry"
    | "invalidValue"
    | "emptyNetwork"
    | "mergedNodes"
    | "zeroLengthPipe"
    | "duplicatePipe"
    | "unconnectedDevice"
    | "ambiguousDevice"
    | "disconnectedNetwork"
    | "removedDisconnectedAssets";
  severity: "warning" | "error";
  layerId?: string;
  ref?: string;
  context?: Record<string, string | number>;
};

export type NetworkBuildSummary = {
  readFeatures: number;
  acceptedFeatures: number;
  excludedFeatures: number;
  invalidFeatures: number;
  generatedJunctions: number;
  mergedNodes: number;
  splitPipes: number;
  duplicatePipesRemoved: number;
  components: number;
  counts: Record<NetworkLayerRole, number>;
  totalPipeLengthMeters: number;
};

export type NetworkBuildResult = {
  network: NetworkData;
  issues: NetworkBuildIssue[];
  summary: NetworkBuildSummary;
};

export type NetworkBuildProgress = {
  stage: "attributes" | "topology" | "devices" | "complete";
  completed: number;
  total: number;
};

export type NetworkBuildRuntimeOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: NetworkBuildProgress) => void;
};
