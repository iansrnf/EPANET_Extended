import { useHotkeys } from "src/keyboard/hotkeys";
import { Tooltip } from "@epanet-js/ui-kit";
import { Keycap, Button } from "./elements";
import { localizeKeybinding } from "src/infra/i18n";
import { useRef, useState } from "react";
import clsx from "clsx";

export function DisabledMenuAction({
  label,
  reason,
  children,
}: {
  label: string;
  reason: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <div className="h-10 opacity-60 cursor-not-allowed group bn flex items-stretch py-1 focus:outline-hidden">
        <Tooltip content={reason} open={open} onOpenChange={setOpen}>
          <Button
            variant={"quiet/mode"}
            disabled
            aria-label={label}
            aria-disabled
          >
            {children}
            {label}
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}

export default function MenuAction({
  selected = false,
  onClick,
  children,
  disabled = false,
  expanded = false,
  role = undefined,
  label,
  hotkey,
  readOnlyHotkey,
  floating = false,
}: {
  selected?: boolean;
  onClick: (e?: Pick<React.MouseEvent, "shiftKey">) => void;
  children: React.ReactNode;
  disabled?: boolean;
  expanded?: boolean;
  role?: React.HTMLAttributes<HTMLButtonElement>["role"];
  label: string;
  hotkey?: string;
  readOnlyHotkey?: string;
  floating?: boolean;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useHotkeys(
    hotkey || "noop",
    (e) => {
      if (disabled) return;
      e.preventDefault();
      onClick();
    },
    [onClick, disabled],
    `Menu action ${label}`,
  );

  const [open, setOpen] = useState(false);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setOpen(false);
    buttonRef.current && buttonRef.current.blur();
    onClick(e);
  };

  return (
    <div className={clsx("relative", floating && "map-overlay-theme")}>
      <div
        className={
          floating
            ? "flex h-[var(--map-control-target-size)] w-[var(--map-control-target-size)] shrink-0 items-center justify-center"
            : `h-10 ${expanded ? "" : "w-8"} ${
                disabled ? "opacity-60 cursor-not-allowed" : ""
              } group bn flex items-stretch py-1 focus:outline-hidden`
        }
      >
        <Tooltip
          open={open}
          onOpenChange={setOpen}
          side={floating ? "right" : undefined}
          sideOffset={floating ? 6 : undefined}
          zIndex={floating ? 50 : undefined}
          className={
            floating
              ? "map-overlay-theme map-overlay-surface map-overlay-tooltip pointer-events-none"
              : undefined
          }
          content={
            <div className="flex gap-x-2 items-center">
              {!expanded || floating ? label : null}
              {hotkey ? (
                <Keycap size="xs">{localizeKeybinding(hotkey)}</Keycap>
              ) : null}
              {readOnlyHotkey ? (
                <Keycap size="xs">{localizeKeybinding(readOnlyHotkey)}</Keycap>
              ) : null}
            </div>
          }
        >
          {floating ? (
            <button
              ref={buttonRef}
              type="button"
              onClick={handleClick}
              onBlur={() => setOpen(false)}
              role={role}
              disabled={disabled}
              aria-label={label}
              aria-checked={role === "radio" ? selected : undefined}
              aria-pressed={role !== "radio" && selected ? true : undefined}
              className="group flex h-[var(--map-control-target-size)] w-[var(--map-control-target-size)] shrink-0 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span
                className={clsx(
                  "flex h-[var(--map-control-face-size)] w-[var(--map-control-face-size)] items-center justify-center rounded-sm border shadow-lg transition-colors [&_svg]:h-[var(--map-control-icon-size)] [&_svg]:w-[var(--map-control-icon-size)]",
                  selected
                    ? "border-accent bg-accent text-default-inverse"
                    : disabled
                      ? "map-overlay-surface text-disabled"
                      : "map-overlay-surface text-default group-hover:bg-base-hover group-focus-visible:bg-base-hover",
                )}
              >
                {children}
              </span>
            </button>
          ) : (
            <Button
              ref={buttonRef}
              onClick={handleClick}
              onBlur={() => setOpen(false)}
              variant={"quiet/mode"}
              role={role}
              disabled={disabled}
              aria-label={label}
              aria-checked={selected}
              aria-expanded={selected ? "true" : "false"}
            >
              {children}
              {!!expanded && label}
            </Button>
          )}
        </Tooltip>
      </div>
    </div>
  );
}
