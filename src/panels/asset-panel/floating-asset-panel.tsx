import { useAtomValue } from "jotai";
import { memo, useContext, useLayoutEffect, useMemo, useRef } from "react";
import { midpoint } from "@epanet-js/geometry";
import { isNodeAsset } from "@epanet-js/hydraulic-model";
import { useDismissAssetPanel } from "src/commands/dismiss-asset-panel";
import { DefaultErrorBoundary } from "src/components/elements";
import { MapContext } from "src/map";
import {
  assetsDerivedAtom,
  customerPointsDerivedAtom,
} from "src/state/derived-branch-state";
import { ephemeralStateAtom } from "src/state/drawing";
import { selectedLoggerAtom } from "src/state/loggers";
import { loggerPreviewAtom } from "src/state/logger-map";
import { activePanelIn } from "src/state/panels";
import { selectionAtom } from "src/state/selection";
import { zonesAtom } from "src/state/zones";
import { USelection } from "src/selection";
import { PanelContent } from "../panel-template";
import { getFloatingPanelPosition } from "./floating-panel-position";
import { getZonePanelAnchor } from "./floating-panel-anchor";

const activeFloatingPanelAtom = activePanelIn("floating");
const CONTENT_SCALE = 0.825;

export const FloatingAssetPanel = () => {
  const panel = useAtomValue(activeFloatingPanelAtom);
  const assets = useAtomValue(assetsDerivedAtom);
  const customerPoints = useAtomValue(customerPointsDerivedAtom);
  const selection = useAtomValue(selectionAtom);
  const zones = useAtomValue(zonesAtom);
  const ephemeralState = useAtomValue(ephemeralStateAtom);
  const logger = useAtomValue(selectedLoggerAtom);
  const loggerPreview = useAtomValue(loggerPreviewAtom);
  const map = useContext(MapContext);
  const dismissAssetPanel = useDismissAssetPanel();
  const viewportRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const assetId = USelection.singleAssetId(selection);
  const customerPointId = USelection.singleCustomerPointId(selection);
  const asset = assetId === null ? undefined : assets.get(assetId);
  const customerPoint =
    customerPointId === null ? undefined : customerPoints.get(customerPointId);
  const zoneId = USelection.singleZoneId(selection);
  const zone = zoneId === null ? undefined : zones.get(zoneId);
  const zoneGeometry = zone?.geometry;
  const zoneCoordinates = useMemo(
    () => zoneGeometry && getZonePanelAnchor(zoneGeometry),
    [zoneGeometry],
  );
  const selectedItem = logger ?? asset ?? customerPoint ?? zone;
  const assetCoordinates = !asset
    ? undefined
    : isNodeAsset(asset)
      ? asset.coordinates
      : asset.coordinates.length > 0
        ? midpoint(
            asset.coordinates[Math.floor((asset.coordinates.length - 1) / 2)],
            asset.coordinates[Math.ceil((asset.coordinates.length - 1) / 2)],
          )
        : undefined;
  const coordinates = logger
    ? loggerPreview?.type === "move" && loggerPreview.loggerId === logger.id
      ? loggerPreview.coordinates
      : logger.coordinates
    : (assetCoordinates ??
      (customerPoint
        ? ephemeralState.type === "moveCustomerPoint" &&
          ephemeralState.customerPoint.id === customerPoint.id
          ? ephemeralState.movedCoordinates
          : customerPoint.coordinates
        : zoneCoordinates));
  const longitude = coordinates?.[0];
  const latitude = coordinates?.[1];

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const element = panelRef.current;
    const content = contentRef.current;
    if (!map || !panel || !viewport || !element || !content) return;
    if (longitude === undefined || latitude === undefined) return;

    const updatePosition = () => {
      const viewportSize = {
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      };
      const size = {
        width: Math.min(
          360 * CONTENT_SCALE,
          Math.max(0, viewportSize.width - 24),
        ),
        height: Math.min(
          600 * CONTENT_SCALE,
          Math.max(0, viewportSize.height - 24),
        ),
      };
      const anchor = map.map.project([longitude, latitude]);
      const position = getFloatingPanelPosition(anchor, viewportSize, size);
      element.style.width = `${size.width}px`;
      element.style.height = `${size.height}px`;
      element.style.transform = `translate(${position.left}px, ${position.top}px)`;
      content.style.width = `${size.width / CONTENT_SCALE}px`;
      content.style.height = `${size.height / CONTENT_SCALE}px`;
    };

    updatePosition();
    map.map.on("move", updatePosition);
    map.map.on("resize", updatePosition);
    const observer = new ResizeObserver(updatePosition);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
      map.map.off("move", updatePosition);
      map.map.off("resize", updatePosition);
    };
  }, [map, panel, longitude, latitude]);

  if (!panel || !selectedItem || !map) return null;

  const close = () => {
    dismissAssetPanel();
    map.map.getCanvas().focus({ preventScroll: true });
  };

  return (
    <div
      ref={viewportRef}
      className="absolute inset-0 z-30 pointer-events-none"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label={selectedItem.label}
        tabIndex={-1}
        className="absolute left-0 top-0 pointer-events-auto flex flex-col overflow-hidden rounded-xl border bg-base text-default shadow-2xl"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented) {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
      >
        <div
          ref={contentRef}
          className="absolute left-0 top-0 flex min-h-0 flex-col"
          style={{ zoom: CONTENT_SCALE }}
        >
          <DefaultErrorBoundary>
            <FloatingPanelContent panel={panel.panel} dock={panel.dock} />
          </DefaultErrorBoundary>
        </div>
      </div>
    </div>
  );
};

const FloatingPanelContent = memo(PanelContent);
