import {
  pumpDefinitionsSchema,
  type PumpDefinition,
} from "@epanet-js/model-schema";

export const buildPumpDefinitionsData = (
  data: string | null,
): PumpDefinition[] => {
  if (data === null) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch (error) {
    throw new Error("Pump definitions: data is not valid JSON", {
      cause: error,
    });
  }

  const result = pumpDefinitionsSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Pump definitions: data does not match schema — ${result.error.message}`,
    );
  }
  return result.data;
};
