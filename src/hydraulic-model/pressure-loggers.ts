import { Position } from "geojson";
import { AssetId } from "./asset-types";

export type PressureLoggerId = number;

export type PressureLoggerConnection = {
  junctionId: AssetId;
};

export class PressureLogger {
  public readonly id: PressureLoggerId;
  public readonly label: string;
  public readonly coordinates: Position;
  public readonly connection: PressureLoggerConnection | null;

  constructor(
    id: PressureLoggerId,
    coordinates: Position,
    properties: {
      label: string;
      connection?: PressureLoggerConnection | null;
    },
  ) {
    this.id = id;
    this.label = properties.label;
    this.coordinates = coordinates;
    this.connection = properties.connection ?? null;
  }

  connect(connection: PressureLoggerConnection): PressureLogger {
    return new PressureLogger(this.id, [...this.coordinates], {
      label: this.label,
      connection,
    });
  }

  disconnect(): PressureLogger {
    return new PressureLogger(this.id, [...this.coordinates], {
      label: this.label,
      connection: null,
    });
  }
}

export class PressureLoggers extends Map<number, PressureLogger> {}

export const initializePressureLoggers = (): PressureLoggers => {
  return new Map<number, PressureLogger>();
};
