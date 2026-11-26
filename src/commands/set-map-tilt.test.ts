import { createStore } from "jotai";
import { hoveredAssetIdAtom } from "src/state/asset-hover";
import { deviceLocationNavigationRevisionAtom } from "src/state/device-location";
import { hoveredLoggerIdAtom } from "src/state/loggers";
import {
  hoveredCustomerPointIdAtom,
  hoveredZoneIdAtom,
} from "src/state/map-hover";
import {
  currentMapPitchAtom,
  isMap3DAtom,
  MAX_MAP_PITCH,
  map3DFlatteningAtom,
  mapPitchRequestAtom,
  mapPitchTransitioningAtom,
} from "src/state/map-view";
import { setMapTilt } from "./set-map-tilt";

const IDS = { JUNCTION: 1, CUSTOMER: 2, ZONE: 3 } as const;

describe("setMapTilt", () => {
  it.each([
    { pitch: -10, target: 0 },
    { pitch: 0, target: 0 },
    { pitch: 42.5, target: 42.5 },
    { pitch: MAX_MAP_PITCH, target: MAX_MAP_PITCH },
    { pitch: 120, target: MAX_MAP_PITCH },
  ])("limits pitch $pitch to $target", ({ pitch, target }) => {
    const store = createStore();
    store.set(isMap3DAtom, true);
    store.set(currentMapPitchAtom, 60);

    setMapTilt(store.get, store.set, pitch);

    expect(store.get(mapPitchRequestAtom)).toEqual({
      pitch: target,
      duration: 0,
    });
    expect(store.get(currentMapPitchAtom)).toBe(60);
    expect(store.get(isMap3DAtom)).toBe(true);
  });

  it("allows tilting from flat while 3D remains selected", () => {
    const store = createStore();
    store.set(isMap3DAtom, true);

    setMapTilt(store.get, store.set, 35);

    expect(store.get(isMap3DAtom)).toBe(true);
    expect(store.get(mapPitchRequestAtom)).toEqual({ pitch: 35, duration: 0 });
  });

  it("replaces queued changes while the camera is transitioning", () => {
    const store = createStore();
    store.set(isMap3DAtom, true);
    store.set(mapPitchTransitioningAtom, true);
    store.set(mapPitchRequestAtom, { pitch: 40, duration: 450 });

    setMapTilt(store.get, store.set, 50);
    setMapTilt(store.get, store.set, 65);

    expect(store.get(mapPitchRequestAtom)).toEqual({ pitch: 65, duration: 0 });
  });

  it("clears stale hover and cancels automatic navigation", () => {
    const store = createStore();
    store.set(isMap3DAtom, true);
    store.set(hoveredAssetIdAtom, IDS.JUNCTION);
    store.set(hoveredCustomerPointIdAtom, IDS.CUSTOMER);
    store.set(hoveredZoneIdAtom, IDS.ZONE);
    store.set(hoveredLoggerIdAtom, "logger-1");
    store.set(deviceLocationNavigationRevisionAtom, 4);

    setMapTilt(store.get, store.set, 35);

    expect(store.get(hoveredAssetIdAtom)).toBeNull();
    expect(store.get(hoveredCustomerPointIdAtom)).toBeNull();
    expect(store.get(hoveredZoneIdAtom)).toBeNull();
    expect(store.get(hoveredLoggerIdAtom)).toBeNull();
    expect(store.get(deviceLocationNavigationRevisionAtom)).toBe(5);
  });

  it.each([false, true])(
    "ignores tilt while 3D is off and flattening is %s",
    (flattening) => {
      const store = createStore();
      const pending = flattening ? { pitch: 0, duration: 450 } : null;
      store.set(map3DFlatteningAtom, flattening);
      store.set(mapPitchRequestAtom, pending);
      store.set(hoveredAssetIdAtom, IDS.JUNCTION);
      store.set(deviceLocationNavigationRevisionAtom, 4);

      setMapTilt(store.get, store.set, 60);

      expect(store.get(isMap3DAtom)).toBe(false);
      expect(store.get(mapPitchRequestAtom)).toBe(pending);
      expect(store.get(hoveredAssetIdAtom)).toBe(IDS.JUNCTION);
      expect(store.get(deviceLocationNavigationRevisionAtom)).toBe(4);
    },
  );

  it.each([NaN, Infinity, -Infinity])("ignores invalid pitch %s", (pitch) => {
    const store = createStore();
    store.set(isMap3DAtom, true);
    const pending = { pitch: 40, duration: 0 };
    store.set(mapPitchRequestAtom, pending);
    store.set(hoveredAssetIdAtom, IDS.JUNCTION);
    store.set(deviceLocationNavigationRevisionAtom, 4);

    setMapTilt(store.get, store.set, pitch);

    expect(store.get(mapPitchRequestAtom)).toBe(pending);
    expect(store.get(hoveredAssetIdAtom)).toBe(IDS.JUNCTION);
    expect(store.get(deviceLocationNavigationRevisionAtom)).toBe(4);
  });
});
