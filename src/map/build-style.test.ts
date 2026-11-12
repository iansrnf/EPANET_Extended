import { afterEach, describe, it, expect, vi } from "vitest";
import type { Style } from "mapbox-gl";
import { validate } from "@mapbox/mapbox-gl-style-spec";
import { buildBaseStyle, makeLayers } from "./build-style";
import { SYMBOLIZATION_NONE, type ILayerConfig } from "src/types";
import { nullSymbologySpec } from "src/map/symbology";
import { basemaps } from "src/map/basemaps";
import { getGoogleMapsSession } from "src/lib/google-map-tiles";

vi.mock("src/lib/google-map-tiles", () => ({
  GOOGLE_MAPS_DISPLAY_OPTIONS: { language: "en-US", region: "US" },
  getGoogleMapsSession: vi.fn(),
  getGoogleMapsTileUrl: () => "https://example.com/{z}/{x}/{y}.png",
}));

describe("buildBaseStyle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.each([
    basemaps.satellite,
    basemaps.outdoors,
    basemaps.streets,
    basemaps.monochrome,
  ])(
    "keeps $name tiles while using an overlay-compatible projection",
    async (basemap) => {
      const providerStyle: Style = {
        version: 8,
        name: "Provider style",
        ...(basemap === basemaps.monochrome
          ? {}
          : { projection: { name: "globe" as const } }),
        sources: {
          imagery: {
            type: "raster",
            tiles: ["https://example.com/provider/{z}/{x}/{y}.jpg"],
            tileSize: 512,
            maxzoom: 22,
          },
        },
        layers: [
          {
            id: "imagery",
            type: "raster",
            source: "imagery",
            paint: { "raster-opacity": 0.65 },
          },
        ],
      };
      const originalStyle = structuredClone(providerStyle);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(providerStyle),
        }),
      );
      const layer: ILayerConfig = {
        ...basemap,
        id: "basemap",
        at: "a0",
        visibility: true,
        labelVisibility: true,
        tms: false,
      };

      const style = await buildBaseStyle({
        layerConfigs: new Map([[layer.id, layer]]),
        translate: (key) => key,
      });

      expect(style.projection).toEqual({ name: "mercator" });
      expect(style.sources).toEqual(originalStyle.sources);
      expect(style.layers).toEqual(originalStyle.layers);
      expect(providerStyle).toEqual(originalStyle);
    },
  );

  it.each([basemaps.googleRoadmap, basemaps.googleSatellite])(
    "keeps $name tile dimensions and opacity with the same projection",
    async (basemap) => {
      vi.mocked(getGoogleMapsSession).mockResolvedValue({
        session: "session",
        expiry: 2000003600,
        tileWidth: 512,
        tileHeight: 512,
        imageFormat: "jpeg",
      });
      const layer: ILayerConfig = {
        ...basemap,
        id: "basemap",
        at: "a0",
        visibility: true,
        labelVisibility: true,
        opacity: 0.7,
        tms: false,
      };

      const style = await buildBaseStyle({
        layerConfigs: new Map([[layer.id, layer]]),
        translate: (key) => key,
      });

      expect(style.projection).toEqual({ name: "mercator" });
      expect(style.sources.googleMapsSource1).toMatchObject({
        tiles: ["https://example.com/{z}/{x}/{y}.png"],
        tileSize: 512,
        maxzoom: 22,
      });
      expect(style.layers[1]).toMatchObject({
        type: "raster",
        paint: { "raster-opacity": 0.7 },
      });
    },
  );
});

// Mapbox rejects an invalid paint/layout expression at setStyle time and drops the whole
// style — the map never renders. Nothing else in the suite catches that: the map is mocked
// everywhere, so a layer is only ever built, never validated. Run the real spec validator.
const validateLayers = (layers: unknown[]): { message: string }[] => {
  const sources = Object.fromEntries(
    [
      "main-features",
      "delta-features",
      "icons",
      "delta-icons",
      "ephemeral",
      "map-overlay",
      "highlights",
      "grid",
      "zones",
    ].map((id) => [
      id,
      { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    ]),
  );

  // glyphs/sprite come from the real base style these layers are pushed onto; without
  // them the validator flags every text-field for a problem the app doesn't have.
  return validate({
    version: 8,
    glyphs: "mapbox://fonts/mapbox/{fontstack}/{range}.pbf",
    sprite: "mapbox://sprites/mapbox/streets-v12",
    sources,
    layers,
  } as never) as { message: string }[];
};

describe("makeLayers", () => {
  it("builds layers mapbox accepts", () => {
    const layers = makeLayers({
      symbology: SYMBOLIZATION_NONE,
      previewProperty: null,
      nodeDefaults: nullSymbologySpec.node.defaults,
      linkDefaults: nullSymbologySpec.link.defaults,
    });

    expect(validateLayers(layers)).toEqual([]);
  });

  it("keeps zoom as the direct input of the arrow opacity interpolate", () => {
    const layers = makeLayers({
      symbology: SYMBOLIZATION_NONE,
      previewProperty: null,
      nodeDefaults: nullSymbologySpec.node.defaults,
      linkDefaults: nullSymbologySpec.link.defaults,
    });
    const arrows = layers.find(
      (layer) => layer.id === "main-features-pipe-arrows",
    ) as unknown as { paint: Record<string, unknown> };

    // Reading feature state (`hidden`) has to happen in the interpolate's output branches;
    // wrapping the interpolate to do it is what mapbox rejects.
    const opacity = arrows.paint["icon-opacity"] as unknown[];
    expect(opacity[0]).toBe("interpolate");
    expect(opacity[2]).toEqual(["zoom"]);
  });
});
