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
  map3DBusyAtom,
  mapPitchRequestAtom,
  mapPitchTransitioningAtom,
} from "src/state/map-view";
import { toggleMap3D } from "./toggle-map-3d";

const IDS = { JUNCTION: 1, CUSTOMER: 2, ZONE: 3 };

describe("toggleMap3D", () => {
  it.each([
    { currentPitch: 0, targetPitch: 60 },
    { currentPitch: 1, targetPitch: 60 },
    { currentPitch: 45, targetPitch: 0 },
  ])(
    "toggles from pitch $currentPitch to $targetPitch",
    ({ currentPitch, targetPitch }) => {
      const store = createStore();
      store.set(currentMapPitchAtom, currentPitch);

      toggleMap3D(store.get, store.set);

      expect(store.get(mapPitchRequestAtom)).toEqual({
        pitch: targetPitch,
        duration: 450,
      });
      expect(store.get(currentMapPitchAtom)).toBe(currentPitch);
      expect(store.get(isMap3DAtom)).toBe(currentPitch > 1);
      expect(store.get(map3DBusyAtom)).toBe(true);
    },
  );

  it("uses an immediate camera change for reduced motion", () => {
    const store = createStore();

    toggleMap3D(store.get, store.set, { reducedMotion: true });

    expect(store.get(mapPitchRequestAtom)).toEqual({
      pitch: 60,
      duration: 0,
    });
  });

  it("clears stale map hover and cancels pending automatic navigation", () => {
    const store = createStore();
    store.set(hoveredAssetIdAtom, IDS.JUNCTION);
    store.set(hoveredCustomerPointIdAtom, IDS.CUSTOMER);
    store.set(hoveredZoneIdAtom, IDS.ZONE);
    store.set(hoveredLoggerIdAtom, "logger-1");
    store.set(deviceLocationNavigationRevisionAtom, 4);

    toggleMap3D(store.get, store.set);

    expect(store.get(hoveredAssetIdAtom)).toBeNull();
    expect(store.get(hoveredCustomerPointIdAtom)).toBeNull();
    expect(store.get(hoveredZoneIdAtom)).toBeNull();
    expect(store.get(hoveredLoggerIdAtom)).toBeNull();
    expect(store.get(deviceLocationNavigationRevisionAtom)).toBe(5);
  });

  it.each(["queued", "transitioning"])(
    "ignores repeat toggles while %s",
    (phase) => {
      const store = createStore();
      const pendingRequest = { pitch: 60, duration: 450 };
      if (phase === "queued") {
        store.set(mapPitchRequestAtom, pendingRequest);
      } else {
        store.set(mapPitchTransitioningAtom, true);
      }
      store.set(hoveredAssetIdAtom, IDS.JUNCTION);
      store.set(deviceLocationNavigationRevisionAtom, 4);

      toggleMap3D(store.get, store.set);

      expect(store.get(mapPitchRequestAtom)).toBe(
        phase === "queued" ? pendingRequest : null,
      );
      expect(store.get(hoveredAssetIdAtom)).toBe(IDS.JUNCTION);
      expect(store.get(deviceLocationNavigationRevisionAtom)).toBe(4);
    },
  );
});
