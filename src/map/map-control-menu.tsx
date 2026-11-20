import { useId, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Tooltip } from "@epanet-js/ui-kit";
import clsx from "clsx";

export const MapControlMenu = ({
  label,
  tooltip = label,
  icon,
  children,
}: {
  label: string;
  tooltip?: string;
  icon: ReactNode;
  children: ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const titleId = useId();

  return (
    <Popover.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        setTooltipOpen(false);
      }}
    >
      <Tooltip
        content={tooltip}
        side="right"
        sideOffset={6}
        open={tooltipOpen && !open}
        onOpenChange={setTooltipOpen}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={label}
            className="group flex h-[var(--map-control-target-size)] w-[var(--map-control-target-size)] items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
            onKeyDown={(event) => event.stopPropagation()}
            onKeyPress={(event) => event.stopPropagation()}
            onKeyUp={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <span
              className={clsx(
                "flex h-[var(--map-control-face-size)] w-[var(--map-control-face-size)] items-center justify-center rounded-sm border shadow-lg transition-colors [&_svg]:h-[var(--map-control-icon-size)] [&_svg]:w-[var(--map-control-icon-size)]",
                open
                  ? "border-accent bg-accent text-white"
                  : "bg-popover text-default group-hover:bg-base-hover",
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
          aria-labelledby={titleId}
          className="z-30 w-[217.6px] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-[10.2px] border bg-popover p-[10.2px] text-size-small text-default shadow-xl outline-none"
          style={{ maxHeight: "var(--radix-popover-content-available-height)" }}
          onInteractOutside={(event) => {
            const target = event.target;
            if (target instanceof Element && target.closest(".mapboxgl-map")) {
              event.preventDefault();
            }
          }}
          onKeyDown={(event) => event.stopPropagation()}
          onKeyPress={(event) => event.stopPropagation()}
          onKeyUp={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <h2 id={titleId} className="mb-2 px-2 font-semibold text-accent">
            {label}
          </h2>
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
