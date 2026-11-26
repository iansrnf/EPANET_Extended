import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import type { FeatureCollection } from "geojson";
import type { Style } from "mapbox-gl";
import mapboxgl from "mapbox-gl";
import type { MapEngine } from "@epanet-js/map";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import { setInitialState } from "src/__helpers__/state";
import { basemaps } from "src/map/basemaps";
import {
  TERRAIN_LAYER_ID,
  TERRAIN_SOURCE_ID,
  updateTerrain,
} from "src/map/terrain";
import { layerConfigAtom, mapViewportAtom } from "src/state/map";
import {
  MAX_MAP_PITCH,
  isMap3DAtom,
  map3DFlatteningAtom,
  mapPitchRequestAtom,
} from "src/state/map-view";
import { stagingModelDerivedAtom } from "src/state/derived-branch-state";
import { ephemeralStateAtom } from "src/state/drawing";
import { selectionAtom } from "src/state/selection";
import { gridPreviewAtom } from "src/state/map-projection";
import { USelection } from "src/selection";
import { getNode } from "src/hydraulic-model";
import type { ILayerConfig } from "src/types";
import type { MapTestEngine } from "./__helpers__/map-engine-mock";
import { stubNoSnapping, stubSnapping } from "./__helpers__/map-engine-mock";
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
  it("reuses terrain resources and skips repeated renderer updates", async () => {
    const { map } = await mountMap();
    const engine = map as unknown as MapEngine;
    map.map.setLayoutProperty.mockClear();

    updateTerrain(engine, true);
    updateTerrain(engine, true);
    expect(map.map.addSource).toHaveBeenCalledTimes(1);
    expect(map.map.addLayer).toHaveBeenCalledTimes(1);
    expect(map.map.setTerrain).toHaveBeenCalledTimes(1);
    expect(map.map.setLayoutProperty).not.toHaveBeenCalled();

    updateTerrain(engine, false);
    updateTerrain(engine, false);
    expect(map.map.setTerrain).toHaveBeenCalledTimes(2);
    expect(map.map.setTerrain).toHaveBeenLastCalledWith(null);
    expect(map.map.setLayoutProperty).toHaveBeenCalledTimes(1);

    updateTerrain(engine, true);
    updateTerrain(engine, true);
    expect(map.map.addSource).toHaveBeenCalledTimes(1);
    expect(map.map.addLayer).toHaveBeenCalledTimes(1);
    expect(map.map.setTerrain).toHaveBeenCalledTimes(3);
    expect(map.map.setLayoutProperty).toHaveBeenCalledTimes(2);
    expect(map.map.setLayoutProperty).toHaveBeenLastCalledWith(
      TERRAIN_LAYER_ID,
      "visibility",
      "visible",
    );
  });

  it.each([0, 30])(
    "returns to 2D after the exit animation ends at %d degrees",
    async (endPitch) => {
      const { map, store } = await mountMap();
      const button = screen.getByRole("button", {
        name: "mapView.threeDLabel",
      });
      const networkData = map.getSource("main-features")?.data;
      const iconData = map.getSource("icons")?.data;
      const viewport = store.get(mapViewportAtom);
      const writeSource = vi.spyOn(map, "setSource");

      expect(map.map.addSource).not.toHaveBeenCalled();
      expect(map.map.getTerrain()).toBeNull();
      expectCameraGestures(map, false);

      fireEvent.click(button);

      await waitFor(() => {
        expect(map.map.easeTo).toHaveBeenCalledWith({
          pitch: 60,
          duration: 450,
        });
        expect(store.get(mapPitchRequestAtom)).toBeNull();
        expect(map.map.getTerrain()).toEqual(TERRAIN);
        expectCameraGestures(map, true);
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
      expect(map.map.setTerrain).toHaveBeenCalledTimes(1);
      expect(button).toHaveAttribute("aria-pressed", "true");
      fireEvent.click(button);

      await waitFor(() => {
        expect(map.map.easeTo).toHaveBeenLastCalledWith({
          pitch: 0,
          duration: 450,
        });
      });
      expect(map.map.getTerrain()).toEqual(TERRAIN);
      expect(map.map.setTerrain).toHaveBeenCalledTimes(1);
      expect(store.get(isMap3DAtom)).toBe(false);
      expect(store.get(map3DFlatteningAtom)).toBe(true);
      expect(map.map.dragRotate.isEnabled()).toBe(false);
      expect(map.map.touchPitch.isEnabled()).toBe(false);
      finishPitch(map, endPitch);

      await waitFor(() => expect(map.map.getTerrain()).toBeNull());
      expect(store.get(map3DFlatteningAtom)).toBe(false);
      expectCameraGestures(map, false);
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
    },
  );

  it("adjusts tilt to zero while 3D remains explicitly enabled", async () => {
    const { map, store } = await mountMap();
    const button = screen.getByRole("button", { name: "mapView.threeDLabel" });
    fireEvent.click(button);
    await waitFor(() =>
      expect(map.map.easeTo).toHaveBeenCalledWith({ pitch: 60, duration: 450 }),
    );
    finishPitch(map, 60);
    const networkData = map.getSource("main-features")?.data;
    const iconData = map.getSource("icons")?.data;
    const viewport = store.get(mapViewportAtom);
    const slider = screen.getByRole("slider", { name: "mapView.tilt" });

    fireEvent.change(slider, { target: { value: "35" } });
    fireEvent.change(slider, { target: { value: "47" } });

    await waitFor(() => {
      expect(map.map.easeTo).toHaveBeenLastCalledWith({
        pitch: 47,
        duration: 0,
      });
      expect(store.get(mapPitchRequestAtom)).toBeNull();
    });
    finishPitch(map, 47);
    expectCameraGestures(map, true);
    expect(map.getSource("main-features")?.data).toBe(networkData);
    expect(map.getSource("icons")?.data).toBe(iconData);
    expect(store.get(mapViewportAtom)).toBe(viewport);
    expect(map.setStyle).toHaveBeenCalledTimes(1);

    fireEvent.change(slider, { target: { value: "0" } });

    await waitFor(() =>
      expect(map.map.easeTo).toHaveBeenLastCalledWith({
        pitch: 0,
        duration: 0,
      }),
    );
    finishPitch(map, 0);
    await waitFor(() => expectCameraGestures(map, true));
    expect(store.get(isMap3DAtom)).toBe(true);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(slider).toBeInTheDocument();
    expect(map.map.getTerrain()).toEqual(TERRAIN);

    fireEvent.click(button);
    await waitFor(() => expectCameraGestures(map, false));
    expect(map.map.getTerrain()).toBeNull();
    expect(map.map.getMaxPitch()).toBe(0);
  });

  it("ignores pitch events from 2D rotation until the 3D button is clicked", async () => {
    const { map, store } = await mountMap();
    const button = screen.getByRole("button", { name: "mapView.threeDLabel" });

    act(() => emit(map, "pitchstart"));
    await waitFor(() => expectCameraGestures(map, false));
    expect(map.map.getTerrain()).toBeNull();
    expect(button).toHaveAttribute("aria-pressed", "false");

    finishPitch(map, 35);
    await waitFor(() => expectCameraGestures(map, false));
    expect(store.get(isMap3DAtom)).toBe(false);
    expect(map.map.getTerrain()).toBeNull();
    expect(map.map.addSource).not.toHaveBeenCalled();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();

    fireEvent.click(button);
    await waitFor(() => {
      expectCameraGestures(map, true);
      expect(map.map.getTerrain()).toEqual(TERRAIN);
      expect(map.map.easeTo).toHaveBeenCalledWith({ pitch: 60, duration: 450 });
    });
    expect(store.get(isMap3DAtom)).toBe(true);
  });

  it("keeps 2D flat and restores rotation after basemap and grid changes", async () => {
    const { map, store } = await mountMap();
    expectCameraGestures(map, false);

    act(() => store.set(layerConfigAtom, satelliteLayers()));
    await waitFor(() => expect(map.setStyle).toHaveBeenCalledTimes(2));
    expectCameraGestures(map, false);
    expect(map.map.getTerrain()).toBeNull();
    expect(map.map.addSource).not.toHaveBeenCalled();

    act(() => store.set(gridPreviewAtom, true));
    await waitFor(() => expectCameraGestures(map, false, false));

    act(() => store.set(gridPreviewAtom, false));
    await waitFor(() => expectCameraGestures(map, false));
    expect(map.map.getPitch()).toBe(0);
    expect(map.map.getTerrain()).toBeNull();
    expect(map.map.easeTo).not.toHaveBeenCalled();
  });

  it("follows a manual tilt and restores terrain after switching basemaps", async () => {
    const { map, store } = await mountMap();
    fireEvent.click(
      screen.getByRole("button", { name: "mapView.threeDLabel" }),
    );
    await waitFor(() => expectCameraGestures(map, true));
    finishPitch(map, 60);
    map.map.easeTo.mockClear();

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
    map.map.dragRotate.enable.mockClear();

    act(() => store.set(layerConfigAtom, satelliteLayers()));

    await waitFor(() => {
      expect(map.setStyle).toHaveBeenCalledTimes(2);
      expect(map.map.getTerrain()).toEqual(TERRAIN);
      expect(map.map.setTerrain).toHaveBeenCalledWith(TERRAIN);
      expect(map.map.addSource).toHaveBeenCalledWith(
        TERRAIN_SOURCE_ID,
        expect.objectContaining({ type: "raster-dem" }),
      );
      expect(map.map.dragRotate.enable).toHaveBeenCalled();
      expectCameraGestures(map, true);
    });
    expect(map.map.easeTo).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "mapView.threeDLabel" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it.each([0, 60])(
    "cancels a selected node drag when two fingers take over at %d°",
    async (pitch) => {
      const { map, store } = await mountMap();
      if (pitch > 1) {
        fireEvent.click(
          screen.getByRole("button", { name: "mapView.threeDLabel" }),
        );
        await waitFor(() => expectCameraGestures(map, true));
      }
      finishPitch(map, pitch);
      act(() => store.set(selectionAtom, USelection.singleAsset(IDS.JUNCTION)));
      await waitFor(() => expectCameraGestures(map, pitch > 1));
      const model = store.get(stagingModelDerivedAtom);
      const node = getNode(model.assets, IDS.JUNCTION);
      if (!node) throw new Error("Missing junction");
      const coordinates = [...node.coordinates];
      const selection = store.get(selectionAtom);
      stubSnapping(map, [IDS.JUNCTION]);

      await act(async () => {
        map.handlers.current.onMapTouchStart(
          touchEvent(map, "touchstart", 1, coordinates),
        );
        await Promise.resolve();
      });
      expect(store.get(ephemeralStateAtom).type).toBe("moveAssets");

      await act(async () => {
        map.handlers.current.onMapTouchStart(
          touchEvent(map, "touchstart", 2, coordinates),
        );
        await Promise.resolve();
      });
      expect(store.get(ephemeralStateAtom).type).toBe("none");
      const displaced = [coordinates[0] + 1, coordinates[1] + 1];

      await act(async () => {
        map.handlers.current.onMapTouchMove(
          touchEvent(map, "touchmove", 2, displaced),
        );
        map.handlers.current.onMapTouchEnd(
          touchEvent(map, "touchend", 1, displaced),
        );
        map.handlers.current.onMapTouchMove(
          touchEvent(map, "touchmove", 1, displaced),
        );
        const end = touchEvent(map, "touchend", 0, displaced);
        map.handlers.current.onMapTouchEnd(end);
        map.handlers.current.onMapTouchEnd(end);
        await Promise.resolve();
      });
      expect(store.get(ephemeralStateAtom).type).toBe("none");
      expect(store.get(selectionAtom)).toBe(selection);
      expect(
        getNode(store.get(stagingModelDerivedAtom).assets, IDS.JUNCTION)
          ?.coordinates,
      ).toEqual(coordinates);

      stubNoSnapping(map);
      await act(async () => {
        map.handlers.current.onMapTouchStart(
          touchEvent(map, "touchstart", 1, displaced),
        );
        await Promise.resolve();
      });
      await act(async () => {
        map.handlers.current.onMapTouchMove(
          touchEvent(map, "touchmove", 1, displaced),
        );
        map.handlers.current.onMapTouchEnd(
          touchEvent(map, "touchend", 0, displaced),
        );
        await Promise.resolve();
      });

      expect(store.get(ephemeralStateAtom).type).toBe("none");
      expect(store.get(selectionAtom)).toBe(selection);
      expect(
        getNode(store.get(stagingModelDerivedAtom).assets, IDS.JUNCTION)
          ?.coordinates,
      ).toEqual(coordinates);
    },
  );

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

const expectCameraGestures = (
  map: MapTestEngine,
  pitchEnabled: boolean,
  rotationEnabled = true,
) => {
  expect(map.map.dragRotate.isEnabled()).toBe(rotationEnabled);
  expect(map.map.touchPitch.isEnabled()).toBe(pitchEnabled);
  expect(map.map.touchZoomRotate.isRotationEnabled()).toBe(rotationEnabled);
  expect(map.map.keyboard.isRotationEnabled()).toBe(rotationEnabled);
  expect(map.map.getMaxPitch()).toBe(pitchEnabled ? MAX_MAP_PITCH : 0);
};

const touchEvent = (
  map: MapTestEngine,
  type: "touchstart" | "touchmove" | "touchend",
  touchCount: number,
  coordinates: number[],
): mapboxgl.MapTouchEvent => {
  const originalEvent = new Event(type);
  Object.defineProperty(originalEvent, "touches", {
    value: Array.from({ length: touchCount }, (_, identifier) => ({
      identifier,
    })),
  });
  return {
    originalEvent,
    type,
    target: map.map,
    lngLat: new mapboxgl.LngLat(coordinates[0], coordinates[1]),
    point: new mapboxgl.Point(coordinates[0] * 100, coordinates[1] * 100),
    preventDefault: vi.fn(),
    defaultPrevented: false,
  } as unknown as mapboxgl.MapTouchEvent;
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
