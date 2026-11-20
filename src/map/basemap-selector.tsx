import { useId } from "react";
import { useAtomValue } from "jotai";
import clsx from "clsx";
import { useSelectBasemap } from "src/commands/select-basemap";
import { useTranslate } from "src/hooks/use-translate";
import { useUserTracking } from "src/infra/user-tracking";
import { CheckIcon, GlobeIcon, RoadmapIcon } from "src/icons";
import {
  basemaps,
  isBasemapConfigured,
  type LayerConfigTemplate,
} from "src/map/basemaps";
import {
  basemapProviders,
  getBasemapMode,
  getBasemapProvider,
} from "src/map/basemap-providers";
import { layerConfigAtom } from "src/state/map";
import { showGridAtom } from "src/state/map-projection";
import { offlineAtom } from "src/state/offline";
import { isPlayingAtom } from "src/state/simulation-playback";
import { MapControlMenu } from "./map-control-menu";

export const BasemapSelector = () => {
  const selectId = useId();
  const translate = useTranslate();
  const selectBasemap = useSelectBasemap();
  const userTracking = useUserTracking();
  const layerConfigs = useAtomValue(layerConfigAtom);
  const isGridOn = useAtomValue(showGridAtom);
  const isOffline = useAtomValue(offlineAtom);
  const isPlaying = useAtomValue(isPlayingAtom);
  const layers = [...layerConfigs.values()];
  const currentBasemap =
    layers.find((layer) => layer.isBasemap) ??
    layers.find((layer) => layer.type === "MAPBOX");
  const providerId = getBasemapProvider(currentBasemap);
  const selectedMode = getBasemapMode(currentBasemap);
  const selectedProvider = basemapProviders.find(
    (provider) => provider.id === providerId,
  );
  const selectedModeDefinition = selectedProvider?.modes.find(
    (mode) => mode.id === selectedMode,
  );
  const selectionLabel =
    selectedProvider && selectedModeDefinition
      ? `${selectedProvider.name} · ${translate(selectedModeDefinition.labelKey)}`
      : currentBasemap?.name || translate("basemapControls.chooseProvider");
  const isGoogleConfigured = isBasemapConfigured(basemaps.googleRoadmap);

  const changeBasemap = (basemap: LayerConfigTemplate) => {
    if (!selectBasemap(basemap)) return;
    userTracking.capture({
      name: "baseMap.changed",
      newBasemap: basemap.name,
      oldBasemap: currentBasemap?.name ?? "",
      source: "dropdown",
    });
  };

  if (isGridOn || isOffline || isPlaying) return null;

  return (
    <div className="absolute bottom-[calc(var(--simulation-controls-height,0px)+1.25rem)] left-2 z-20">
      <MapControlMenu
        label={translate("mapProvider")}
        tooltip={`${translate("mapProvider")}: ${selectionLabel}`}
        icon={<GlobeIcon size="lg" aria-hidden="true" />}
      >
        <div className="space-y-[10.2px]">
          {basemapProviders.map((provider) => (
            <fieldset key={provider.id} className="min-w-0">
              <legend className="mb-[3.4px] px-[6.8px] font-medium text-subtle">
                {provider.name}
              </legend>
              <div className="space-y-[1.7px]">
                {provider.modes.map((mode) => {
                  const isSelected =
                    provider.id === providerId && mode.id === selectedMode;
                  const isConfigured = isBasemapConfigured(mode.basemap);
                  return (
                    <label key={mode.id} className="group relative block">
                      <input
                        type="radio"
                        name={`${selectId}-mode`}
                        value={`${provider.id}-${mode.id}`}
                        checked={isSelected}
                        disabled={!isConfigured}
                        aria-label={`${provider.name}: ${translate(mode.labelKey)}`}
                        aria-describedby={
                          !isConfigured ? `${selectId}-setup` : undefined
                        }
                        className="peer sr-only"
                        onChange={() => changeBasemap(mode.basemap)}
                      />
                      <span
                        className={clsx(
                          "flex min-h-[37.4px] items-center gap-[6.8px] rounded-[6.8px] px-[6.8px] transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-accent pointer-coarse:min-h-11",
                          isConfigured
                            ? "cursor-pointer group-hover:bg-base-hover"
                            : "cursor-not-allowed text-disabled",
                          isSelected && "bg-accent-tint text-accent",
                        )}
                      >
                        <RoadmapIcon
                          size="md"
                          aria-hidden="true"
                          className="shrink-0"
                        />
                        <span className="min-w-0 flex-1">
                          {translate(mode.labelKey)}
                        </span>
                        {isSelected && (
                          <CheckIcon
                            size="sm"
                            aria-hidden="true"
                            className="shrink-0"
                          />
                        )}
                        {!isConfigured && (
                          <span className="text-size-small">
                            {translate("googleMaps.keyRequired")}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
        {!isGoogleConfigured && (
          <p
            id={`${selectId}-setup`}
            className="mt-[10.2px] border-t pt-[6.8px] text-subtle [overflow-wrap:anywhere]"
          >
            {translate("googleMaps.configureKey")}
          </p>
        )}
      </MapControlMenu>
    </div>
  );
};
