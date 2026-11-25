import { useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { Tooltip } from "@epanet-js/ui-kit";
import clsx from "clsx";
import { useLocateDevice } from "src/commands/locate-device";
import { useTranslate } from "src/hooks/use-translate";
import { CloseIcon, LocateIcon, RefreshIcon } from "src/icons";
import {
  deviceLocationErrorAtom,
  deviceLocationStatusAtom,
} from "src/state/device-location";

export const DeviceLocationControl = ({ mapReady }: { mapReady: boolean }) => {
  const translate = useTranslate();
  const locate = useLocateDevice();
  const status = useAtomValue(deviceLocationStatusAtom);
  const error = useAtomValue(deviceLocationErrorAtom);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isLocating = status === "locating";
  const label = translate("deviceLocation.goTo");

  useEffect(() => {
    if (mapReady) void locate({ initial: true });
  }, [mapReady, locate]);

  const requestLocation = () => {
    if (isLocating || !mapReady) return;
    setErrorDismissed(false);
    buttonRef.current?.focus();
    void locate();
  };

  return (
    <div
      className="map-location-control map-overlay-theme absolute bottom-[calc(var(--simulation-controls-height,0px)+2rem)] right-2 z-20 sm:bottom-[calc(var(--simulation-controls-height,0px)+4*var(--map-control-target-size)+5rem)]"
      onKeyDown={(event) => event.stopPropagation()}
      onKeyPress={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div className="mapboxgl-ctrl-group">
        <Tooltip
          content={label}
          side="left"
          sideOffset={8}
          zIndex={50}
          className="map-overlay-theme map-overlay-surface map-overlay-tooltip"
        >
          <button
            ref={buttonRef}
            type="button"
            aria-label={label}
            aria-busy={isLocating}
            aria-disabled={isLocating || !mapReady}
            className={clsx(
              "flex h-[var(--map-control-target-size)] w-[var(--map-control-target-size)] items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              status === "located" ? "text-accent" : "text-default",
              isLocating && "cursor-wait",
            )}
            onClick={requestLocation}
          >
            <span className="flex h-full w-full items-center justify-center [&_svg]:h-[var(--map-control-icon-size)] [&_svg]:w-[var(--map-control-icon-size)]">
              {isLocating ? (
                <RefreshIcon
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : (
                <LocateIcon aria-hidden="true" />
              )}
            </span>
          </button>
        </Tooltip>
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {isLocating
          ? translate("deviceLocation.locating")
          : status === "located"
            ? translate("deviceLocation.located")
            : ""}
      </div>
      {isLocating && (
        <p
          aria-hidden="true"
          className="map-overlay-surface map-overlay-popover pointer-events-none absolute right-[calc(var(--map-control-target-size)+8px)] bottom-0 flex min-h-11 w-max max-w-[calc(100vw-6rem)] items-center rounded-xl px-3 py-2 text-size-small text-default shadow-lg"
        >
          {translate("deviceLocation.locating")}
        </p>
      )}
      {status === "error" && error && !errorDismissed && (
        <div
          role="alert"
          className="map-overlay-surface map-overlay-popover absolute right-[calc(var(--map-control-target-size)+8px)] bottom-0 w-72 max-w-[calc(100vw-6rem)] rounded-xl p-3 text-size-small text-default shadow-lg"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="py-2 font-semibold">
              {translate("deviceLocation.failed")}
            </p>
            <button
              type="button"
              aria-label={translate("deviceLocation.dismiss")}
              className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-subtle hover:bg-base-hover focus-visible:outline-2 focus-visible:outline-accent"
              onClick={() => {
                setErrorDismissed(true);
                buttonRef.current?.focus();
              }}
            >
              <CloseIcon size="md" aria-hidden="true" />
            </button>
          </div>
          <p className="text-subtle">
            {translate(`deviceLocation.errors.${error}`)}
          </p>
          <button
            type="button"
            className="mt-3 min-h-11 rounded-lg border px-3 font-medium hover:bg-base-hover focus-visible:outline-2 focus-visible:outline-accent"
            onClick={requestLocation}
          >
            {translate("deviceLocation.retry")}
          </button>
        </div>
      )}
    </div>
  );
};
