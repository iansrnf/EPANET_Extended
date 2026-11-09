import { act, cleanup, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Style } from "mapbox-gl";
import { setInitialState } from "src/__helpers__/state";
import { basemaps } from "src/map/basemaps";
import { ILayerConfig } from "src/types";
import { USelection } from "src/selection";
import { selectionAtom } from "src/state/selection";
import { Store } from "src/state";
import { renderMap } from "./__helpers__/map";

vi.mock("@deck.gl/mapbox", () => ({ MapboxOverlay: class {} }));

vi.mock("src/map/overlays/customer-points", () => ({
  buildCustomerPointsOverlay: () => [],
  buildCustomerPointsHighlightOverlay: () => [],
  buildCustomerPointsSelectionOverlay: () => [],
  buildConnectCustomerPointsPreviewOverlay: () => [],
  buildMovingCustomerPointOverlay: () => [],
  applyCustomerPointsStyles: () => [],
  updateCustomerPointsOverlayVisibility: () => [],
}));

const auth = vi.hoisted(() => {
  let isSignedIn = false;
  const listeners = new Set<() => void>();
  return {
    isSignedIn: () => isSignedIn,
    setSignedIn: (value: boolean) => {
      isSignedIn = value;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

vi.mock("src/hooks/use-auth", async () => {
  const { useSyncExternalStore } = await import("react");
  const { nullUser } = await import("src/auth-types");
  return {
    useAuth: () => ({
      isLoaded: true,
      isSignedIn: useSyncExternalStore(auth.subscribe, auth.isSignedIn),
      userId: undefined,
      user: nullUser,
      signOut: async () => {},
      reload: async () => {},
      getToken: () => Promise.resolve(null),
    }),
  };
});

const IDS = { junction: 1 } as const;

const SATELLITE_STYLE: Style = {
  version: 8,
  name: "Mapbox Satellite Streets",
  sources: {
    "mapbox-satellite": {
      type: "raster",
      url: "mapbox://mapbox.satellite",
      tileSize: 256,
      maxzoom: 22,
    },
  },
  layers: [
    {
      id: "satellite",
      type: "raster",
      source: "mapbox-satellite",
      paint: { "raster-resampling": "linear" },
    },
    { id: "road-label", type: "symbol", source: "composite" },
  ],
};

describe("Mapbox satellite resolution", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each([false, true])(
    "preserves provider resolution when signed in is %s",
    async (isSignedIn) => {
      const map = await renderSatelliteMap({ isSignedIn });
      const style = map.setStyle.mock.lastCall?.[0];

      expect(style?.sources["mapbox-satellite"]).toEqual(
        SATELLITE_STYLE.sources["mapbox-satellite"],
      );
      expect(
        style?.layers.find((layer) => layer.id === "satellite"),
      ).toMatchObject({ paint: { "raster-resampling": "linear" } });
    },
  );

  it.each([false, true])(
    "keeps satellite tiles unchanged when signing in becomes %s",
    async (isSignedIn) => {
      const map = await renderSatelliteMap({ isSignedIn: !isSignedIn });
      map.map.addSource.mockClear();
      map.map.removeSource.mockClear();
      map.map.addLayer.mockClear();
      map.map.removeLayer.mockClear();

      act(() => auth.setSignedIn(isSignedIn));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(map.map.addSource).not.toHaveBeenCalled();
      expect(map.map.removeSource).not.toHaveBeenCalled();
      expect(map.map.addLayer).not.toHaveBeenCalled();
      expect(map.map.removeLayer).not.toHaveBeenCalled();
      expect(map.setStyle).toHaveBeenCalledTimes(1);
      expect(
        map.setStyle.mock.lastCall?.[0].sources["mapbox-satellite"],
      ).toEqual(SATELLITE_STYLE.sources["mapbox-satellite"]);
    },
  );
});

const rerenderCanvasWithMap = (store: Store) =>
  act(() => store.set(selectionAtom, USelection.singleAsset(IDS.junction)));

const renderSatelliteMap = async ({ isSignedIn }: { isSignedIn: boolean }) => {
  vi.stubGlobal("fetch", () =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(SATELLITE_STYLE) }),
  );
  auth.setSignedIn(isSignedIn);

  const satellite: ILayerConfig = {
    ...basemaps.satellite,
    id: "basemap",
    at: "a0",
    tms: false,
    visibility: true,
    labelVisibility: true,
  };
  const store = setInitialState({
    layerConfigs: new Map([["basemap", satellite]]),
  });

  const map = await renderMap(store);
  rerenderCanvasWithMap(store);
  await waitFor(() => {
    expect(map.setStyle).toHaveBeenCalledTimes(1);
  });

  return map;
};
