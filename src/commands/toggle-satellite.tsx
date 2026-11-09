import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { satelliteBasemapFor } from "src/map/basemaps";
import { maybeDeleteOldMapboxLayer } from "src/map/layer-config";
import { layerConfigAtom } from "src/state/map";
import { useSelectBasemap } from "src/commands/select-basemap";

export const toggleSatelliteShorcut = "b";

export const useToggleSatellite = () => {
  const layerConfigs = useAtomValue(layerConfigAtom);
  const selectBasemap = useSelectBasemap();

  const toggleSatellite = useCallback(() => {
    const items = [...layerConfigs.values()];

    const { oldMapboxLayer } = maybeDeleteOldMapboxLayer(items);
    selectBasemap(satelliteBasemapFor(oldMapboxLayer));
  }, [layerConfigs, selectBasemap]);

  return toggleSatellite;
};
