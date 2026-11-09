import { Tooltip } from "@epanet-js/ui-kit";
import { menuItemLike } from "src/components/elements";
import { Thumbnail } from "./thumbnail";
import { isBasemapConfigured, LayerConfigTemplate } from "src/map/basemaps";
import { useTranslate } from "src/hooks/use-translate";

type T = LayerConfigTemplate;

export function DefaultLayerItem({
  mapboxLayer,
  onSelect,
}: {
  mapboxLayer: T;
  onSelect: (arg0: T) => void;
}) {
  const translate = useTranslate();
  const isConfigured = isBasemapConfigured(mapboxLayer);
  const providerName =
    mapboxLayer.type === "GOOGLE"
      ? mapboxLayer.name
      : `Mapbox ${mapboxLayer.name}`;
  const switchLabel = translate("switchMapProvider", providerName);

  return (
    <Tooltip
      content={
        <div className="space-y-1">
          <div className="px-1 text-size-xs">{switchLabel}</div>
          <Thumbnail mapboxLayer={mapboxLayer} />
        </div>
      }
      side="left"
      delayDuration={0}
      zIndex={30}
      className="p-1! bg-popover! rounded-md! shadow-md!"
    >
      <span
        className="block"
        tabIndex={isConfigured ? undefined : 0}
        title={
          isConfigured ? switchLabel : translate("googleMaps.configureKey")
        }
        aria-label={
          isConfigured
            ? undefined
            : `${mapboxLayer.name}: ${translate("googleMaps.keyRequired")}`
        }
      >
        <button
          type="button"
          disabled={!isConfigured}
          aria-label={
            isConfigured
              ? switchLabel
              : `${mapboxLayer.name}: ${translate("googleMaps.keyRequired")}`
          }
          onClick={() => {
            onSelect(mapboxLayer);
          }}
          className={
            menuItemLike({ variant: "default" }) +
            " w-full border disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed"
          }
        >
          {mapboxLayer.name || "Untitled"}
          {!isConfigured && (
            <span className="ml-2 text-size-xs text-subtle">
              {translate("googleMaps.keyRequired")}
            </span>
          )}
        </button>
      </span>
    </Tooltip>
  );
}
