import { useCallback } from "react";
import { useAtomCallback } from "jotai/utils";
import type { Map as MapboxMap, LngLatBoundsLike } from "mapbox-gl";
import { assetsDerivedAtom } from "src/state/derived-branch-state";
import { isBBoxEmpty } from "@epanet-js/geometry";
import { useUserTracking } from "src/infra/user-tracking";
import { loggersAtom } from "src/state/loggers";
import { getProjectExtent } from "src/lib/project-extent";

export function useFitToExtent() {
  const userTracking = useUserTracking();

  return useAtomCallback(
    useCallback(
      (get, _set, map: MapboxMap) => {
        const assets = get(assetsDerivedAtom);

        const extent = getProjectExtent(assets, get(loggersAtom)).extract();

        if (!extent) return;

        userTracking.capture({ name: "fitMapToNetworkExtent.clicked" });

        map.fitBounds(extent as LngLatBoundsLike, {
          padding: 100,
          animate: true,
          maxZoom: isBBoxEmpty(extent) ? 18 : Infinity,
        });
      },
      [userTracking],
    ),
  );
}
