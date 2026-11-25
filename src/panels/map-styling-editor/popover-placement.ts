import { createContext, useContext } from "react";
import { useSideTowardMap } from "src/panels/panel-dock-context";

const offsetToLeaveThePanel = { left: 94, right: 2, top: 2 } as const;

export const MapStylingPopoverContext = createContext<
  | {
      side: "left" | "right" | "top";
      sideOffset: number;
      contentClassName: string;
    }
  | undefined
>(undefined);

export const useOutsidePanelPlacement = () => {
  const side = useSideTowardMap();
  const override = useContext(MapStylingPopoverContext);
  if (override) {
    return { side: override.side, sideOffset: override.sideOffset };
  }
  return { side, sideOffset: offsetToLeaveThePanel[side] };
};

export const useMapStylingPopoverClassName = () =>
  useContext(MapStylingPopoverContext)?.contentClassName;

export const useMapStylingPopoverProps = () => {
  const override = useContext(MapStylingPopoverContext);
  return override
    ? {
        side: override.side,
        sideOffset: override.sideOffset,
        className: override.contentClassName,
      }
    : {};
};
