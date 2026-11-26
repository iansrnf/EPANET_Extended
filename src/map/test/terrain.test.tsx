import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import type { FeatureCollection } from "geojson";
import type { Style } from "mapbox-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import { setInitialState } from "src/__helpers__/state";
import { basemaps } from "src/map/basemaps";
import { TERRAIN_LAYER_ID, TERRAIN_SOURCE_ID } from "src/map/terrain";
import { layerConfigAtom, mapViewportAtom } from "src/state/map";
import { mapPitchRequestAtom } from "src/state/map-view";
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

vi.mock("src/hooks/use-translate", () => {
  const translate = (key: string) => key;
  return { useTranslate: () => translate };
});

const IDS = { JUNCTION: 1 } as const;
const TERRAIN = { source: TERRAIN_SOURCE_ID, exaggeration: 1.5 };
const SATELLITE_STYLE: Style = {
  version: 8,
  sources: {
    satellite: { type: "raster", url: "mapbox://mapbox.satellite" },
  },
  layers: [{ id: "satellite", type: "raster", source: "satellite" }],
};

beforeEach(() => {
  vi.stubGlobal("fetch", () =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(SATELLITE_STYLE) }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("3D terrain", () => {
  it("enables terrain before tilting and returns to a flat map without rebuilding the network", async () => {
    const { map, store } = await mountMap();
    const button = screen.getByRole("button", { name: "mapView.threeDLabel" });
    const networkData = map.getSource("main-features")?.data;
    const iconData = map.getSource("icons")?.data;
    const viewport = store.get(mapViewportAtom);
    const writeSource = vi.spyOn(map, "setSource");

    expect(map.map.addSource).not.toHaveBeenCalled();
    expect(map.map.getTerrain()).toBeNull();

    fireEvent.click(button);

    await waitFor(() => {
      expect(map.map.easeTo).toHaveBeenCalledWith({ pitch: 60, duration: 450 });
      expect(store.get(mapPitchRequestAtom)).toBeNull();
      expect(map.map.getTerrain()).toEqual(TERRAIN);
    });
    expect(map.map.addSource).toHaveBeenCalledWith(TERRAIN_SOURCE_ID, {
      type: "raster-dem",
      url: "mapbox://mapbox.mapbox-terrain-dem-v1",
      tileSize: 512,
      maxzoom: 14,
    });
    expect(map.map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: TERRAIN_LAYER_ID,
        type: "hillshade",
        source: TERRAIN_SOURCE_ID,
      }),
      "grid-minor",
    );
    expect(map.map.setTerrain.mock.invocationCallOrder[0]).toBeLessThan(
      map.map.easeTo.mock.invocationCallOrder[0],
    );

    finishPitch(map, 60);
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);

    await waitFor(() => {
      expect(map.map.easeTo).toHaveBeenLastCalledWith({
        pitch: 0,
        duration: 450,
      });
    });
    expect(map.map.getTerrain()).toEqual(TERRAIN);
    finishPitch(map, 0);

    await waitFor(() => expect(map.map.getTerrain()).toBeNull());
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(map.map.setLayoutProperty).toHaveBeenCalledWith(
      TERRAIN_LAYER_ID,
      "visibility",
      "none",
    );
    expect(map.map.removeSource).not.toHaveBeenCalled();
    expect(map.setStyle).toHaveBeenCalledTimes(1);
    expect(map.getSource("main-features")?.data).toBe(networkData);
    expect(map.getSource("icons")?.data).toBe(iconData);
    expect(writeSource.mock.calls.map(([source]) => source)).not.toContain(
      "main-features",
    );
    expect(store.get(mapViewportAtom)).toBe(viewport);

    fireEvent.click(button);

    await waitFor(() => expect(map.map.getTerrain()).toEqual(TERRAIN));
    expect(map.map.addSource).toHaveBeenCalledTimes(1);
    expect(map.map.addLayer).toHaveBeenCalledTimes(1);
    expect(map.map.setLayoutProperty).toHaveBeenLastCalledWith(
      TERRAIN_LAYER_ID,
      "visibility",
      "visible",
    );
  });

  it("follows a manual tilt and restores terrain after switching basemaps", async () => {
    const { map, store } = await mountMap();

    act(() => {
      emit(map, "pitchstart");
      map.map.getPitch.mockReturnValue(35);
      emit(map, "pitch");
      emit(map, "pitchend");
    });
    await waitFor(() => expect(map.map.getTerrain()).toEqual(TERRAIN));
    expect(map.map.easeTo).not.toHaveBeenCalled();
    map.map.setTerrain.mockClear();
    map.map.addSource.mockClear();

    act(() => store.set(layerConfigAtom, satelliteLayers()));

    await waitFor(() => {
      expect(map.setStyle).toHaveBeenCalledTimes(2);
      expect(map.map.getTerrain()).toEqual(TERRAIN);
      expect(map.map.setTerrain).toHaveBeenCalledWith(TERRAIN);
      expect(map.map.addSource).toHaveBeenCalledWith(
        TERRAIN_SOURCE_ID,
        expect.objectContaining({ type: "raster-dem" }),
      );
    });
    expect(map.map.easeTo).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "mapView.threeDLabel" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("applies a 3D request queued while a basemap is loading", async () => {
    const { map, store } = await mountMap();
    const applyStyle = map.setStyle.getMockImplementation()!;
    let finishStyle = () => {};
    map.setStyle.mockImplementationOnce(
      (style) =>
        new Promise<void>((resolve) => {
          finishStyle = () => {
            void applyStyle(style).then(resolve);
          };
        }),
    );

    act(() => store.set(layerConfigAtom, satelliteLayers()));
    await waitFor(() => expect(map.setStyle).toHaveBeenCalledTimes(2));
    fireEvent.click(
      screen.getByRole("button", { name: "mapView.threeDLabel" }),
    );
    expect(map.map.easeTo).not.toHaveBeenCalled();

    await act(async () => {
      finishStyle();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(map.map.getTerrain()).toEqual(TERRAIN);
      expect(map.map.easeTo).toHaveBeenCalledWith({ pitch: 60, duration: 450 });
      expect(store.get(mapPitchRequestAtom)).toBeNull();
    });
    expect(map.setStyle).toHaveBeenCalledTimes(2);
  });
});

const mountMap = async () => {
  const hydraulicModel = HydraulicModelBuilder.with()
    .aJunction(IDS.JUNCTION)
    .build();
  const store = setInitialState({ hydraulicModel });
  const map = await renderMap(store);
  await waitFor(() => {
    expect(map.setStyle).toHaveBeenCalledTimes(1);
    expect(
      (map.getSource("main-features")?.data as FeatureCollection).features,
    ).toHaveLength(1);
  });
  map.map.easeTo.mockImplementation(() => emit(map, "pitchstart"));
  return { map, store };
};

const emit = (map: MapTestEngine, eventName: string) => {
  for (const [event, listener] of map.map.on.mock.calls) {
    if (event === eventName) (listener as () => void)();
  }
};

const finishPitch = (map: MapTestEngine, pitch: number) => {
  act(() => {
    map.map.getPitch.mockReturnValue(pitch);
    emit(map, "pitch");
    emit(map, "pitchend");
  });
};

const satelliteLayers = () => {
  const layer: ILayerConfig = {
    ...basemaps.satellite,
    id: "basemap",
    at: "a0",
    visibility: true,
    labelVisibility: true,
    tms: false,
  };
  return new Map([[layer.id, layer]]);
};
