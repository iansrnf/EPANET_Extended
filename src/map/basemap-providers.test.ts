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
    [basemaps.googleRoadmap, "google", "roadmap"],
    [basemaps.googleSatellite, "google", "satellite"],
    [basemaps.streets, "mapbox", "roadmap"],
    [basemaps.satellite, "mapbox", "satellite"],
    [basemaps.monochrome, "mapbox", "monochrome"],
    [basemaps.outdoors, "mapbox", "outdoors"],
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
      ...basemaps.streets,
      url: "mapbox://styles/example/custom-style",
    });

    expect(getBasemapProvider(layer)).toBeNull();
    expect(getBasemapMode(layer)).toBeNull();
    expect(getProviderBasemap("google", layer)).toBe(basemaps.googleRoadmap);
  });

  it("does not identify an overlay as a selected basemap", () => {
    const layer = { ...createBasemap(basemaps.satellite), isBasemap: false };

    expect(getBasemapProvider(layer)).toBeNull();
    expect(getBasemapMode(layer)).toBeNull();
  });

  it("leaves unknown providers unclassified", () => {
    const layer: ILayerConfig = {
      ...createBasemap(basemaps.streets),
      type: "XYZ",
      token: "",
      url: "https://example.com/{z}/{x}/{y}.png",
    };

    expect(getBasemapProvider(layer)).toBeNull();
    expect(getBasemapMode(layer)).toBeNull();
    expect(getProviderBasemap("mapbox", layer)).toBe(basemaps.streets);
  });

  it.each([
    [basemaps.satellite, "google", basemaps.googleSatellite],
    [basemaps.googleSatellite, "mapbox", basemaps.satellite],
    [basemaps.streets, "google", basemaps.googleRoadmap],
    [basemaps.googleRoadmap, "mapbox", basemaps.streets],
  ] as const)(
    "%# preserves a supported mode between providers",
    (current, targetProvider, expected) => {
      expect(getProviderBasemap(targetProvider, createBasemap(current))).toBe(
        expected,
      );
    },
  );

  it.each([basemaps.monochrome, basemaps.outdoors])(
    "uses roadmap when Google does not support $name",
    (current) => {
      expect(getProviderBasemap("google", createBasemap(current))).toBe(
        basemaps.googleRoadmap,
      );
    },
  );

  it("preserves modes supported by the current provider", () => {
    expect(getProviderBasemap("mapbox", createBasemap(basemaps.outdoors))).toBe(
      basemaps.outdoors,
    );
  });

  it("defaults to roadmap without a selected basemap", () => {
    expect(getBasemapProvider()).toBeNull();
    expect(getBasemapMode()).toBeNull();
    expect(getProviderBasemap("google")).toBe(basemaps.googleRoadmap);
    expect(getProviderBasemap("mapbox")).toBe(basemaps.streets);
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
