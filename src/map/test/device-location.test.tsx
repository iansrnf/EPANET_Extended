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
import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import type { HydraulicModel } from "src/hydraulic-model";
import { basemaps } from "src/map/basemaps";
import { DEVICE_LOCATION_SOURCE_ID } from "src/map/device-location-overlay";
import {
  deviceLocationAtom,
  deviceLocationViewportRequestAtom,
} from "src/state/device-location";
import { layerConfigAtom, mapViewportAtom } from "src/state/map";
import { mapPitchRequestAtom } from "src/state/map-view";
import type { Store } from "src/state";
import type { ILayerConfig } from "src/types";
import type { MapTestEngine } from "./__helpers__/map-engine-mock";
import { renderMap } from "./__helpers__/map";

vi.mock("@deck.gl/mapbox", () => ({ MapboxOverlay: class {} }));

vi.mock("src/map/overlays/customer-points", () => ({
  buildCustomerPointsOverlay: () => [],
  buildCustomerPointHoverOverlay: () => [],
  buildCustomerPointsHighlightOverlay: () => [],
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
    "basemapModes.satellite": "Satellite",
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

    fireEvent.click(screen.getByRole("button", { name: "Map provider" }));
    fireEvent.click(
      await screen.findByRole("radio", { name: "Google Maps: Satellite" }),
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

    fireEvent.click(screen.getByRole("radio", { name: "Mapbox: Satellite" }));
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

  it("tilts without rebuilding the network or applying a late automatic location", async () => {
    const IDS = { J1: 1 };
    const hydraulicModel = HydraulicModelBuilder.with()
      .aJunction(IDS.J1)
      .build();
    const { map, store } = await mountMap(hydraulicModel);
    await waitFor(() => {
      expect(
        (map.getSource("main-features")?.data as FeatureCollection).features,
      ).toHaveLength(1);
    });
    const networkData = map.getSource("main-features")?.data;
    const iconData = map.getSource("icons")?.data;
    const viewport = store.get(mapViewportAtom);
    const writeSource = vi.spyOn(map, "setSource");

    fireEvent.click(
      screen.getByRole("button", { name: "mapView.threeDLabel" }),
    );

    await waitFor(() => {
      expect(map.map.easeTo).toHaveBeenCalledWith({ pitch: 60, duration: 450 });
      expect(store.get(mapPitchRequestAtom)).toBeNull();
    });
    await resolvePosition();
    await waitFor(() => expect(locationFeatures(map)).toHaveLength(1));

    expect(map.map.easeTo).toHaveBeenCalledTimes(1);
    expect(map.setStyle).toHaveBeenCalledTimes(1);
    expect(map.getSource("main-features")?.data).toBe(networkData);
    expect(map.getSource("icons")?.data).toBe(iconData);
    expect(writeSource.mock.calls.map(([source]) => source)).not.toContain(
      "main-features",
    );
    expect(store.get(mapViewportAtom)).toBe(viewport);
    expect(store.get(deviceLocationViewportRequestAtom)).toBeNull();
  });

  it("returns from an observed manual tilt without recentering the map", async () => {
    const { map, store } = await mountMap();
    const button = screen.getByRole("button", {
      name: "mapView.threeDLabel",
    });
    const pitchListener = map.map.on.mock.calls.find(
      ([event]) => event === "pitch",
    )?.[1] as (() => void) | undefined;
    const pitchStartListener = map.map.on.mock.calls.find(
      ([event]) => event === "pitchstart",
    )?.[1] as (() => void) | undefined;
    const pitchEndListener = map.map.on.mock.calls.find(
      ([event]) => event === "pitchend",
    )?.[1] as (() => void) | undefined;
    expect(pitchListener).toBeTypeOf("function");
    expect(pitchStartListener).toBeTypeOf("function");
    expect(pitchEndListener).toBeTypeOf("function");

    act(() => {
      pitchStartListener?.();
      map.map.getPitch.mockReturnValue(35);
      pitchListener?.();
    });

    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();

    act(() => pitchEndListener?.());
    expect(button).toBeEnabled();
    fireEvent.click(button);

    await waitFor(() => {
      expect(map.map.easeTo).toHaveBeenCalledWith({ pitch: 0, duration: 450 });
      expect(store.get(mapPitchRequestAtom)).toBeNull();
    });
    expect(map.map.easeTo).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute("aria-pressed", "true");

    act(() => {
      map.map.getPitch.mockReturnValue(0);
      pitchEndListener?.();
    });

    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(map.setStyle).toHaveBeenCalledTimes(1);
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
      store.set(layerConfigAtom, new Map([["basemap", layer(basemaps.black)]]));
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

const mountMap = async (
  hydraulicModel?: HydraulicModel,
): Promise<{ map: MapTestEngine; store: Store }> => {
  const store = setInitialState({
    hydraulicModel,
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
  template: typeof basemaps.satellite | typeof basemaps.black,
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
