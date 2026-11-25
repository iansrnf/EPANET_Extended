import * as DD from "@radix-ui/react-dropdown-menu";
import { Tooltip } from "@epanet-js/ui-kit";
import { useState } from "react";

import {
  AdvancedSettingsIcon,
  ChevronDownIcon,
  ControlsIcon,
  PatternsIcon,
  PipeLibraryIcon,
  CurveLibraryIcon,
  CustomAttributesIcon,
} from "src/icons";
import { useTranslate } from "src/hooks/use-translate";
import { Button, DDContent, StyledItem } from "src/components/elements";
import { useShowControls } from "src/commands/show-controls";
import { useShowPatternsLibrary } from "src/commands/show-patterns-library";
import { useShowPipeLibrary } from "src/commands/show-pipe-library";
import { useShowCurveLibrary } from "src/commands/show-curve-library";
import { useShowCustomAttributes } from "src/commands/show-custom-attributes";

const floatingMenuPresentation = {
  className:
    "map-overlay-theme map-overlay-surface map-overlay-popover placemark-scrollbar z-40 max-w-[calc(100vw-1rem)] overflow-y-auto [&_[data-highlighted]]:bg-base-hover [&_[data-disabled]]:cursor-not-allowed [&_[data-disabled]]:text-disabled [&_[data-disabled]]:opacity-60",
  collisionPadding: 8,
  style: {
    maxHeight:
      "min(calc(100dvh - 1rem), var(--radix-dropdown-menu-content-available-height))",
  },
};

export const OperationalDataDropdown = ({
  floating = false,
}: {
  floating?: boolean;
}) => {
  const translate = useTranslate();
  const showControls = useShowControls();
  const showPatternsLibrary = useShowPatternsLibrary();
  const showPipeLibrary = useShowPipeLibrary();
  const showCurveLibrary = useShowCurveLibrary();
  const showCustomAttributes = useShowCustomAttributes();
  const [menuOpen, setMenuOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  return (
    <div
      className={
        floating
          ? "map-overlay-theme flex h-[var(--map-control-target-size)] w-[var(--map-control-target-size)] shrink-0 items-center justify-center"
          : "h-10 w-12 group bn flex items-stretch py-1 focus:outline-hidden"
      }
    >
      <DD.Root
        onOpenChange={(open) => {
          setMenuOpen(open);
          setTooltipOpen(false);
        }}
      >
        <Tooltip
          content={translate("operationalData")}
          side={floating ? "right" : undefined}
          sideOffset={floating ? 6 : undefined}
          zIndex={floating ? 50 : undefined}
          className={
            floating
              ? "map-overlay-theme map-overlay-surface map-overlay-tooltip pointer-events-none"
              : undefined
          }
          open={floating ? tooltipOpen && !menuOpen : undefined}
          onOpenChange={floating ? setTooltipOpen : undefined}
        >
          <DD.Trigger asChild>
            {floating ? (
              <button
                type="button"
                aria-label={translate("operationalData")}
                className="group flex h-[var(--map-control-target-size)] w-[var(--map-control-target-size)] items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span
                  className={`flex h-[var(--map-control-face-size)] w-[var(--map-control-face-size)] items-center justify-center rounded-sm border shadow-lg transition-colors [&_svg]:h-[var(--map-control-icon-size)] [&_svg]:w-[var(--map-control-icon-size)] ${
                    menuOpen
                      ? "border-accent bg-accent text-default-inverse"
                      : "map-overlay-surface text-default group-hover:bg-base-hover group-focus-visible:bg-base-hover"
                  }`}
                >
                  <AdvancedSettingsIcon aria-hidden="true" />
                </span>
              </button>
            ) : (
              <Button variant="quiet" aria-label={translate("operationalData")}>
                <AdvancedSettingsIcon />
                <ChevronDownIcon size="sm" />
              </Button>
            )}
          </DD.Trigger>
        </Tooltip>
        <DD.Portal>
          <DDContent
            {...(floating ? floatingMenuPresentation : {})}
            align="start"
            side={floating ? "right" : "bottom"}
            sideOffset={floating ? 6 : undefined}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <StyledItem
              onSelect={() => showPatternsLibrary({ source: "toolbar" })}
            >
              <PatternsIcon />
              {translate("patterns.title")}
            </StyledItem>

            <StyledItem
              onSelect={() => showCurveLibrary({ source: "toolbar" })}
            >
              <CurveLibraryIcon />
              {translate("curves.title")}
            </StyledItem>

            <StyledItem onSelect={() => showPipeLibrary({ source: "toolbar" })}>
              <PipeLibraryIcon />
              {translate("pipeLibrary.menuLabel")}
            </StyledItem>

            <StyledItem onSelect={() => showControls({ source: "toolbar" })}>
              <ControlsIcon />
              {translate("controls.title")}
            </StyledItem>

            <StyledItem
              onSelect={() => showCustomAttributes({ source: "toolbar" })}
            >
              <CustomAttributesIcon />
              {translate("customAttributes.title")}
            </StyledItem>
          </DDContent>
        </DD.Portal>
      </DD.Root>
    </div>
  );
};
