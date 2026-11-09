import type { Style } from "mapbox-gl";
import type { ILayerConfig } from "src/types";
import { env } from "src/lib/env-client";
import {
  getGoogleMapsSession,
  getGoogleMapsTileUrl,
  GOOGLE_MAPS_DISPLAY_OPTIONS,
} from "src/lib/google-map-tiles";
import { paintLayoutFromRasterLayer } from "src/lib/layer-config-adapters";

export async function addGoogleStyle(
  style: Style,
  layer: Extract<ILayerConfig, { type: "GOOGLE" }>,
  id: number,
): Promise<Style> {
  if (!layer.visibility) return style;

  const apiKey = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const session = await getGoogleMapsSession({
    apiKey,
    mapType: layer.mapType,
    labelVisibility: layer.labelVisibility,
    ...GOOGLE_MAPS_DISPLAY_OPTIONS,
  });
  const sourceId = `googleMapsSource${id}`;

  style.sources[sourceId] = {
    type: "raster",
    tiles: [getGoogleMapsTileUrl(session, apiKey)],
    tileSize: session.tileWidth,
    minzoom: 0,
    maxzoom: 22,
    attribution: "Google Maps",
  };
  style.layers.push({
    id: `googleMapsLayer${id}`,
    source: sourceId,
    ...paintLayoutFromRasterLayer(layer),
  });

  return style;
}
