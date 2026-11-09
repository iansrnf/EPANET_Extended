import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { generateKeyBetween } from "fractional-indexing";
import { notify } from "src/components/notifications";
import { useTranslate } from "src/hooks/use-translate";
import { newFeatureId } from "src/lib/id";
import { isBasemapConfigured, LayerConfigTemplate } from "src/map/basemaps";
import {
  maybeDeleteOldMapboxLayer,
  useLayerConfigState,
} from "src/map/layer-config";
import { layerConfigAtom } from "src/state/map";
import { ILayerConfig } from "src/types";

export const useSelectBasemap = () => {
  const layerConfigs = useAtomValue(layerConfigAtom);
  const { applyChanges } = useLayerConfigState();
  const translate = useTranslate();

  return useCallback(
    (basemap: LayerConfigTemplate) => {
      if (!isBasemapConfigured(basemap)) {
        notify({
          variant: "warning",
          title: translate("googleMaps.keyRequired"),
          description: translate("googleMaps.configureKey"),
          id: "google-maps-key-required",
        });
        return false;
      }

      const items = [...layerConfigs.values()];
      const { deleteLayerConfigs, oldAt, oldMapboxLayer } =
        maybeDeleteOldMapboxLayer(items);
      const newLayer: ILayerConfig = {
        ...basemap,
        id: newFeatureId(),
        at: oldAt || generateKeyBetween(items.at(-1)?.at || null, null),
        visibility: true,
        labelVisibility: oldMapboxLayer?.labelVisibility ?? true,
        tms: false,
      };

      applyChanges({ deleteLayerConfigs, putLayerConfigs: [newLayer] });
      return true;
    },
    [layerConfigs, applyChanges, translate],
  );
};
