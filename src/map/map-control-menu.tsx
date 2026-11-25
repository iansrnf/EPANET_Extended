import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Tooltip } from "@epanet-js/ui-kit";
import { useMediaQuery } from "react-responsive";
import clsx from "clsx";
import { CloseIcon } from "src/icons";

const dragKeyboardCodes = new Set([
  "Space",
  "Enter",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Escape",
  "Tab",
]);

const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
  const handle =
    event.target instanceof Element
      ? event.target.closest("[data-map-drag-handle]")
      : null;
  if (
    handle &&
    dragKeyboardCodes.has(event.code) &&
    (event.defaultPrevented || handle.getAttribute("aria-pressed") === "true")
  ) {
    event.preventDefault();
    return;
  }
  event.stopPropagation();
};

const handleKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
  if (
    event.target instanceof Element &&
    event.target.closest("[data-map-drag-handle]") &&
    dragKeyboardCodes.has(event.code)
  ) {
    event.preventDefault();
    return;
  }
  event.stopPropagation();
};

export const MapControlMenu = ({
  label,
  tooltip = label,
  icon,
  children,
  open: controlledOpen,
  onOpenChange,
  size = "compact",
  closeLabel,
  contentClassName,
}: {
  label: string;
  tooltip?: string;
  icon: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  size?: "compact" | "wide";
  closeLabel?: string;
  contentClassName?: string;
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const titleId = useId();
  const compactToolRow = useMediaQuery({
    query:
      "(min-width: 640px) and (max-height: 500px) and (orientation: landscape)",
  });

  return (
    <Popover.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (controlledOpen === undefined) setInternalOpen(nextOpen);
        onOpenChange?.(nextOpen);
        setTooltipOpen(false);
      }}
    >
      <Tooltip
        content={tooltip}
        side={compactToolRow ? "bottom" : "right"}
        sideOffset={6}
        zIndex={50}
        className="map-overlay-theme map-overlay-surface map-overlay-tooltip pointer-events-none"
        open={tooltipOpen && !open}
        onOpenChange={setTooltipOpen}
      >
        <Popover.Trigger asChild>
          <button
            ref={setTrigger}
            type="button"
            aria-label={label}
            className="map-overlay-theme group flex h-[var(--map-control-target-size)] w-[var(--map-control-target-size)] items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
            onKeyDown={(event) => event.stopPropagation()}
            onKeyPress={(event) => event.stopPropagation()}
            onKeyUp={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <span
              className={clsx(
                "map-overlay-theme flex h-[var(--map-control-face-size)] w-[var(--map-control-face-size)] items-center justify-center rounded-sm border shadow-lg transition-colors [&_svg]:h-[var(--map-control-icon-size)] [&_svg]:w-[var(--map-control-icon-size)]",
                open
                  ? "border-accent bg-accent text-default-inverse"
                  : "map-overlay-surface text-default group-hover:bg-base-hover group-focus-visible:bg-base-hover",
              )}
            >
              {icon}
            </span>
          </button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          collisionBoundary={
            trigger?.closest(".drawing-toolbar-controls") ?? undefined
          }
          aria-labelledby={titleId}
          className={clsx(
            "map-overlay-theme map-overlay-surface map-overlay-popover z-30 max-w-[calc(100vw-1.5rem)] rounded-[10.2px] border p-[10.2px] text-size-small text-default shadow-xl outline-none",
            size === "wide"
              ? "flex h-[min(560px,var(--radix-popover-content-available-height))] w-[352px] flex-col overflow-hidden"
              : "w-[217.6px] overflow-y-auto",
            contentClassName,
          )}
          style={{
            maxHeight:
              size === "wide"
                ? "min(560px, var(--radix-popover-content-available-height))"
                : "var(--radix-popover-content-available-height)",
            maxWidth:
              "min(calc(100vw - 1.5rem), var(--radix-popover-content-available-width))",
          }}
          onInteractOutside={(event) => {
            const target = event.target;
            if (target instanceof Element && target.closest(".mapboxgl-map")) {
              event.preventDefault();
            }
          }}
          onEscapeKeyDown={(event) => {
            const target = event.target;
            if (
              target instanceof Element &&
              target.closest(
                '[data-capture-escape-key], [data-map-drag-handle][aria-pressed="true"]',
              )
            ) {
              event.preventDefault();
            }
          }}
          onKeyDown={handleKeyDown}
          onKeyPress={(event) => event.stopPropagation()}
          onKeyUp={handleKeyUp}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex shrink-0 items-center justify-between gap-2 px-2">
            <h2 id={titleId} className="font-semibold text-accent">
              {label}
            </h2>
            {closeLabel && (
              <Popover.Close asChild>
                <button
                  type="button"
                  aria-label={closeLabel}
                  className="-mr-2 flex h-8 w-8 items-center justify-center rounded-md text-subtle hover:bg-base-hover hover:text-default focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 pointer-coarse:w-11"
                >
                  <CloseIcon size="sm" aria-hidden="true" />
                </button>
              </Popover.Close>
            )}
          </div>
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
