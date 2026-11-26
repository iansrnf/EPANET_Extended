import type { MapEngine } from "@epanet-js/map";

export const TERRAIN_SOURCE_ID = "map-terrain-dem";
export const TERRAIN_LAYER_ID = "map-terrain-hillshade";

export const updateTerrain = (map: MapEngine, enabled: boolean) => {
  if (!map.isAlive()) return;

  const renderer = map.map;
  if (!enabled) {
    if (renderer.getTerrain()) renderer.setTerrain(null);
    if (renderer.getLayer(TERRAIN_LAYER_ID)) {
      renderer.setLayoutProperty(TERRAIN_LAYER_ID, "visibility", "none");
    }
    return;
  }

  if (!renderer.getSource(TERRAIN_SOURCE_ID)) {
    renderer.addSource(TERRAIN_SOURCE_ID, {
      type: "raster-dem",
      url: "mapbox://mapbox.mapbox-terrain-dem-v1",
      tileSize: 512,
      maxzoom: 14,
    });
  }

  if (!renderer.getLayer(TERRAIN_LAYER_ID)) {
    renderer.addLayer(
      {
        id: TERRAIN_LAYER_ID,
        type: "hillshade",
        source: TERRAIN_SOURCE_ID,
        paint: {
          "hillshade-exaggeration": 0.35,
          "hillshade-shadow-color": "#17212b",
          "hillshade-highlight-color": "#dbe8ed",
          "hillshade-accent-color": "#354956",
        },
      },
      "grid-minor",
    );
  } else {
    renderer.setLayoutProperty(TERRAIN_LAYER_ID, "visibility", "visible");
  }

  renderer.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: 1.5 });
};
