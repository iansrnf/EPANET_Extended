import { ModelOperation } from "../model-operation";

type InputData = {
  pressureLoggerIds: number[];
};

export const removePressureLoggers: ModelOperation<InputData> = (
  model,
  { pressureLoggerIds },
) => {
  const missingIds = pressureLoggerIds.filter(
    (id) => !model.pressureLoggers.has(id),
  );

  if (missingIds.length > 0) {
    throw new Error(`Pressure logger(s) not found: ${missingIds.join(", ")}`);
  }

  const backingJunctionIds = pressureLoggerIds.flatMap((id) => {
    const pressureLogger = model.pressureLoggers.get(id);
    const junctionId = pressureLogger?.connection?.junctionId;
    if (junctionId === undefined) {
      return [];
    }

    const junction = model.assets.get(junctionId);
    if (
      !junction?.isNode ||
      (junction.getProperty("pressureLoggerId") === undefined &&
        junction.getProperty("visibility") !== false)
    ) {
      return [];
    }

    return [junctionId];
  });

  return {
    note: "Remove pressure loggers",
    deleteAssets: backingJunctionIds,
    deletePressureLoggers: pressureLoggerIds,
  };
};
