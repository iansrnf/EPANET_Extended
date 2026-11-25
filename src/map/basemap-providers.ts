import type { ILayerConfig } from "src/types";
import { basemaps, type LayerConfigTemplate } from "./basemaps";

export type BasemapProviderId = "google" | "mapbox";
export type BasemapModeId = "black" | "satellite";

export const basemapProviders = [
  {
    id: "google",
    name: "Google Maps",
    modes: [
      {
        id: "black",
        labelKey: "basemapModes.black",
        basemap: basemaps.googleBlack,
      },
      {
        id: "satellite",
        labelKey: "basemapModes.satellite",
        basemap: basemaps.googleSatellite,
      },
    ],
  },
  {
    id: "mapbox",
    name: "Mapbox",
    modes: [
      {
        id: "black",
        labelKey: "basemapModes.black",
        basemap: basemaps.black,
      },
      {
        id: "satellite",
        labelKey: "basemapModes.satellite",
        basemap: basemaps.satellite,
      },
    ],
  },
] as const;

export const getBasemapProvider = (
  layer?: ILayerConfig,
): BasemapProviderId | null =>
  basemapProviders.find((provider) =>
    provider.modes.some((mode) => matchesBasemap(layer, mode.basemap)),
  )?.id ?? null;

export const getBasemapMode = (layer?: ILayerConfig): BasemapModeId | null => {
  for (const provider of basemapProviders) {
    const mode = provider.modes.find((mode) =>
      matchesBasemap(layer, mode.basemap),
    );
    if (mode) return mode.id;
  }
  return null;
};

export const getProviderBasemap = (
  providerId: BasemapProviderId,
  currentLayer?: ILayerConfig,
): LayerConfigTemplate => {
  const provider = basemapProviders.find((entry) => entry.id === providerId);
  if (!provider) throw new Error(`Unknown basemap provider: ${providerId}`);
  const currentMode = getBasemapMode(currentLayer);
  return (
    provider.modes.find((mode) => mode.id === currentMode)?.basemap ??
    provider.modes[0].basemap
  );
};

const matchesBasemap = (
  layer: ILayerConfig | undefined,
  basemap: LayerConfigTemplate,
) => {
  if (!layer?.isBasemap || layer.type !== basemap.type) return false;
  if (layer.type === "MAPBOX" && basemap.type === "MAPBOX") {
    return layer.url === basemap.url;
  }
  return (
    layer.type === "GOOGLE" &&
    basemap.type === "GOOGLE" &&
    layer.mapType === basemap.mapType
  );
};
