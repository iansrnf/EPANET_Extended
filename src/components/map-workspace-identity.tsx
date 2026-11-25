import { useLayoutEffect, useRef } from "react";
import { useShowWelcome } from "src/commands/show-welcome";
import { useTranslate } from "src/hooks/use-translate";
import { FileInfo } from "./file-info";
import { GscwdBrand } from "./gscwd-brand";
import { MapAccountControls } from "./menu-bar";

export type MapToolbarSpace = {
  left: number;
  width: number;
  top: number;
  targetSize: number;
  mapWidth: number;
};

export const MapWorkspaceIdentity = ({
  compact,
  onHeightChange,
  onToolbarSpaceChange,
}: {
  compact: boolean;
  onHeightChange: (height: number) => void;
  onToolbarSpaceChange: (space: MapToolbarSpace) => void;
}) => {
  const translate = useTranslate();
  const showWelcome = useShowWelcome();
  const rowRef = useRef<HTMLDivElement>(null);
  const identityRef = useRef<HTMLDivElement>(null);
  const accountsRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const identity = identityRef.current;
    const accounts = accountsRef.current;
    if (!row || !identity || !accounts) return;
    const updateLayout = () => {
      const rowBounds = row.getBoundingClientRect();
      const identityBounds = identity.getBoundingClientRect();
      const accountsBounds = accounts.getBoundingClientRect();
      const targetSize = parseFloat(
        getComputedStyle(row).getPropertyValue("--map-control-target-size"),
      );
      onHeightChange(Math.ceil(rowBounds.height));
      onToolbarSpaceChange({
        left: identityBounds.right - rowBounds.left + 16,
        width: Math.max(0, accountsBounds.left - identityBounds.right - 16),
        top: 8 + Math.max(0, (rowBounds.height - targetSize - 6) / 2),
        targetSize,
        mapWidth: rowBounds.width + 16,
      });
    };
    const coarsePointer = window.matchMedia("(pointer: coarse)");
    const observer = new ResizeObserver(updateLayout);
    observer.observe(row);
    observer.observe(identity);
    observer.observe(accounts);
    coarsePointer.addEventListener("change", updateLayout);
    updateLayout();
    return () => {
      observer.disconnect();
      coarsePointer.removeEventListener("change", updateLayout);
    };
  }, [onHeightChange, onToolbarSpaceChange]);

  return (
    <div
      ref={rowRef}
      className="map-workspace-identity map-overlay-theme pointer-events-none absolute inset-x-2 top-2 z-30 flex items-start justify-between gap-2"
      data-compact={compact || undefined}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyPress={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div
        ref={identityRef}
        className="map-identity-card map-overlay-surface pointer-events-auto flex min-w-0 items-center gap-2 rounded-lg px-2 py-1"
      >
        <button
          type="button"
          aria-label={translate("welcomePage")}
          onClick={() => showWelcome({ source: "menu" })}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-accent hover:bg-base-hover"
        >
          <GscwdBrand variant="map" compact={compact} />
        </button>
        <div className="map-identity-file min-w-0 border-l pl-2">
          <FileInfo floating />
        </div>
      </div>
      <div ref={accountsRef} className="shrink-0">
        <MapAccountControls compact={compact} />
      </div>
    </div>
  );
};
