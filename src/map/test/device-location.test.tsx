import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Feature, FeatureCollection } from "geojson";
import type { Style } from "mapbox-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInitialState } from "src/__helpers__/state";
import { basemaps } from "src/map/basemaps";
import { DEVICE_LOCATION_SOURCE_ID } from "src/map/device-location-overlay";
import {
  deviceLocationAtom,
  deviceLocationViewportRequestAtom,
} from "src/state/device-location";
import { layerConfigAtom, mapViewportAtom } from "src/state/map";
import type { Store } from "src/state";
import type { ILayerConfig } from "src/types";
import type { MapTestEngine } from "./__helpers__/map-engine-mock";
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

vi.mock("src/lib/env-client", () => ({
  env: {
    NEXT_PUBLIC_MAPBOX_TOKEN: "pk.test",
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "test-google-key",
    NEXT_PUBLIC_GEOCODE_EARTH_TOKEN: "_",
  },
}));

vi.mock("src/lib/google-map-tiles", () => ({
  getGoogleMapsSession: vi.fn(() =>
    Promise.resolve({
      session: "test-session",
      expiry: Date.now() / 1000 + 3600,
      tileWidth: 256,
      tileHeight: 256,
      imageFormat: "png",
    }),
  ),
  getGoogleMapsTileUrl: () =>
    "https://example.test/tiles/{z}/{x}/{y}?session=test-session",
  getGoogleMapsAttribution: () => Promise.resolve("Google Maps"),
  GOOGLE_MAPS_DISPLAY_OPTIONS: { language: "en-US", region: "US" },
  GOOGLE_MAPS_SESSION_RENEWAL_MARGIN_SECONDS: 60,
}));

vi.mock("src/hooks/use-translate", () => {
  const labels: Record<string, string> = {
    "deviceLocation.goTo": "Go to my location",
    mapProvider: "Map provider",
  };
  const translate = (key: string) => labels[key] ?? key;
  return { useTranslate: () => translate };
});

let success: PositionCallback;
let failure: PositionErrorCallback;
const originalGeolocation = Object.getOwnPropertyDescriptor(
  navigator,
  "geolocation",
);
const getCurrentPosition = vi.fn(
  (onSuccess: PositionCallback, onError: PositionErrorCallback) => {
    success = onSuccess;
    failure = onError;
  },
);

const MAPBOX_STYLE: Style = {
  version: 8,
  sources: {
    "mapbox-satellite": {
      type: "raster",
      url: "mapbox://mapbox.satellite",
      tileSize: 256,
    },
  },
  layers: [{ id: "satellite", type: "raster", source: "mapbox-satellite" }],
};

beforeEach(() => {
  getCurrentPosition.mockClear();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
  vi.stubGlobal("fetch", () =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(MAPBOX_STYLE) }),
  );
});

afterEach(() => {
  cleanup();
  if (originalGeolocation) {
    Object.defineProperty(navigator, "geolocation", originalGeolocation);
  } else {
    Reflect.deleteProperty(navigator, "geolocation");
  }
  vi.unstubAllGlobals();
});

