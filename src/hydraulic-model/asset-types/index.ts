import { Pipe, PipeStatus } from "./pipe";
import { Pump, PumpStatus } from "./pump";
import { Junction } from "./junction";
import { Reservoir, calculateAverageHead } from "./reservoir";
import { Valve } from "./valve";
import { Tank } from "./tank";
import { LoggerPoint } from "./logger-point";
import type { PipeProperties } from "./pipe";
import type { JunctionProperties } from "./junction";
import type { ReservoirProperties } from "./reservoir";
import type { PumpProperties } from "./pump";
import type { ValveProperties } from "./valve";
import type { TankProperties } from "./tank";
import type { LoggerPointProperties } from "./logger-point";

export type Asset =
  | Pipe
  | Junction
  | Reservoir
  | Pump
  | Valve
  | Tank
  | LoggerPoint;
export type AssetStatus = PipeStatus | PumpStatus;
export type NodeAsset = Junction | Reservoir | Tank | LoggerPoint;
export type LinkAsset = Pipe | Pump | Valve;

export type AssetPropertiesMap = {
  pipe: PipeProperties;
  junction: JunctionProperties;
  reservoir: ReservoirProperties;
  pump: PumpProperties;
  valve: ValveProperties;
  tank: TankProperties;
  loggerPoint: LoggerPointProperties;
};

export {
  Pipe,
  Junction,
  Reservoir,
  Pump,
  Valve,
  Tank,
  LoggerPoint,
  calculateAverageHead,
};
export type { AssetId } from "./base-asset";
export { BaseAsset } from "./base-asset";
export type { PipeProperties } from "./pipe";
export type { NodeType, LinkType, AssetType } from "./types";
