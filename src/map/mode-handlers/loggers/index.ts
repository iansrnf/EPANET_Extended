import { useAtomValue, useSetAtom } from "jotai";
import noop from "lodash/noop";
import type { HandlerContext } from "src/types";
import { useLoggerActions } from "src/commands/logger-actions";
import { loggerPreviewAtom } from "src/state/logger-map";
import { selectedLoggerIdAtom } from "src/state/loggers";
import { cursorStyleAtom } from "src/state/map";
import { Mode, modeAtom } from "src/state/mode";
import { useSnapping } from "../hooks/use-snapping";
import { getMapCoord } from "../utils";

export function useDrawLoggerHandlers({
  readonly = false,
}: HandlerContext): Handlers {
  const { addLogger } = useLoggerActions();
  const setPreview = useSetAtom(loggerPreviewAtom);
  const setMode = useSetAtom(modeAtom);
  const setCursor = useSetAtom(cursorStyleAtom);

  return {
    click: (event) => {
      if (readonly) return;
      void addLogger(getMapCoord(event));
      setPreview(null);
    },
    move: (event) => {
      if (readonly) return;
      setPreview({ type: "draw", coordinates: getMapCoord(event) });
    },
    down: noop,
    up: noop,
    double: noop,
    exit: () => {
      setPreview(null);
      setCursor("");
      setMode({ mode: Mode.NONE });
    },
  };
}

export function useConnectLoggerHandlers({
  map,
  hydraulicModel,
  readonly = false,
}: HandlerContext): Handlers {
  const loggerId = useAtomValue(selectedLoggerIdAtom);
  const { connectLogger, cancelConnection } = useLoggerActions();
  const setPreview = useSetAtom(loggerPreviewAtom);
  const setCursor = useSetAtom(cursorStyleAtom);
  const { findSnappingCandidate } = useSnapping(map, hydraulicModel.assets);

  const findConnection = (
    event: mapboxgl.MapMouseEvent | mapboxgl.MapTouchEvent,
  ) => {
    const candidate = findSnappingCandidate(event, getMapCoord(event));
    return candidate
      ? {
          assetId: candidate.id,
          snapPoint: candidate.coordinates as [number, number],
        }
      : null;
  };

  return {
    click: (event) => {
      if (readonly || loggerId === null) return;
      const connection = findConnection(event);
      if (!connection) return;
      void connectLogger(loggerId, connection).then((applied) => {
        if (applied) cancelConnection();
      });
    },
    move: (event) => {
      if (readonly || loggerId === null) return;
      const connection = findConnection(event);
      setPreview({ type: "connect", loggerId, connection });
      setCursor(connection ? "pointer" : "crosshair");
    },
    down: noop,
    up: noop,
    double: noop,
    exit: () => {
      setCursor("");
      cancelConnection();
    },
  };
}
