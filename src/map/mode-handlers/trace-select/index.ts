import { useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import noop from "lodash/noop";
import throttle from "lodash/throttle";

import type { HandlerContext } from "src/types";
import { cursorStyleAtom } from "src/state/map";
import { Mode } from "src/state/mode";
import { modeAtom } from "src/state/mode";
import { useFeatureFlag } from "src/hooks/use-feature-flags";
import { simulationResultsAtom } from "src/state/simulation";
import { simulationResultsDerivedAtom } from "src/state/derived-branch-state";
import { useSelection } from "src/selection";
import { useClickedAsset } from "../utils";
import { searchNearbyRenderedFeatures } from "src/map/search";
import { clickableLayers } from "src/map/layers/layer";
import { notify } from "src/components/notifications";
import { Asset, Pipe, Valve } from "src/hydraulic-model/asset-types";
import { PressureLogger } from "src/hydraulic-model/pressure-loggers";
import { runTrace } from "src/lib/trace";
import { useTranslate } from "src/hooks/use-translate";
import { useKeyboardState } from "src/keyboard/use-keyboard-state";
import { useSnapping } from "../hooks/use-snapping";

const TRACE_MODE_MAP = {
  [Mode.BOUNDARY_TRACE_SELECT]: "boundary",
  [Mode.UPSTREAM_TRACE_SELECT]: "upstream",
  [Mode.DOWNSTREAM_TRACE_SELECT]: "downstream",
} as const;

type TraceModeKey = keyof typeof TRACE_MODE_MAP;

export function useTraceSelectHandlers({
  mode: modeWithOptions,
  selection,
  hydraulicModel,
  map,
}: HandlerContext): Handlers {
  const traceMode = TRACE_MODE_MAP[modeWithOptions.mode as TraceModeKey];

  const isStateRefactorOn = useFeatureFlag("FLAG_STATE_REFACTOR");
  const { getClickedAsset } = useClickedAsset(map, hydraulicModel.assets);
  const { findSnappingCandidate } = useSnapping(map, hydraulicModel.assets);
  const resultsReader = useAtomValue(
    isStateRefactorOn ? simulationResultsDerivedAtom : simulationResultsAtom,
  );
  const setMode = useSetAtom(modeAtom);
  const setCursor = useSetAtom(cursorStyleAtom);
  const {
    selectAsset,
    selectAssets,
    clearSelection,
    extendSelection,
    removeFromSelection,
    selectPressureLogger,
  } = useSelection(selection);
  const translate = useTranslate();
  const { isShiftHeld, isAltHeld } = useKeyboardState();

  const abortControllerRef = useRef<AbortController | null>(null);

  const abortPending = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  };

  const identifyOperation = (): "add" | "subtract" | undefined => {
    if (isAltHeld()) return "subtract";
    if (isShiftHeld()) return "add";
    return undefined;
  };

  const getPointerCursor = () => {
    const operation = identifyOperation();
    if (operation === "add") return "pointer-add";
    if (operation === "subtract") return "pointer-subtract";
    return "pointer";
  };

  const getClickedPressureLogger = (
    e: mapboxgl.MapMouseEvent | mapboxgl.MapTouchEvent,
  ): PressureLogger | null => {
    const pickedObjects = map.pickOverlayObjects({
      x: e.point.x,
      y: e.point.y,
      radius: 7,
    });

    for (const pickInfo of pickedObjects) {
      if (pickInfo.layer?.id === "pressure-loggers-layer" && pickInfo.object) {
        return pickInfo.object as PressureLogger;
      }
    }

    return null;
  };

  const handleClick = async (
    e: mapboxgl.MapMouseEvent | mapboxgl.MapTouchEvent,
  ) => {
    e.preventDefault();
    abortPending();

    const operation = identifyOperation();

    const clickedAsset = getClickedAsset(e);
    const clickedPressureLogger = clickedAsset
      ? null
      : getClickedPressureLogger(e);

    if (!clickedAsset && !clickedPressureLogger) {
      if (!operation) clearSelection();
      return;
    }

    if (clickedAsset && isForbiddenTarget(clickedAsset, traceMode)) {
      return;
    }

    // For upstream/downstream, require simulation results
    if (traceMode !== "boundary" && !resultsReader) {
      notify({
        variant: "warning",
        title: translate("traceSelection.simulationRequired"),
        description: translate("traceSelection.simulationRequiredHint"),
      });
      if (clickedAsset) {
        selectAsset(clickedAsset.id);
      } else if (clickedPressureLogger) {
        selectPressureLogger(clickedPressureLogger.id);
      }
      return;
    }

    // Determine start nodes and links based on what was clicked
    const startNodeIds: number[] = [];
    const startLinkIds: number[] = [];

    if (clickedAsset) {
      if (clickedAsset.isLink) {
        startLinkIds.push(clickedAsset.id);
      } else {
        startNodeIds.push(clickedAsset.id);
      }
    } else {
      if (!clickedPressureLogger) return;

      const backingJunctionId = clickedPressureLogger.connection?.junctionId;
      if (
        backingJunctionId !== undefined &&
        hydraulicModel.assets.has(backingJunctionId)
      ) {
        startNodeIds.push(backingJunctionId);
      } else {
        const snappingCandidate = findSnappingCandidate(
          e,
          clickedPressureLogger.coordinates,
        );

        if (snappingCandidate?.type === "pipe") {
          startLinkIds.push(snappingCandidate.id);
        } else if (snappingCandidate) {
          startNodeIds.push(snappingCandidate.id);
        }
      }
    }

    // Only show intermediate selection when replacing (not appending/subtracting)
    if (!operation) {
      if (clickedAsset) {
        selectAsset(clickedAsset.id);
      } else if (clickedPressureLogger) {
        selectPressureLogger(clickedPressureLogger.id);
      }
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const assetIds = await runTrace(
        hydraulicModel,
        resultsReader,
        {
          mode: traceMode,
          startNodeIds,
          startLinkIds,
        },
        abortController.signal,
      );

      if (abortController.signal.aborted) return;

      const idsToApply =
        assetIds.length > 0 ? assetIds : clickedAsset ? [clickedAsset.id] : [];

      if (operation === "add") {
        extendSelection(idsToApply);
      } else if (operation === "subtract") {
        removeFromSelection(idsToApply);
      } else {
        selectAssets(idsToApply);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      throw err;
    }
  };

  const handleMove = throttle(
    (e: mapboxgl.MapMouseEvent | mapboxgl.MapTouchEvent) => {
      if (!map) return;

      const features = searchNearbyRenderedFeatures(map, {
        point: e.point,
        distance: 7,
        layers: clickableLayers,
      });

      const visibleFeatures = features.filter(
        (f) => !f.state || !f.state.hidden,
      );

      const hoveredPressureLogger = getClickedPressureLogger(e);

      if (visibleFeatures.length === 0 && !hoveredPressureLogger) {
        setCursor("");
        return;
      }

      const hoveredAsset = getClickedAsset(e);
      if (hoveredAsset && isForbiddenTarget(hoveredAsset, traceMode)) {
        setCursor("not-allowed");
      } else {
        setCursor(getPointerCursor());
      }
    },
    16,
    { trailing: false },
  );

  return {
    click: handleClick,
    move: handleMove,
    down: noop,
    up: noop,
    double: noop,
    keydown: () => setCursor(getPointerCursor()),
    keyup: () => setCursor(getPointerCursor()),
    exit: () => {
      abortPending();
      setMode({ mode: Mode.NONE });
    },
  };
}

type TraceMode = (typeof TRACE_MODE_MAP)[TraceModeKey];

function isForbiddenTarget(asset: Asset, traceMode: TraceMode): boolean {
  if (traceMode === "boundary") return isBoundaryAsset(asset);
  return false;
}

function isBoundaryAsset(asset: Asset): boolean {
  switch (asset.type) {
    case "tank":
    case "reservoir":
    case "pump":
      return true;
    case "valve": {
      const valve = asset as Valve;
      // TCV is only a boundary when closed
      if (valve.kind === "tcv") {
        return valve.initialStatus === "closed";
      }
      return true;
    }
    case "pipe": {
      const pipe = asset as Pipe;
      return pipe.initialStatus === "closed" || pipe.initialStatus === "cv";
    }
    default:
      return false;
  }
}
