import { useAtomValue } from "jotai";
import clsx from "clsx";
import { dialogAtom } from "src/state/dialog";
import Modes, { DRAWING_MODE_OPTIONS } from "./modes";
import { MapToolbarPipeDrawing } from "./map-toolbar-pipe-drawing";
import { Mode, modeAtom } from "src/state/mode";
import { useBreakpoint } from "src/hooks/use-breakpoint";
import type { MapToolbarSpace } from "src/components/map-workspace-identity";
import { useId, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Tooltip } from "@epanet-js/ui-kit";
import { useTranslate } from "src/hooks/use-translate";
import { CloseIcon, SettingsIcon } from "src/icons";

export const MapToolbar = ({
  readonly = false,
  dockingSpace,
  compactHeight = false,
}: {
  readonly?: boolean;
  dockingSpace?: MapToolbarSpace | null;
  compactHeight?: boolean;
}) => {
  const dialogState = useAtomValue(dialogAtom);
  const { mode } = useAtomValue(modeAtom);
  const isLgOrLarger = useBreakpoint("lg");
  const targetSize = dockingSpace?.targetSize ?? 28;
  const isPipe = mode === Mode.DRAW_PIPE;
  const extraWidth = isPipe ? targetSize + 9 : 0;
  const compactWidth = 4 * targetSize + 10 + extraWidth;
  const docked = !!dockingSpace && dockingSpace.width >= compactWidth;
  const availableWidth = docked
    ? dockingSpace.width
    : (dockingSpace?.mapWidth ?? 0) -
      (compactHeight ? 16 + 5 * targetSize : 32 + 2 * targetSize);
  const fullWidth =
    (3 + DRAWING_MODE_OPTIONS.length) * targetSize + 10 + extraWidth;
  const compact = !isLgOrLarger || availableWidth < fullWidth;

  if (dialogState) return null;

  return (
    <div
      className="map-drawing-toolbar absolute inset-x-0 z-20 flex justify-center pointer-events-none"
      data-docked={docked || undefined}
      style={
        docked
          ? {
              left: dockingSpace.left,
              width: dockingSpace.width,
              right: "auto",
              top: dockingSpace.top,
            }
          : undefined
      }
    >
      <div
        className={clsx(
          "map-overlay-theme map-overlay-surface pointer-events-auto flex flex-col",
          "map-drawing-toolbar-surface max-w-[calc(100%-1rem)] rounded-sm border shadow-md",
        )}
      >
        <div className="placemark-scrollbar flex items-center overflow-x-auto px-1 py-0.5">
          <Modes disabled={readonly} compact={compact} />
          {isPipe && <PipeDrawingOptions />}
        </div>
      </div>
    </div>
  );
};

const PipeDrawingOptions = () => {
  const translate = useTranslate();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const outsideInteractionRef = useRef(false);
  const label = `${translate("pipe")}: ${translate("diameter")} / ${translate("roughness")}`;

  return (
    <Popover.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          const activeElement = document.activeElement;
          if (
            activeElement instanceof HTMLInputElement &&
            contentRef.current?.contains(activeElement)
          ) {
            activeElement.blur();
          }
        }
        setOpen(nextOpen);
      }}
      modal={false}
    >
      <div className="ml-1 shrink-0 border-l pl-1">
        <Tooltip
          content={label}
          side="bottom"
          zIndex={50}
          className="map-overlay-theme map-overlay-surface map-overlay-tooltip pointer-events-none"
        >
          <Popover.Trigger asChild>
            <button
              type="button"
              aria-label={label}
              className="flex h-[var(--map-control-target-size)] w-[var(--map-control-target-size)] items-center justify-center rounded-sm text-default hover:bg-base-hover aria-expanded:bg-accent aria-expanded:text-default-inverse focus-visible:outline-2 focus-visible:outline-accent [&_svg]:h-[var(--map-control-icon-size)] [&_svg]:w-[var(--map-control-icon-size)]"
            >
              <SettingsIcon aria-hidden="true" />
            </button>
          </Popover.Trigger>
        </Tooltip>
      </div>
      <Popover.Portal>
        <Popover.Content
          ref={contentRef}
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={8}
          aria-labelledby={titleId}
          className="map-overlay-theme map-overlay-surface map-overlay-popover placemark-scrollbar z-40 w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border shadow-xl outline-none"
          style={{
            maxHeight:
              "min(calc(100dvh - 1rem), var(--radix-popover-content-available-height))",
          }}
          onEscapeKeyDown={(event) => {
            if (
              document.activeElement instanceof HTMLInputElement &&
              contentRef.current?.contains(document.activeElement)
            ) {
              event.preventDefault();
            }
          }}
          onInteractOutside={() => {
            outsideInteractionRef.current = true;
          }}
          onCloseAutoFocus={(event) => {
            if (outsideInteractionRef.current) event.preventDefault();
            outsideInteractionRef.current = false;
          }}
          onKeyDown={(event) => event.stopPropagation()}
          onKeyPress={(event) => event.stopPropagation()}
          onKeyUp={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <h2
              id={titleId}
              className="text-size-small font-semibold text-accent"
            >
              {translate("pipe")}
            </h2>
            <Popover.Close asChild>
              <button
                type="button"
                aria-label={translate("dialog.close")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm hover:bg-base-hover focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 pointer-coarse:w-11"
              >
                <CloseIcon aria-hidden="true" />
              </button>
            </Popover.Close>
          </div>
          <MapToolbarPipeDrawing compact />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
