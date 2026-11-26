import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import type { EventData, MapboxEvent, MapMouseEvent, Style } from "mapbox-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import { setInitialState } from "src/__helpers__/state";
import { USelection } from "src/selection";
import { selectionAtom } from "src/state/selection";
import {
  layerConfigAtom,
  mapLoadingAtom,
  mapViewportAtom,
} from "src/state/map";
import {
  isMap3DAtom,
  map3DBusyAtom,
  mapCameraDraggingAtom,
  mapPitchRequestAtom,
} from "src/state/map-view";
import { basemaps } from "src/map/basemaps";
import type { ILayerConfig } from "src/types";
import { renderMap } from "./__helpers__/map";
import {
  fireMapClick,
  type MapTestEngine,
} from "./__helpers__/map-engine-mock";

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

const IDS = { JUNCTION: 1 } as const;
const STYLE: Style = { version: 8, sources: {}, layers: [] };
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;

beforeEach(() => {
  frames.clear();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (frame: number) =>
    frames.delete(frame),
  );
  vi.stubGlobal("fetch", () =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(STYLE) }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("middle-button camera drag", () => {
  it.each([false, true])(
    "rotates without keyboard modifiers, with tilt restricted to explicit 3D: %s",
    async (threeD) => {
      const { map, store } = await mountMap(threeD);
      const selection = store.get(selectionAtom);
      const down = startMiddleDrag(map);

      expect(down.originalEvent.defaultPrevented).toBe(true);
      expect(down.preventDefault).toHaveBeenCalled();
      expect(store.get(mapCameraDraggingAtom)).toBe(true);

      const move = moveMiddleDrag();
      expect(move.defaultPrevented).toBe(true);
      paintFrame();
      await waitFor(() => {
        expect(map.map.jumpTo).toHaveBeenLastCalledWith({
          bearing: 16,
          pitch: threeD ? 70 : 0,
        });
        expect(store.get(mapPitchRequestAtom)).toBeNull();
      });
      expect(store.get(isMap3DAtom)).toBe(threeD);
      expect(store.get(selectionAtom)).toBe(selection);
      expect(map.map.easeTo).not.toHaveBeenCalled();

      fireEvent.mouseUp(window, {
        button: 1,
        buttons: 0,
        clientX: 120,
        clientY: 130,
      });
      expect(store.get(mapCameraDraggingAtom)).toBe(false);
      map.map.jumpTo.mockClear();
      fireEvent.mouseMove(window, {
        buttons: 0,
        clientX: 150,
        clientY: 110,
      });
      expect(store.get(mapPitchRequestAtom)).toBeNull();
      expect(map.map.jumpTo).not.toHaveBeenCalled();

      await fireMapClick(map, { lng: 10, lat: 10 });
      expect(store.get(selectionAtom)).toEqual(USelection.none());
    },
  );

  it.each(["blur", "lost button"] as const)(
    "cancels queued movement after %s",
    async (interruption) => {
      const { map, store } = await mountMap(false);
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
      await waitFor(() => {
        expect(map.setStyle).toHaveBeenCalledTimes(2);
        expect(store.get(mapLoadingAtom)).toBe(true);
      });

      startMiddleDrag(map);
      moveMiddleDrag();
      paintFrame();
      expect(store.get(mapPitchRequestAtom)).toMatchObject({ bearing: 16 });
      expect(map.map.easeTo).not.toHaveBeenCalled();
      expect(map.map.jumpTo).not.toHaveBeenCalled();

      if (interruption === "blur") {
        fireEvent.blur(window);
      } else {
        fireEvent.mouseMove(window, {
          buttons: 0,
          clientX: 140,
          clientY: 120,
        });
      }
      expect(store.get(mapCameraDraggingAtom)).toBe(false);
      expect(store.get(mapPitchRequestAtom)).toBeNull();

      moveMiddleDrag();
      paintFrame();
      expect(store.get(mapPitchRequestAtom)).toBeNull();
      await act(async () => {
        finishStyle();
        await Promise.resolve();
      });
      await waitFor(() => expect(store.get(mapLoadingAtom)).toBe(false));
      expect(map.map.easeTo).not.toHaveBeenCalled();
      expect(map.map.jumpTo).not.toHaveBeenCalled();
    },
  );

  it("coalesces input per frame and saves only the final viewport", async () => {
    const { map, store } = await mountMap(false);
    const requests: number[] = [];
    let viewportWrites = 0;
    const unsubscribeRequests = store.sub(mapPitchRequestAtom, () => {
      const bearing = store.get(mapPitchRequestAtom)?.bearing;
      if (bearing !== undefined) requests.push(bearing);
    });
    const unsubscribeViewport = store.sub(
      mapViewportAtom,
      () => viewportWrites++,
    );
    map.map.jumpTo.mockImplementation(
      (camera: { bearing: number; pitch: number }) => {
        map.map.getBearing.mockReturnValue(camera.bearing);
        map.map.getPitch.mockReturnValue(camera.pitch);
        map.handlers.current.onMoveEnd({
          target: map.map,
        } as unknown as MapboxEvent & EventData);
      },
    );
    startMiddleDrag(map);
    try {
      for (let i = 1; i <= 100; i++) {
        moveMiddleDrag({ clientX: 100 + i, clientY: 150 - i });
      }
      expect(requests).toHaveLength(0);
      expect(map.map.jumpTo).not.toHaveBeenCalled();
      paintFrame();
      await waitFor(() => expect(map.map.jumpTo).toHaveBeenCalledTimes(1));
      expect(requests).toHaveLength(1);
      expect(requests[0]).toBeCloseTo(80);
      expect(viewportWrites).toBe(0);
      expect(store.get(map3DBusyAtom)).toBe(true);

      for (let i = 101; i <= 150; i++) {
        moveMiddleDrag({ clientX: 100 + i, clientY: 150 - i });
      }
      expect(requests).toHaveLength(1);
      fireEvent.mouseUp(window, {
        button: 1,
        clientX: 250,
        clientY: 0,
      });
      await waitFor(() => expect(map.map.jumpTo).toHaveBeenCalledTimes(2));
      expect(requests).toHaveLength(2);
      expect(requests[1]).toBeCloseTo(120);
      expect(viewportWrites).toBe(1);
      expect(store.get(mapViewportAtom).bearing).toBeCloseTo(120);
      expect(store.get(map3DBusyAtom)).toBe(false);
      paintFrame();
      expect(map.map.jumpTo).toHaveBeenCalledTimes(2);
      expect(map.map.easeTo).not.toHaveBeenCalled();
    } finally {
      unsubscribeRequests();
      unsubscribeViewport();
    }
  });

  it("discards a queued frame when the window loses focus", async () => {
    const { map, store } = await mountMap(false);
    startMiddleDrag(map);
    moveMiddleDrag();
    expect(store.get(mapPitchRequestAtom)).toBeNull();
    fireEvent.blur(window);
    paintFrame();
    expect(store.get(mapCameraDraggingAtom)).toBe(false);
    expect(store.get(mapPitchRequestAtom)).toBeNull();
    expect(map.map.jumpTo).not.toHaveBeenCalled();
  });

  it("prevents middle-button autoscroll without blocking the wheel", async () => {
    await mountMap(false);
    const canvas = document.createElement("canvas");
    screen.getByTestId("map").appendChild(canvas);
    const auxiliaryClick = new MouseEvent("auxclick", {
      button: 1,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(canvas, auxiliaryClick);
    expect(auxiliaryClick.defaultPrevented).toBe(true);

    const wheel = new WheelEvent("wheel", {
      deltaY: 100,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(canvas, wheel);
    expect(wheel.defaultPrevented).toBe(false);
  });
});

const mountMap = async (threeD: boolean) => {
  const hydraulicModel = HydraulicModelBuilder.with()
    .aJunction(IDS.JUNCTION)
    .build();
  const store = setInitialState({ hydraulicModel });
  const map = await renderMap(store);
  await waitFor(() => expect(map.setStyle).toHaveBeenCalledTimes(1));
  if (threeD) {
    fireEvent.click(screen.getByRole("button", { name: "3D view" }));
    await waitFor(() =>
      expect(map.map.easeTo).toHaveBeenCalledWith({ pitch: 60, duration: 450 }),
    );
    act(() => {
      map.map.getPitch.mockReturnValue(60);
      for (const [event, listener] of map.map.on.mock.calls) {
        if (event === "pitch" || event === "pitchend") {
          (listener as () => void)();
        }
      }
    });
    await waitFor(() => expect(store.get(map3DBusyAtom)).toBe(false));
  }
  act(() => store.set(selectionAtom, USelection.singleAsset(IDS.JUNCTION)));
  await waitFor(() => expect(store.get(mapLoadingAtom)).toBe(false));
  map.map.easeTo.mockClear();
  return { map, store };
};

const startMiddleDrag = (map: MapTestEngine) => {
  const originalEvent = new MouseEvent("mousedown", {
    button: 1,
    buttons: 4,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    clientX: 100,
    clientY: 150,
    cancelable: true,
  });
  const event = {
    originalEvent,
    preventDefault: vi.fn(),
  } as unknown as MapMouseEvent;
  act(() => map.handlers.current.onMapMouseDown(event));
  return event;
};

const moveMiddleDrag = (overrides: MouseEventInit = {}) => {
  const event = new MouseEvent("mousemove", {
    button: 1,
    buttons: 4,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    clientX: 120,
    clientY: 130,
    cancelable: true,
    ...overrides,
  });
  fireEvent(window, event);
  return event;
};

const paintFrame = () => {
  act(() => {
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback(performance.now());
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