describe("device location on the map", () => {
  it("centers once and renders the current point", async () => {
    const { map } = await mountMap();

    await resolvePosition();

    await waitFor(() => {
      expect(map.map.easeTo).toHaveBeenCalledWith({
        center: [125.17, 6.12],
        zoom: 16,
        duration: 0,
      });
      expect(locationFeatures(map)).toEqual([
        expect.objectContaining({
          geometry: { type: "Point", coordinates: [125.17, 6.12] },
        }),
      ]);
    });
    expect(map.map.easeTo).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("uses a fresh position when the location button is clicked after panning", async () => {
    const { map, store } = await mountMap();
    await resolvePosition();
    await waitFor(() => expect(map.map.easeTo).toHaveBeenCalledTimes(1));
    act(() => store.set(mapViewportAtom, { center: [120, 10], zoom: 12 }));

    fireEvent.click(screen.getByRole("button", { name: "Go to my location" }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    await resolvePosition({ longitude: 125.18, latitude: 6.13 });

    await waitFor(() => {
      expect(map.map.easeTo).toHaveBeenLastCalledWith({
        center: [125.18, 6.13],
        zoom: 16,
        duration: 800,
      });
      expect(locationFeatures(map)).toContainEqual(
        expect.objectContaining({
          geometry: { type: "Point", coordinates: [125.18, 6.13] },
        }),
      );
    });
    expect(map.map.easeTo).toHaveBeenCalledTimes(2);
  });

  it("preserves the point and viewport across Google and Mapbox style changes", async () => {
    const { map, store } = await mountMap();
    await resolvePosition();
    await waitFor(() => expect(map.map.easeTo).toHaveBeenCalledTimes(1));
    const location = store.get(deviceLocationAtom);
    const viewport = { center: [125.2, 6.2] as [number, number], zoom: 17 };
    act(() => store.set(mapViewportAtom, viewport));

    fireEvent.change(
      screen.getByLabelText("Map provider", { selector: "select" }),
      {
        target: { value: "google" },
      },
    );
    await waitFor(() => {
      expect(map.setStyle).toHaveBeenCalledTimes(2);
      expect(
        Object.values(map.setStyle.mock.lastCall![0].sources),
      ).toContainEqual(
        expect.objectContaining({
          tiles: [expect.stringContaining("example.test")],
        }),
      );
      expect(locationFeatures(map)).toHaveLength(1);
    });

    fireEvent.change(
      screen.getByLabelText("Map provider", { selector: "select" }),
      {
        target: { value: "mapbox" },
      },
    );
    await waitFor(() => {
      expect(map.setStyle).toHaveBeenCalledTimes(3);
      expect(locationFeatures(map)).toHaveLength(1);
    });

    expect(store.get(deviceLocationAtom)).toBe(location);
    expect(store.get(mapViewportAtom)).toBe(viewport);
    expect(map.map.easeTo).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("does not override map interaction while the initial position is pending", async () => {
    const { map, store } = await mountMap();

    fireEvent.pointerDown(screen.getByTestId("map"));
    await resolvePosition();

    await waitFor(() => expect(locationFeatures(map)).toHaveLength(1));
    expect(map.map.easeTo).not.toHaveBeenCalled();
    expect(store.get(deviceLocationViewportRequestAtom)).toBeNull();
  });

  it("cancels initial centering when navigation occurs during style application", async () => {
    const { map, store } = await mountMap();
    const applyStyle = map.setStyle.getMockImplementation()!;
    let finishStyle: () => void = () => {};
    map.setStyle.mockImplementationOnce(
      (style) =>
        new Promise<void>((resolve) => {
          finishStyle = () => {
            void applyStyle(style).then(resolve);
          };
        }),
    );

    await act(async () => {
      store.set(
        layerConfigAtom,
        new Map([["basemap", layer(basemaps.streets)]]),
      );
      success(position());
      await Promise.resolve();
    });
    await waitFor(() => expect(map.setStyle).toHaveBeenCalledTimes(2));
    expect(store.get(deviceLocationViewportRequestAtom)).not.toBeNull();
    fireEvent.pointerDown(screen.getByTestId("map"));
    await act(async () => {
      finishStyle();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(store.get(deviceLocationViewportRequestAtom)).toBeNull();
      expect(locationFeatures(map)).toHaveLength(1);
    });
    expect(map.map.easeTo).not.toHaveBeenCalled();
  });

  it("keeps the fallback viewport after denial and retries only on request", async () => {
    const { map, store } = await mountMap();
    const fallback = store.get(mapViewportAtom);

    await act(async () => {
      failure({
        code: 1,
        message: "Denied",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      });
      await Promise.resolve();
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "deviceLocation.errors.permission-denied",
    );
    expect(store.get(mapViewportAtom)).toBe(fallback);
    expect(map.map.easeTo).not.toHaveBeenCalled();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Go to my location" }));
    await resolvePosition();

    await waitFor(() => expect(map.map.easeTo).toHaveBeenCalledTimes(1));
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });
});

const mountMap = async (): Promise<{ map: MapTestEngine; store: Store }> => {
  const store = setInitialState({
    layerConfigs: new Map([["basemap", layer(basemaps.satellite)]]),
  });
  const map = await renderMap(store);
  await waitFor(() => {
    expect(map.setStyle).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });
  return { map, store };
};

const layer = (
  template: typeof basemaps.satellite | typeof basemaps.streets,
): ILayerConfig => ({
  ...template,
  id: "basemap",
  at: "a0",
  visibility: true,
  labelVisibility: true,
  tms: false,
});

const locationFeatures = (map: MapTestEngine): Feature[] =>
  (map.getSource(DEVICE_LOCATION_SOURCE_ID)?.data as FeatureCollection)
    .features;

const resolvePosition = async (
  coords: Partial<GeolocationCoordinates> = {},
) => {
  await act(async () => {
    success(position(coords));
    await Promise.resolve();
  });
};

const position = (
  coords: Partial<GeolocationCoordinates> = {},
): GeolocationPosition => ({
  coords: {
    longitude: 125.17,
    latitude: 6.12,
    accuracy: 12,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    ...coords,
    toJSON: () => ({}),
  },
  timestamp: Date.now(),
  toJSON: () => ({}),
});
