import type { Style } from "mapbox-gl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ILayerConfig } from "src/types";
import { getGoogleMapsSession } from "src/lib/google-map-tiles";
import { addGoogleStyle } from "./google-map-style";

vi.mock("src/lib/env-client", () => ({
  env: { NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "test-key" },
}));

vi.mock("src/lib/google-map-tiles", () => ({
  GOOGLE_MAPS_DISPLAY_OPTIONS: { language: "en-US", region: "US" },
  getGoogleMapsSession: vi.fn(),
  getGoogleMapsTileUrl: () => "https://example.com/{z}/{x}/{y}.png",
}));

const layer: Extract<ILayerConfig, { type: "GOOGLE" }> = {
  id: "google",
  at: "a0",
  type: "GOOGLE",
  mapType: "satellite",
  name: "Google Satellite",
  visibility: true,
  labelVisibility: false,
  isBasemap: true,
  tms: false,
  opacity: 0.7,
};

describe("Google basemap style", () => {
  beforeEach(() => {
    vi.mocked(getGoogleMapsSession).mockReset();
  });

  it("leaves hidden Google layers untouched without requesting a session", async () => {
    const style = existingStyle();
    const original = structuredClone(style);

    await addGoogleStyle(style, { ...layer, visibility: false }, 1);

    expect(style).toEqual(original);
    expect(getGoogleMapsSession).not.toHaveBeenCalled();
  });

  it("uses provider tile dimensions and opacity while retaining overlays", async () => {
    vi.mocked(getGoogleMapsSession).mockResolvedValue({
      session: "session",
      expiry: 2000003600,
      tileWidth: 512,
      tileHeight: 512,
      imageFormat: "jpeg",
    });
    const style = existingStyle();
    const existingSource = style.sources.network;
    const existingLayer = style.layers[0];

    await addGoogleStyle(style, layer, 1);

    expect(getGoogleMapsSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mapType: "satellite",
        labelVisibility: false,
      }),
    );
    expect(style.sources.googleMapsSource1).toMatchObject({
      type: "raster",
      tileSize: 512,
    });
    expect(style.layers[1]).toMatchObject({
      type: "raster",
      paint: { "raster-opacity": 0.7 },
      layout: { visibility: "visible" },
    });
    expect(style.sources.network).toBe(existingSource);
    expect(style.layers[0]).toBe(existingLayer);
  });

  it("retains the current style when session creation fails", async () => {
    vi.mocked(getGoogleMapsSession).mockRejectedValue(new Error("Unavailable"));
    const style = existingStyle();
    const original = structuredClone(style);

    await expect(addGoogleStyle(style, layer, 1)).rejects.toThrow(
      "Unavailable",
    );

    expect(style).toEqual(original);
  });
});

function existingStyle(): Style {
  return {
    version: 8,
    sources: {
      network: {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      },
    },
    layers: [{ id: "pipes", type: "line", source: "network" }],
  };
}
