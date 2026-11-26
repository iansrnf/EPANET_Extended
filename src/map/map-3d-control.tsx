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
      <div className="mapboxgl-ctrl-group">
        <Tooltip
          content={
            <div className="max-w-56 space-y-1">
              <p>
                {translate(enabled ? "mapView.returnTo2D" : "mapView.enable3D")}
              </p>
              {enabled && <p>{translate("mapView.tiltHint")}</p>}
            </div>
          }
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
            className="flex h-[var(--map-control-target-size)] w-[var(--map-control-target-size)] items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-disabled:cursor-wait aria-disabled:opacity-50"
          >
            <span
              className={clsx(
                "flex h-full w-full items-center justify-center rounded-sm text-[10px] font-bold leading-none transition-colors pointer-coarse:text-xs",
                enabled ? "bg-accent text-default-inverse" : "text-default",
              )}
            >
              3D
            </span>
          </button>
        </Tooltip>
      </div>
    </div>
  );
};
