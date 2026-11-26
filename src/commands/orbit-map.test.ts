import { createStore } from "jotai";
import { hoveredAssetIdAtom } from "src/state/asset-hover";
import { deviceLocationNavigationRevisionAtom } from "src/state/device-location";
import { gridPreviewAtom } from "src/state/map-projection";
import {
  isMap3DAtom,
  map3DFlatteningAtom,
  mapPitchRequestAtom,
} from "src/state/map-view";
import { orbitMap } from "./orbit-map";

describe("orbitMap", () => {
  it("rotates in 2D without authorizing tilt or terrain", () => {
    const store = createStore();
    orbitMap(store.get, store.set, { bearing: 190, pitch: 70 });
    expect(store.get(mapPitchRequestAtom)).toEqual({
      bearing: -170,
      pitch: 0,
      duration: 0,
    });
    expect(store.get(isMap3DAtom)).toBe(false);
  });

  it.each([
    { input: -10, expected: 0 },
    { input: 40, expected: 40 },
    { input: 90, expected: 75 },
  ])("clamps 3D pitch $input", ({ input, expected }) => {
    const store = createStore();
    store.set(isMap3DAtom, true);
    orbitMap(store.get, store.set, { bearing: -200, pitch: input });
    expect(store.get(mapPitchRequestAtom)).toEqual({
      bearing: 160,
      pitch: expected,
      duration: 0,
    });
    expect(store.get(isMap3DAtom)).toBe(true);
  });

  it("clears hover and cancels automatic navigation", () => {
    const IDS = { JUNCTION: 1 } as const;
    const store = createStore();
    store.set(hoveredAssetIdAtom, IDS.JUNCTION);
    store.set(deviceLocationNavigationRevisionAtom, 4);
    orbitMap(store.get, store.set, { bearing: 10, pitch: 0 });
    expect(store.get(hoveredAssetIdAtom)).toBeNull();
    expect(store.get(deviceLocationNavigationRevisionAtom)).toBe(5);
  });

  it.each([gridPreviewAtom, map3DFlatteningAtom])(
    "ignores camera input during grid display or 3D exit",
    (blockedAtom) => {
      const store = createStore();
      store.set(blockedAtom, true);
      const pending = { pitch: 0, duration: 450 };
      store.set(mapPitchRequestAtom, pending);
      orbitMap(store.get, store.set, { bearing: 10, pitch: 30 });
      expect(store.get(mapPitchRequestAtom)).toBe(pending);
    },
  );

  it.each([
    { bearing: NaN, pitch: 0 },
    { bearing: Infinity, pitch: 0 },
    { bearing: 0, pitch: NaN },
    { bearing: 0, pitch: -Infinity },
  ])("ignores nonfinite camera values", (camera) => {
    const store = createStore();
    orbitMap(store.get, store.set, camera);
    expect(store.get(mapPitchRequestAtom)).toBeNull();
  });
});
