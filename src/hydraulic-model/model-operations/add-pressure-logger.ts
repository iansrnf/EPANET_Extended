import { Position } from "src/types";
import { PressureLoggerFactory } from "src/hydraulic-model/factories";
import { ModelOperation } from "../model-operation";

type InputData = {
  coordinates: Position;
  pressureLoggerFactory: PressureLoggerFactory;
};

export const addPressureLogger: ModelOperation<InputData> = (
  _model,
  { coordinates, pressureLoggerFactory },
) => {
  const pressureLogger = pressureLoggerFactory.create(coordinates);

  return {
    note: "Add pressure logger",
    putPressureLoggers: [pressureLogger],
  };
};
