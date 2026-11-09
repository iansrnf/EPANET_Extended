import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { notify } from "src/components/notifications";
import { basemaps } from "src/map/basemaps";
import { layerConfigAtom } from "src/state/map";
import { ILayerConfig } from "src/types";
import { useSelectBasemap } from "./select-basemap";
import { useToggleSatellite } from "./toggle-satellite";

vi.mock("@epanet-js/map", () => ({
  DEFAULT_CENTER: [-4.3800042, 55.914314],
  DEFAULT_ZOOM: 15.5,
}));

const mockedEnv = vi.hoisted(() => ({
  NEXT_PUBLIC_MAPBOX_TOKEN: "pk.test",
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "test-google-key",
  NEXT_PUBLIC_GEOCODE_EARTH_TOKEN: "_",
}));

vi.mock("src/lib/env-client", () => ({ env: mockedEnv }));

vi.mock("src/components/notifications", () => ({ notify: vi.fn() }));
vi.mock("src/hooks/use-translate", () => ({
  useTranslate: () => (key: string) => key,
}));

beforeEach(() => {
  mockedEnv.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "test-google-key";
});

describe("basemap selection", () => {
  it("replaces providers while preserving overlays and basemap settings", () => {
    const store = basemapStore();
    const { result } = renderHook(() => useSelectBasemap(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    });

    act(() => {
      result.current(basemaps.googleRoadmap);
    });
    act(() => {
      result.current(basemaps.googleSatellite);
    });
    act(() => {
      result.current(basemaps.monochrome);
    });

    const layers = [...store.get(layerConfigAtom).values()];
    expect(layers).toHaveLength(2);
    expect(layers.find((layer) => layer.id === "overlay")).toEqual(overlay);
    expect(layers.find((layer) => layer.isBasemap)).toMatchObject({
      type: "MAPBOX",
      name: "Monochrome",
      at: "a1",
      labelVisibility: false,
    });
  });

  it("leaves the map unchanged when the Google key is missing", () => {
    mockedEnv.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "";
    const store = basemapStore();
    const previous = store.get(layerConfigAtom);
    const { result } = renderHook(() => useSelectBasemap(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    });

    act(() => expect(result.current(basemaps.googleSatellite)).toBe(false));

    expect(store.get(layerConfigAtom)).toBe(previous);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ description: "googleMaps.configureKey" }),
    );
  });

  it("toggles satellite within the selected Google provider", () => {
    const store = basemapStore({
      ...basemaps.googleRoadmap,
      id: "basemap",
      at: "a1",
      visibility: true,
      labelVisibility: false,
      tms: false,
    });
    const { result } = renderHook(() => useToggleSatellite(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    });

    act(() => result.current());
    expect(currentBasemap(store)).toMatchObject({
      type: "GOOGLE",
      mapType: "satellite",
    });

    act(() => result.current());
    expect(currentBasemap(store)).toMatchObject({
      type: "GOOGLE",
      mapType: "roadmap",
    });
    expect(store.get(layerConfigAtom).get("overlay")).toEqual(overlay);
  });
});

const overlay: ILayerConfig = {
  id: "overlay",
  type: "XYZ",
  name: "Survey",
  url: "https://example.com/{z}/{x}/{y}.png",
  token: "",
  at: "a0",
  visibility: true,
  labelVisibility: true,
  opacity: 1,
  isBasemap: false,
  tms: false,
};

const basemapStore = (
  basemap: ILayerConfig = {
    ...basemaps.monochrome,
    id: "basemap",
    at: "a1",
    visibility: true,
    labelVisibility: false,
    tms: false,
  },
) => {
  const store = createStore();
  store.set(
    layerConfigAtom,
    new Map([
      [overlay.id, overlay],
      [basemap.id, basemap],
    ]),
  );
  return store;
};

const currentBasemap = (store: ReturnType<typeof basemapStore>) =>
  [...store.get(layerConfigAtom).values()].find((layer) => layer.isBasemap);
