import type { Getter, Setter } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback } from "react";
import { deviceLocationNavigationRevisionAtom } from "src/state/device-location";
import { clearMapHoverAtom } from "src/state/map-hover";
import { showGridAtom } from "src/state/map-projection";
import {
  MAX_MAP_PITCH,
  isMap3DAtom,
  map3DFlatteningAtom,
  mapPitchRequestAtom,
} from "src/state/map-view";

export const orbitMap = (
  get: Getter,
  set: Setter,
  { bearing, pitch }: { bearing: number; pitch: number },
) => {
  if (
    get(showGridAtom) ||
    get(map3DFlatteningAtom) ||
    !Number.isFinite(bearing) ||
    !Number.isFinite(pitch)
  )
    return;

  set(clearMapHoverAtom);
  set(deviceLocationNavigationRevisionAtom, (revision) => revision + 1);
  set(mapPitchRequestAtom, {
    bearing: ((((bearing + 180) % 360) + 360) % 360) - 180,
    pitch: get(isMap3DAtom) ? Math.max(0, Math.min(MAX_MAP_PITCH, pitch)) : 0,
    duration: 0,
  });
};

export const useOrbitMap = () => useAtomCallback(useCallback(orbitMap, []));
