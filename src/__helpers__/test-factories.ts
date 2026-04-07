import { LabelManager } from "src/hydraulic-model/label-manager";
import { initializeModelFactories } from "src/hydraulic-model/factories";
import { presets } from "src/lib/project-settings/quantities-spec";
import { WritableIdGenerator } from "./hydraulic-model-builder";

export const buildTestFactories = (
  options: {
    idGenerator?: WritableIdGenerator;
    labelManager?: LabelManager;
  } = {},
) => {
  const idGenerator = options.idGenerator ?? new WritableIdGenerator();
  const labelManager = options.labelManager ?? new LabelManager();
  const factories = initializeModelFactories({
    idGenerator,
    labelManager,
    defaults: presets.LPS.defaults,
  });
  return { ...factories, idGenerator };
};
