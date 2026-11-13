import { z } from "zod";

export const pumpDefinitionHeadTypes = [
  "power",
  "designPoint",
  "standard",
  "standardExtended",
  "customExtended",
  "multiplePoint",
] as const;

export const pumpDefinitionEfficiencyTypes = [
  "constant",
  "bep",
  "multiplePoint",
] as const;

const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const pumpDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  headCurveId: z.number().int().positive().optional(),
  efficiencyCurveId: z.number().int().positive().optional(),
  head: z.object({
    type: z.enum(pumpDefinitionHeadTypes),
    interpolation: z.enum(["linear", "fitted"]).optional(),
    power: z.number().finite(),
    points: z.array(pointSchema),
    extendedFlow: z.number().finite().optional(),
  }),
  efficiency: z.object({
    type: z.enum(pumpDefinitionEfficiencyTypes),
    value: z.number().finite(),
    bepFlow: z.number().finite(),
    maxFlow: z.number().finite().optional(),
    points: z.array(pointSchema),
  }),
  motor: z.object({
    efficiency: z.number().finite(),
    variableSpeedDrive: z.boolean(),
    points: z.array(pointSchema),
  }),
  notes: z.string().optional(),
});

export const pumpDefinitionsSchema = z.array(pumpDefinitionSchema);
export type PumpDefinition = z.infer<typeof pumpDefinitionSchema>;
export type PumpDefinitionHeadType = PumpDefinition["head"]["type"];
export type PumpDefinitionEfficiencyType = PumpDefinition["efficiency"]["type"];
