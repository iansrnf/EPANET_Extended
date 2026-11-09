import { useId } from "react";
import { useAtomValue } from "jotai";
import clsx from "clsx";
import { useSelectBasemap } from "src/commands/select-basemap";
import { useTranslate } from "src/hooks/use-translate";
import { useUserTracking } from "src/infra/user-tracking";
import { CheckIcon, ChevronDownIcon, GlobeIcon } from "src/icons";
import {
  basemaps,
  isBasemapConfigured,
  type LayerConfigTemplate,
} from "src/map/basemaps";
import {
  basemapProviders,
  getBasemapMode,
  getBasemapProvider,
  getProviderBasemap,
} from "src/map/basemap-providers";
import { BasemapModePreview } from "src/map/basemap-mode-preview";
import { layerConfigAtom } from "src/state/map";
import { showGridAtom } from "src/state/map-projection";
import { offlineAtom } from "src/state/offline";
import { isPlayingAtom } from "src/state/simulation-playback";

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
    <details
      aria-label={translate("basemap")}
      className="group/basemap absolute bottom-8 left-3 z-20 max-h-[calc(100%-3rem)] w-64 max-w-[calc(100%-4rem)] overflow-x-hidden overflow-y-auto rounded-2xl border bg-popover text-default shadow-xl"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <summary className="sticky top-0 z-20 flex min-h-14 cursor-pointer list-none items-center gap-3 bg-popover px-3 py-2.5 transition-colors hover:bg-base-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-tint text-accent">
          <GlobeIcon size="lg" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-size-small text-subtle">
            {translate("mapProvider")}
          </span>
          <span
            className="block truncate text-size-base font-semibold"
            title={selectionLabel}
          >
            {selectionLabel}
          </span>
        </span>
        <ChevronDownIcon
          size="md"
          aria-hidden="true"
          className="shrink-0 text-subtle transition-transform group-open/basemap:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="border-t bg-popover p-3">
        <label
          htmlFor={selectId}
          className="mb-1.5 block text-size-small font-medium text-subtle"
        >
          {translate("mapProvider")}
        </label>
        <div className="relative">
          <GlobeIcon
            size="lg"
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-accent"
          />
          <select
            id={selectId}
            value={providerId ?? ""}
            aria-describedby={
              !isGoogleConfigured ? `${selectId}-setup` : undefined
            }
            className="block min-h-11 w-full cursor-pointer appearance-none rounded-xl border bg-base py-2 pl-10 pr-9 text-size-base font-semibold text-default transition-colors hover:bg-base-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onChange={(event) => {
              const provider = basemapProviders.find(
                (provider) => provider.id === event.currentTarget.value,
              );
              if (!provider || provider.id === providerId) return;
              changeBasemap(getProviderBasemap(provider.id, currentBasemap));
            }}
          >
            {!selectedProvider && (
              <option value="" disabled>
                {currentBasemap?.name ||
                  translate("basemapControls.chooseProvider")}
              </option>
            )}
            {basemapProviders.map((provider) => {
              const isConfigured = isBasemapConfigured(
                provider.modes[0].basemap,
              );
              return (
                <option
                  key={provider.id}
                  value={provider.id}
                  disabled={!isConfigured}
                >
                  {isConfigured
                    ? provider.name
                    : `${provider.name}: ${translate("googleMaps.keyRequired")}`}
                </option>
              );
            })}
          </select>
          <ChevronDownIcon
            size="md"
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle"
          />
        </div>
      </div>
      {selectedProvider ? (
        <fieldset className="min-w-0 border-t p-3">
          <legend className="sr-only">
            {translate("basemapControls.mapMode")}
          </legend>
          <div
            aria-hidden="true"
            className="mb-2 flex items-center justify-between text-size-small font-medium text-subtle"
          >
            <span>{translate("basemapControls.mapMode")}</span>
            <span className="rounded-full bg-base-hover px-2 py-0.5 tabular-nums">
              {selectedProvider.modes.length}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {selectedProvider.modes.map((mode) => {
              const isSelected = mode.id === selectedMode;
              return (
                <label key={mode.id} className="group relative cursor-pointer">
                  <input
                    type="radio"
                    name={`${selectId}-mode`}
                    value={mode.id}
                    checked={isSelected}
                    className="peer sr-only"
                    onChange={() => changeBasemap(mode.basemap)}
                  />
                  <span
                    className={clsx(
                      "block overflow-hidden rounded-xl border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
                      isSelected
                        ? "border-accent bg-accent-tint"
                        : "bg-base group-hover:border-strong group-hover:bg-base-hover",
                    )}
                  >
                    <BasemapModePreview mode={mode.id} />
                    <span className="flex min-h-9 items-center justify-between gap-1 px-2 text-size-small font-medium">
                      <span>{translate(mode.labelKey)}</span>
                      {isSelected && (
                        <CheckIcon
                          size="sm"
                          aria-hidden="true"
                          className="shrink-0 text-accent"
                        />
                      )}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : (
        <p className="border-t px-3 py-3 text-size-small text-subtle">
          {translate("basemapControls.chooseProvider")}
        </p>
      )}
      {!isGoogleConfigured && (
        <p
          id={`${selectId}-setup`}
          className="border-t px-3 py-2 text-size-small text-subtle"
        >
          {translate("googleMaps.configureKey")}
        </p>
      )}
    </details>
  );
};
