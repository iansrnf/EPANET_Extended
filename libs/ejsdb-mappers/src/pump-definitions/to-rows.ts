import {
  pumpDefinitionsSchema,
  type PumpDefinition,
} from "@epanet-js/model-schema";

export const serializePumpDefinitions = (
  definitions: PumpDefinition[],
): string => {
  const result = pumpDefinitionsSchema.safeParse(definitions);
  if (!result.success) {
    throw new Error(
      `Pump definitions: data does not match schema — ${result.error.message}`,
    );
  }
  return JSON.stringify(result.data);
};
