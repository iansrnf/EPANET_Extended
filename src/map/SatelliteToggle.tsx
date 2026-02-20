import { useAtomValue } from "jotai";
import { useMemo } from "react";
import clsx from "clsx";
import { useToggleSatellite } from "src/commands/toggle-satellite";
import { satelliteLimitedZoom } from "src/commands/toggle-satellite";
import { useUserTracking } from "src/infra/user-tracking";
import { basemaps } from "src/map/basemaps";
import { useLayerConfigState } from "src/map/layer-config";
import { newFeatureId } from "src/lib/id";
import { layerConfigAtom } from "src/state/jotai";
import { offlineAtom } from "src/state/offline";
import { maybeDeleteOldBasemap } from "src/components/layers/popover";
import { useAuth } from "src/auth";
import { ILayerConfig } from "src/types";

export const SatelliteToggle = () => {
  const toggleSatellite = useToggleSatellite();
  const layerConfigs = useAtomValue(layerConfigAtom);
  const userTracking = useUserTracking();
  const isOffline = useAtomValue(offlineAtom);
  const { applyChanges } = useLayerConfigState();
  const { isSignedIn } = useAuth();

  const providerOptions = [
    { value: "MAPBOX", label: "MapBox" },
    { value: "OPEN_STREET_MAP", label: "OpenStreetMap" },
  ] as const;

  const currentBaseMap = useMemo(() => {
    return [...layerConfigs.values()].find((layer) => layer.isBasemap) ?? null;
  }, [layerConfigs]);

  const buttonThumbnailClass = useMemo(() => {
    if (isOffline || !currentBaseMap) return null;
    if (currentBaseMap.name === basemaps.monochrome.name) {
      return basemaps.satellite.thumbnailClass;
    }
    return basemaps.monochrome.thumbnailClass;
  }, [currentBaseMap, isOffline]);

  if (!buttonThumbnailClass || !currentBaseMap) return null;

  const applyBasemap = (
    newBaseMap: (typeof basemaps)[keyof typeof basemaps],
  ) => {
    const items = [...layerConfigs.values()];
    const { deleteLayerConfigs, oldAt, oldBasemapLayer } =
      maybeDeleteOldBasemap(items);

    const newLayerConfig: ILayerConfig = {
      ...newBaseMap,
      visibility: true,
      tms: false,
      opacity: newBaseMap.opacity,
      at: oldAt || "a0",
      id: newFeatureId(),
      labelVisibility: oldBasemapLayer ? oldBasemapLayer.labelVisibility : true,
      sourceMaxZoom:
        !isSignedIn && newBaseMap.name === basemaps.satellite.name
          ? { "mapbox-satellite": satelliteLimitedZoom }
          : {},
    };

    userTracking.capture({
      name: "baseMap.changed",
      newBasemap: newBaseMap.name,
      oldBasemap: oldBasemapLayer ? oldBasemapLayer.name : "",
      source: "dropdown",
    });

    applyChanges({
      deleteLayerConfigs,
      putLayerConfigs: [newLayerConfig],
    });
  };

  return (
    <div className="absolute bottom-[2rem] left-3 flex flex-col gap-2">
      <div
        className={clsx(
          "w-16 h-16 sm:w-16 sm:h-16",
          "bg-white rounded border-white border-2 shadow-md cursor-pointer",
          buttonThumbnailClass,
        )}
        onClick={() => {
          userTracking.capture({
            name: "satelliteView.toggled",
            source: "button",
          });
          toggleSatellite();
        }}
      />
      <select
        className="w-32 rounded border border-gray-300 bg-white px-2 py-1 text-xs shadow-md"
        value={currentBaseMap.type === "MAPBOX" ? "MAPBOX" : "OPEN_STREET_MAP"}
        onChange={(e) => {
          const provider = e.target.value as "MAPBOX" | "OPEN_STREET_MAP";
          const currentMapboxBasemap =
            currentBaseMap.type === "MAPBOX"
              ? (Object.values(basemaps).find(
                  (layer) =>
                    layer.type === "MAPBOX" &&
                    layer.name === currentBaseMap.name,
                ) ?? basemaps.monochrome)
              : basemaps.monochrome;
          const newBaseMap =
            provider === "OPEN_STREET_MAP"
              ? basemaps.openStreetMap
              : currentMapboxBasemap;
          if (!newBaseMap) return;
          applyBasemap(newBaseMap);
        }}
      >
        {providerOptions.map((provider) => (
          <option key={provider.value} value={provider.value}>
            {provider.label}
          </option>
        ))}
      </select>
    </div>
  );
};
