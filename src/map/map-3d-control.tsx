import { useAtomValue } from "jotai";
import { Tooltip } from "@epanet-js/ui-kit";
import { useMediaQuery } from "react-responsive";
import clsx from "clsx";
import { useToggleMap3D } from "src/commands/toggle-map-3d";
import { useTranslate } from "src/hooks/use-translate";
import { isMap3DAtom, map3DBusyAtom } from "src/state/map-view";

export const Map3DControl = ({ mapReady }: { mapReady: boolean }) => {
  const translate = useTranslate();
  const enabled = useAtomValue(isMap3DAtom);
  const busy = useAtomValue(map3DBusyAtom);
  const toggle = useToggleMap3D();
  const reducedMotion = useMediaQuery({
    query: "(prefers-reduced-motion: reduce)",
  });

  return (
    <div
      className="map-3d-control map-overlay-theme absolute z-20"
      onKeyDown={(event) => event.stopPropagation()}
      onKeyPress={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Tooltip
        content={translate(enabled ? "mapView.returnTo2D" : "mapView.enable3D")}
        side="left"
        sideOffset={6}
        zIndex={50}
        className="map-overlay-theme map-overlay-surface map-overlay-tooltip pointer-events-none"
      >
        <button
          type="button"
          aria-label={translate("mapView.threeDLabel")}
          aria-pressed={enabled}
          aria-disabled={!mapReady || busy}
          aria-busy={busy}
          disabled={!mapReady}
          onClick={() => toggle({ reducedMotion })}
          className="group flex h-[var(--map-control-target-size)] w-[var(--map-control-target-size)] items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-accent aria-disabled:cursor-wait aria-disabled:opacity-50"
        >
          <span
            className={clsx(
              "flex h-[var(--map-control-face-size)] w-[var(--map-control-face-size)] items-center justify-center rounded-sm border text-[10px] font-bold leading-none shadow-lg transition-colors pointer-coarse:text-xs",
              enabled
                ? "border-accent bg-accent text-default-inverse"
                : "map-overlay-surface text-default group-hover:bg-base-hover group-focus-visible:bg-base-hover",
            )}
          >
            3D
          </span>
        </button>
      </Tooltip>
    </div>
  );
};
