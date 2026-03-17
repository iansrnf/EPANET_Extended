import { Position } from "geojson";

export type PressureLoggerId = number;

export class PressureLogger {
  public readonly id: PressureLoggerId;
  public readonly label: string;
  public readonly coordinates: Position;

  constructor(
    id: PressureLoggerId,
    coordinates: Position,
    properties: {
      label: string;
    },
  ) {
    this.id = id;
    this.label = properties.label;
    this.coordinates = coordinates;
  }
}

export class PressureLoggers extends Map<number, PressureLogger> {}

export const initializePressureLoggers = (): PressureLoggers => {
  return new Map<number, PressureLogger>();
};
