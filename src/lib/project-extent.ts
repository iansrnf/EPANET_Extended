import { getExtent } from "@epanet-js/geometry";
import type { AssetsMap } from "@epanet-js/hydraulic-model";
import type { Logger } from "@epanet-js/project-settings";
import type { Feature } from "geojson";

export const getProjectExtent = (assets: AssetsMap, loggers: Logger[] = []) => {
  const features: Feature[] = [...assets.values()].map(
    (asset) => asset.feature,
  );
  for (const logger of loggers) {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: logger.coordinates },
      properties: {},
    });
  }
  return getExtent(features);
};
