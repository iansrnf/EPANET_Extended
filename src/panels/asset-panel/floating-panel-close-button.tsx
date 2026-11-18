import { useContext } from "react";
import { useDismissAssetPanel } from "src/commands/dismiss-asset-panel";
import { useTranslate } from "src/hooks/use-translate";
import { CloseIcon } from "src/icons";
import { MapContext } from "src/map";
import { PanelDockContext } from "../panel-dock-context";

export const FloatingPanelCloseButton = ({ label }: { label: string }) => {
  const dock = useContext(PanelDockContext);
  const map = useContext(MapContext);
  const dismissAssetPanel = useDismissAssetPanel();
  const translate = useTranslate();

  if (dock !== "floating") return null;

  return (
    <button
      type="button"
      aria-label={translate("panels.closePanel", label)}
      onClick={() => {
        dismissAssetPanel();
        map?.map.getCanvas().focus({ preventScroll: true });
      }}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-subtle hover:bg-base-hover hover:text-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <CloseIcon />
    </button>
  );
};
