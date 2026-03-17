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
    return pressureLogger?.connection?.junctionId !== undefined
      ? [pressureLogger.connection.junctionId]
      : [];
  });

  return {
    note: "Remove pressure loggers",
    deleteAssets: backingJunctionIds,
    deletePressureLoggers: pressureLoggerIds,
  };
};
