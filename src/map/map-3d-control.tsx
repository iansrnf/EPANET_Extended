import { useAtomValue } from "jotai";
import { Tooltip } from "@epanet-js/ui-kit";
import { useMediaQuery } from "react-responsive";
import { useId } from "react";
import clsx from "clsx";
import { useToggleMap3D } from "src/commands/toggle-map-3d";
import { useSetMapTilt } from "src/commands/set-map-tilt";
import { useTranslate } from "src/hooks/use-translate";
import {
  MAX_MAP_PITCH,
  currentMapPitchAtom,
  isMap3DAtom,
  map3DBusyAtom,
  mapPitchRequestAtom,
} from "src/state/map-view";

export const Map3DControl = ({ mapReady }: { mapReady: boolean }) => {
  const translate = useTranslate();
  const enabled = useAtomValue(isMap3DAtom);
  const busy = useAtomValue(map3DBusyAtom);
  const pitch = useAtomValue(currentMapPitchAtom);
  const pitchRequest = useAtomValue(mapPitchRequestAtom);
  const toggle = useToggleMap3D();
  const setTilt = useSetMapTilt();
  const tiltId = useId();
  const tilt = Math.round(pitchRequest?.pitch ?? pitch);
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
          content={translate(
            enabled ? "mapView.returnTo2D" : "mapView.enable3D",
          )}
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
      {enabled && (
        <div className="map-tilt-controls map-overlay-surface absolute bottom-0 right-[calc(100%+0.5rem)] w-56 max-w-[calc(100vw-4rem)] rounded-md border p-3 text-default shadow-lg">
          <div className="flex items-center justify-between text-size-small">
            <label htmlFor={tiltId} className="font-medium">
              {translate("mapView.tilt")}
            </label>
            <span aria-hidden="true" className="tabular-nums">
              {translate("mapView.tiltDegrees", String(tilt))}
            </span>
          </div>
          <input
            id={tiltId}
            type="range"
            min={0}
            max={MAX_MAP_PITCH}
            step={1}
            value={tilt}
            disabled={!mapReady}
            aria-valuetext={translate("mapView.tiltDegrees", String(tilt))}
            aria-describedby={`${tiltId}-help`}
            onChange={(event) => {
              const nextPitch = Number(event.currentTarget.value);
              void setTilt(nextPitch);
            }}
            className="mt-1 h-7 w-full cursor-pointer accent-accent focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
          />
          <p id={`${tiltId}-help`} className="text-size-small text-subtle">
            {translate("mapView.tiltHint")}
          </p>
        </div>
      )}
    </div>
  );
};
