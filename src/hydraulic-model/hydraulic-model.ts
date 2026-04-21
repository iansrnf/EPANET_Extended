import { Topology } from "./topology";
import { AssetsMap } from "./assets-map";
import { nanoid } from "nanoid";

import { ConsecutiveIdsGenerator, IdGenerator } from "src/lib/id-generator";
import { LabelManager } from "./label-manager";
import { Demands, createEmptyDemands } from "./demands";
import { CustomerPoints, initializeCustomerPoints } from "./customer-points";
import { CustomerPointsLookup } from "./customer-points-lookup";
import { AssetIndex } from "./asset-index";
import { Asset } from "./asset-types";
import { Curves } from "./curves";
import { Controls, createEmptyControls } from "./controls";
import { deepClonePatterns, Patterns } from "./patterns";
import { PressureLoggers, initializePressureLoggers } from "./pressure-loggers";
import type { Demand } from "./demands";

export type HydraulicModel = {
  version: string;
  assets: AssetsMap;
  customerPoints: CustomerPoints;
  customerPointsLookup: CustomerPointsLookup;
  pressureLoggers: PressureLoggers;
  topology: Topology;
  assetIndex: AssetIndex;
  demands: Demands;
  labelManager: LabelManager;
  curves: Curves;
  patterns: Patterns;
  controls: Controls;
};

export { AssetsMap };

export const initializeHydraulicModel = ({
  demands = createEmptyDemands(),
  controls = createEmptyControls(),
  idGenerator,
  labelManager = new LabelManager(),
  assets,
  topology,
  assetIndex,
  customerPoints,
  customerPointsLookup,
}: {
  demands?: Demands;
  controls?: Controls;
  idGenerator?: IdGenerator;
  labelManager?: LabelManager;
  assets?: AssetsMap;
  topology?: Topology;
  assetIndex?: AssetIndex;
  customerPoints?: CustomerPoints;
  customerPointsLookup?: CustomerPointsLookup;
} = {}): HydraulicModel => {
  const assetIdGenerator = idGenerator ?? new ConsecutiveIdsGenerator();
  const resolvedAssets = assets ?? new Map();
  return {
    version: nanoid(),
    assets: resolvedAssets,
    customerPoints: customerPoints ?? initializeCustomerPoints(),
    customerPointsLookup: customerPointsLookup ?? new CustomerPointsLookup(),
    pressureLoggers: initializePressureLoggers(),
    topology: topology ?? new Topology(),
    assetIndex: assetIndex ?? new AssetIndex(assetIdGenerator, resolvedAssets),
    demands,
    labelManager,
    curves: new Map(),
    patterns: new Map(),
    controls,
  };
};

export const copyModel = (source: HydraulicModel): HydraulicModel => {
  const assets: AssetsMap = new Map(source.assets);

  return {
    ...source,
    assets,
    customerPoints: new Map(source.customerPoints),
    customerPointsLookup: source.customerPointsLookup.copy(),
    pressureLoggers: new Map(source.pressureLoggers),
    topology: source.topology.copy(),
    assetIndex: source.assetIndex.copy(assets),
    demands: {
      junctions: new Map(
        Array.from(source.demands.junctions, ([id, demands]) => [
          id,
          demands.map((demand: Demand) => ({ ...demand })),
        ]),
      ),
      customerPoints: new Map(
        Array.from(source.demands.customerPoints, ([id, demands]) => [
          id,
          demands.map((demand: Demand) => ({ ...demand })),
        ]),
      ),
    },
    curves: new Map(source.curves),
    patterns: deepClonePatterns(source.patterns),
    controls: {
      rules: [...source.controls.rules],
      simple: [...source.controls.simple],
    },
  };
};

export const updateHydraulicModelAssets = (
  hydraulicModel: HydraulicModel,
  newAssets?: AssetsMap,
): HydraulicModel => {
  if (newAssets) {
    hydraulicModel.assetIndex.updateAssets(newAssets);
    return {
      ...hydraulicModel,
      assets: newAssets,
    };
  }

  const updatedAssets = new AssetsMap(
    Array.from(hydraulicModel.assets).sort(([, a], [, b]) => sortAssets(a, b)),
  );

  hydraulicModel.assetIndex.updateAssets(updatedAssets);
  return {
    ...hydraulicModel,
    assets: updatedAssets,
  };
};

function sortAssets(a: Asset, b: Asset): number {
  if (a.at > b.at) {
    return 1;
  } else if (a.at < b.at) {
    return -1;
  } else if (a.id > b.id) {
    // This should never happen, but fall
    // back to it to get stable sorting.
    return 1;
  } else {
    return -1;
  }
}
