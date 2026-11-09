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
  monochrome: {
    name: "Monochrome",
    url: "mapbox://styles/mapbox/light-v10",
    thumbnailClass: "bg-thumbnail-monochrome",
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
  outdoors: {
    name: "Outdoors",
    url: "mapbox://styles/mapbox/outdoors-v12",
    thumbnailClass: "bg-thumbnail-outdoors",
    ...defaults,
    opacity: 0.65,
    isBasemap: true,
  },
  streets: {
    name: "Streets",
    url: "mapbox://styles/mapbox/navigation-guidance-day-v4",
    thumbnailClass: "bg-thumbnail-streets",
    ...defaults,
    isBasemap: true,
  },
  googleRoadmap: {
    name: "Google Roadmap",
    type: "GOOGLE",
    mapType: "roadmap",
    thumbnailClass: "bg-thumbnail-streets",
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

export const defaultBasemap = basemaps.monochrome;

export const isBasemapConfigured = (layer: LayerConfigTemplate) =>
  layer.type !== "GOOGLE" || !!env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.trim();

export const satelliteBasemapFor = (layer?: ILayerConfig) => {
  if (layer?.type === "GOOGLE") {
    return layer.mapType === "satellite"
      ? basemaps.googleRoadmap
      : basemaps.googleSatellite;
  }
  return layer?.name === basemaps.monochrome.name
    ? basemaps.satellite
    : basemaps.monochrome;
};
