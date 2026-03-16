import { Node, NodeProperties } from "./node";

export type LoggerPointProperties = {
  type: "loggerPoint";
  deviceId: string;
  status: string;
  timestamp: string;
  pressure: number;
  flow: number;
  level: number;
  temperature: number;
  batteryV: number;
  externalV: number;
  gsmPct: number;
} & NodeProperties;

export const loggerPointQuantities = [
  "deviceId",
  "status",
  "timestamp",
  "pressure",
  "flow",
  "level",
  "temperature",
  "batteryV",
  "externalV",
  "gsmPct",
] as const;
export type LoggerPointQuantity = (typeof loggerPointQuantities)[number];

export class LoggerPoint extends Node<LoggerPointProperties> {
  copy() {
    return new LoggerPoint(
      this.id,
      [...this.coordinates],
      {
        ...this.properties,
      },
      this.units,
    );
  }

  getUnit(key: LoggerPointQuantity) {
    return this.units[key];
  }

  get deviceId() {
    return this.properties.deviceId;
  }

  get status() {
    return this.properties.status;
  }

  get timestamp() {
    return this.properties.timestamp;
  }

  get pressure() {
    return this.properties.pressure;
  }

  get flow() {
    return this.properties.flow;
  }

  get level() {
    return this.properties.level;
  }

  get temperature() {
    return this.properties.temperature;
  }

  get batteryV() {
    return this.properties.batteryV;
  }

  get externalV() {
    return this.properties.externalV;
  }

  get gsmPct() {
    return this.properties.gsmPct;
  }
}
