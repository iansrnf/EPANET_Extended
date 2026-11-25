import { useTranslate } from "src/hooks/use-translate";
import { SlidersHorizontalIcon } from "src/icons";
import { MapStylingEditor } from "src/panels/map-styling-editor";
import { MapStylingPopoverContext } from "src/panels/map-styling-editor/popover-placement";
import { MapControlMenu } from "./map-control-menu";

const popoverPlacement = {
  side: "right",
  sideOffset: 6,
  contentClassName:
    "map-overlay-theme map-overlay-surface map-overlay-popover z-40",
} as const;

export const MapStylingControl = () => {
  const translate = useTranslate();

  return (
    <div className="map-control-styling absolute bottom-[calc(var(--simulation-controls-height,0px)+2.25rem+4*var(--map-control-target-size))] left-2 z-20">
      <MapControlMenu
        label={translate("mapStyling.title")}
        icon={<SlidersHorizontalIcon size="lg" aria-hidden="true" />}
        size="wide"
        closeLabel={translate("mapStyling.close")}
      >
        <MapStylingPopoverContext.Provider value={popoverPlacement}>
          <MapStylingEditor />
        </MapStylingPopoverContext.Provider>
      </MapControlMenu>
    </div>
  );
};
