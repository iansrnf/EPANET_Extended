import { env } from "src/lib/env-client";
import { ILayerConfig } from "src/types";

const defaults = {
  type: "MAPBOX",
  token: env.NEXT_PUBLIC_MAPBOX_TOKEN,
  opacity: 1,
  isBasemap: false,
} as const;

export type LayerConfigTemplate = (
  | Pick<
      Extract<ILayerConfig, { type: "MAPBOX" }>,
      "name" | "url" | "type" | "token" | "opacity" | "isBasemap"
    >
  | Pick<
      Extract<ILayerConfig, { type: "GOOGLE" }>,
      "name" | "type" | "mapType" | "opacity" | "isBasemap"
    >
) & {
  thumbnailClass: string;
};

export const basemaps = {
  black: {
    name: "Black",
    url: "mapbox://styles/mapbox/dark-v11",
    thumbnailClass: "bg-thumbnail-black",
    ...defaults,
    isBasemap: true,
  },
  satellite: {
    name: "Satellite",
    url: "mapbox://styles/mapbox/satellite-streets-v12",
    thumbnailClass: "bg-thumbnail-satellite",
    ...defaults,
    opacity: 0.65,
    isBasemap: true,
  },
  googleBlack: {
    name: "Google Black",
    type: "GOOGLE",
    mapType: "roadmap",
    thumbnailClass: "bg-thumbnail-google-black",
    opacity: 1,
    isBasemap: true,
  },
  googleSatellite: {
    name: "Google Satellite",
    type: "GOOGLE",
    mapType: "satellite",
    thumbnailClass: "bg-thumbnail-satellite",
    opacity: 0.65,
    isBasemap: true,
  },
} as const;

export const defaultBasemap = basemaps.black;

export const isBasemapConfigured = (layer: LayerConfigTemplate) =>
  layer.type !== "GOOGLE" || !!env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.trim();

export const satelliteBasemapFor = (layer?: ILayerConfig) => {
  if (layer?.type === "GOOGLE") {
    return layer.mapType === "satellite"
      ? basemaps.googleBlack
      : basemaps.googleSatellite;
  }
  return layer?.type === "MAPBOX" && layer.url === basemaps.satellite.url
    ? basemaps.black
    : basemaps.satellite;
};
