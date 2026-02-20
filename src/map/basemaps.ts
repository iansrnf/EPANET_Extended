import { env } from "src/lib/env-client";
import { ILayerConfig } from "src/types";

const mapboxDefaults = {
  type: "MAPBOX",
  token: env.NEXT_PUBLIC_MAPBOX_TOKEN,
  opacity: 1,
  sourceMaxZoom: {},
  isBasemap: false,
} as const;

const xyzDefaults = {
  type: "XYZ",
  token: "",
  opacity: 1,
  sourceMaxZoom: {},
  isBasemap: false,
} as const;

export type LayerConfigTemplate = Pick<
  ILayerConfig,
  "name" | "url" | "type" | "token" | "opacity" | "sourceMaxZoom" | "isBasemap"
> & {
  thumbnailClass: string;
};

export const basemaps = {
  monochrome: {
    name: "Monochrome",
    url: "mapbox://styles/mapbox/light-v11",
    thumbnailClass: "bg-thumbnail-monochrome",
    ...mapboxDefaults,
    isBasemap: true,
  },
  satellite: {
    name: "Satellite",
    url: "mapbox://styles/mapbox/satellite-streets-v12",
    thumbnailClass: "bg-thumbnail-satellite",
    ...mapboxDefaults,
    opacity: 0.65,
    isBasemap: true,
  },
  outdoors: {
    name: "Outdoors",
    url: "mapbox://styles/mapbox/outdoors-v12",
    thumbnailClass: "bg-thumbnail-outdoors",
    ...mapboxDefaults,
    opacity: 0.65,
    isBasemap: true,
  },
  streets: {
    name: "Streets",
    url: "mapbox://styles/mapbox/navigation-guidance-day-v4",
    thumbnailClass: "bg-thumbnail-streets",
    ...mapboxDefaults,
    isBasemap: true,
  },
  openStreetMap: {
    name: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    thumbnailClass: "bg-thumbnail-streets",
    ...xyzDefaults,
    isBasemap: true,
  },
  openStreetMapHumanitarian: {
    name: "OpenStreetMap Humanitarian",
    url: "https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
    thumbnailClass: "bg-thumbnail-streets",
    ...xyzDefaults,
    isBasemap: true,
  },
  openStreetMapCycle: {
    name: "OpenStreetMap Cycle",
    url: "https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
    thumbnailClass: "bg-thumbnail-streets",
    ...xyzDefaults,
    isBasemap: true,
  },
} as const;

export const defaultBasemap = basemaps.monochrome;
