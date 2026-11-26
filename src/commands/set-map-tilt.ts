import type { Getter, Setter } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback } from "react";
import { deviceLocationNavigationRevisionAtom } from "src/state/device-location";
import { clearMapHoverAtom } from "src/state/map-hover";
import {
  MAX_MAP_PITCH,
  isMap3DAtom,
  mapPitchRequestAtom,
} from "src/state/map-view";

export const setMapTilt = (get: Getter, set: Setter, pitch: number) => {
  if (!get(isMap3DAtom) || !Number.isFinite(pitch)) return;

  set(clearMapHoverAtom);
  set(deviceLocationNavigationRevisionAtom, (revision) => revision + 1);
  set(mapPitchRequestAtom, {
    pitch: Math.max(0, Math.min(MAX_MAP_PITCH, pitch)),
    duration: 0,
  });
};

export const useSetMapTilt = () => useAtomCallback(useCallback(setMapTilt, []));
