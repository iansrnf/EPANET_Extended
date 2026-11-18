import type { Feature } from "geojson";
import type {
  NetworkFilter,
  NetworkLayerRole,
} from "src/lib/model-builder/network";
import { matchesNetworkFilter } from "src/lib/model-builder/network";

export type AssignmentPartition = {
  rules: {
    name: string;
    role: NetworkLayerRole | null;
    conditions: NetworkFilter[];
  }[];
  index: number | "fallback";
  fallbackRole: NetworkLayerRole | null;
  groupId?: string;
};

export const matchesAssignmentPartition = (
  feature: Feature,
  partition: AssignmentPartition,
): boolean => {
  const matchedIndex = partition.rules.findIndex(
    ({ conditions }) =>
      conditions.length > 0 &&
      conditions.every((condition) => matchesNetworkFilter(feature, condition)),
  );
  return partition.index === "fallback"
    ? partition.fallbackRole !== null && matchedIndex === -1
    : matchedIndex >= 0 &&
        matchedIndex === partition.index &&
        partition.rules[matchedIndex].role !== null;
};
