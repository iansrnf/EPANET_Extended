import { getIssues } from "@placemarkio/check-geojson";
import { bufferFeature } from "src/lib/buffer";
import {
  runSimulation,
  warmupSimulationEngine,
} from "src/simulation/epanet/worker";

export const lib = {
  getIssues,
  bufferFeature,
  runSimulation,
  warmupSimulationEngine,
};

export type Lib = typeof lib;
