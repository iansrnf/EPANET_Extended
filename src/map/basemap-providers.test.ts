import { describe, expect, it, vi } from "vitest";
import type { ILayerConfig } from "src/types";
import { basemaps, type LayerConfigTemplate } from "./basemaps";
import {
  getBasemapMode,
  getBasemapProvider,
  getProviderBasemap,
} from "./basemap-providers";

vi.mock("src/lib/env-client", () => ({
  env: {
    NEXT_PUBLIC_MAPBOX_TOKEN: "pk.test",
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "test-google-key",
    NEXT_PUBLIC_GEOCODE_EARTH_TOKEN: "_",
  },
}));

describe("basemap providers", () => {
  it.each([
    [basemaps.googleBlack, "google", "black"],
    [basemaps.googleSatellite, "google", "satellite"],
    [basemaps.satellite, "mapbox", "satellite"],
    [basemaps.black, "mapbox", "black"],
  ] as const)(
    "%# identifies a known provider and mode",
    (basemap, provider, mode) => {
      const layer = createBasemap(basemap);

      expect(getBasemapProvider(layer)).toBe(provider);
      expect(getBasemapMode(layer)).toBe(mode);
    },
  );

  it("recognizes a renamed preset by its style", () => {
    const layer = createBasemap({ ...basemaps.satellite, name: "Aerial view" });

    expect(getBasemapProvider(layer)).toBe("mapbox");
    expect(getBasemapMode(layer)).toBe("satellite");
  });

  it("does not identify custom styles by their names", () => {
    const layer = createBasemap({
      ...basemaps.black,
      url: "mapbox://styles/example/custom-style",
    });

    expect(getBasemapProvider(layer)).toBeNull();
    expect(getBasemapMode(layer)).toBeNull();
    expect(getProviderBasemap("google", layer)).toBe(basemaps.googleBlack);
  });

  it.each([
    "mapbox://styles/mapbox/light-v10",
    "mapbox://styles/mapbox/navigation-guidance-day-v4",
    "mapbox://styles/mapbox/outdoors-v12",
  ])("leaves removed light styles unclassified: %s", (url) => {
    const layer = createBasemap({ ...basemaps.black, url });

    expect(getBasemapProvider(layer)).toBeNull();
    expect(getBasemapMode(layer)).toBeNull();
    expect(getProviderBasemap("mapbox", layer)).toBe(basemaps.black);
  });

  it("does not identify an overlay as a selected basemap", () => {
    const layer = { ...createBasemap(basemaps.satellite), isBasemap: false };

    expect(getBasemapProvider(layer)).toBeNull();
    expect(getBasemapMode(layer)).toBeNull();
  });

  it("leaves unknown providers unclassified", () => {
    const layer: ILayerConfig = {
      ...createBasemap(basemaps.black),
      type: "XYZ",
      token: "",
      url: "https://example.com/{z}/{x}/{y}.png",
    };

    expect(getBasemapProvider(layer)).toBeNull();
    expect(getBasemapMode(layer)).toBeNull();
    expect(getProviderBasemap("mapbox", layer)).toBe(basemaps.black);
  });

  it.each([
    [basemaps.satellite, "google", basemaps.googleSatellite],
    [basemaps.googleSatellite, "mapbox", basemaps.satellite],
    [basemaps.black, "google", basemaps.googleBlack],
    [basemaps.googleBlack, "mapbox", basemaps.black],
  ] as const)(
    "%# preserves a supported mode between providers",
    (current, targetProvider, expected) => {
      expect(getProviderBasemap(targetProvider, createBasemap(current))).toBe(
        expected,
      );
    },
  );

  it.each([basemaps.black, basemaps.satellite])(
    "preserves $name within Mapbox",
    (basemap) => {
      expect(getProviderBasemap("mapbox", createBasemap(basemap))).toBe(
        basemap,
      );
    },
  );

  it("defaults to black without a selected basemap", () => {
    expect(getBasemapProvider()).toBeNull();
    expect(getBasemapMode()).toBeNull();
    expect(getProviderBasemap("google")).toBe(basemaps.googleBlack);
    expect(getProviderBasemap("mapbox")).toBe(basemaps.black);
  });
});

const createBasemap = (basemap: LayerConfigTemplate): ILayerConfig => ({
  ...basemap,
  id: "basemap",
  at: "a1",
  visibility: true,
  labelVisibility: true,
  tms: false,
});
