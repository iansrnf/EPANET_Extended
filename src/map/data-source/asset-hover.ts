import {
  findLinkMidpoint,
  isNodeAsset,
  type AssetId,
  type AssetsMap,
} from "@epanet-js/hydraulic-model";
import type { Feature } from "src/types";

export const buildAssetHoverSource = (
  hoveredAssetId: AssetId | null,
  assets: AssetsMap,
): Feature[] => {
  if (hoveredAssetId === null) return [];

  const asset = assets.get(hoveredAssetId);
  if (!asset || asset.getProperty("visibility") === false) return [];

  const properties = { type: asset.type, isActive: asset.isActive };
  if (isNodeAsset(asset)) {
    return [
      {
        type: "Feature",
        id: asset.id,
        properties,
        geometry: { type: "Point", coordinates: asset.coordinates },
      },
    ];
  }

  if (asset.coordinates.length < 2) return [];

  const line: Feature = {
    type: "Feature",
    id: asset.id,
    properties,
    geometry: { type: "LineString", coordinates: asset.coordinates },
  };
  if (asset.type === "pipe") return [line];

  return [
    line,
    {
      type: "Feature",
      id: `asset-hover-icon-${asset.id}`,
      properties,
      geometry: {
        type: "Point",
        coordinates: findLinkMidpoint<unknown>(asset).position,
      },
    },
  ];
};
