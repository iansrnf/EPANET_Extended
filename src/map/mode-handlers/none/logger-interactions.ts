import { useAtomValue, useSetAtom } from "jotai";
import { useRef } from "react";
import type { Logger } from "@epanet-js/project-settings";
import type { HandlerContext } from "src/types";
import { useLoggerActions } from "src/commands/logger-actions";
import { loggersAtom, selectedLoggerIdAtom } from "src/state/loggers";
import { loggerPreviewAtom } from "src/state/logger-map";
import { cursorStyleAtom } from "src/state/map";
import { LOGGER_LAYER_ID } from "src/map/overlays/loggers";
import { Mode, modeAtom } from "src/state/mode";
import { getMapCoord } from "../utils";

type MapEvent = mapboxgl.MapMouseEvent | mapboxgl.MapTouchEvent;

export const useLoggerInteractions = ({
  map,
  readonly = false,
}: Pick<HandlerContext, "map" | "readonly">) => {
  const loggers = useAtomValue(loggersAtom);
  const selectedId = useAtomValue(selectedLoggerIdAtom);
  const { selectLogger, moveLogger } = useLoggerActions();
  const setPreview = useSetAtom(loggerPreviewAtom);
  const setCursor = useSetAtom(cursorStyleAtom);
  const { mode } = useAtomValue(modeAtom);
  const drag = useRef<{
    id: string;
    start: { x: number; y: number };
    activated: boolean;
  } | null>(null);
  if (mode !== Mode.NONE) drag.current = null;

  const pickLogger = (event: MapEvent): Logger | undefined => {
    if (loggers.length === 0) return undefined;
    const picks = map.pickOverlayObjects({
      x: event.point.x,
      y: event.point.y,
      radius: 7,
    });
    for (const pick of picks) {
      if (pick.layer?.id !== LOGGER_LAYER_ID || !pick.object) continue;
      const id = (pick.object as Pick<Logger, "id">).id;
      const logger = loggers.find((item) => item.id === id);
      if (logger) return logger;
    }
    return undefined;
  };

  const resetDrag = () => {
    drag.current = null;
    setPreview(null);
    setCursor("");
  };

  return {
    click: (event: MapEvent): boolean => {
      const logger = pickLogger(event);
      if (!logger) return false;
      event.preventDefault();
      selectLogger(logger.id);
      return true;
    },
    down: (event: MapEvent): boolean => {
      const logger = pickLogger(event);
      if (!logger) return false;
      event.preventDefault();
      if (logger.id !== selectedId || readonly) return true;
      drag.current = { id: logger.id, start: event.point, activated: false };
      setCursor("move");
      return true;
    },
    move: (event: MapEvent): boolean => {
      const current = drag.current;
      if (!current) return false;
      if (readonly) {
        resetDrag();
        return true;
      }
      const dx = event.point.x - current.start.x;
      const dy = event.point.y - current.start.y;
      if (!current.activated && dx * dx + dy * dy < 25) return true;
      current.activated = true;
      event.preventDefault();
      setPreview({
        type: "move",
        loggerId: current.id,
        coordinates: getMapCoord(event),
      });
      setCursor("move");
      return true;
    },
    up: (event: MapEvent): boolean => {
      const current = drag.current;
      if (!current) return false;
      event.preventDefault();
      if (current.activated && !readonly) {
        void moveLogger(current.id, getMapCoord(event));
      }
      resetDrag();
      return true;
    },
    exit: (): boolean => {
      if (drag.current) {
        resetDrag();
        return true;
      }
      if (selectedId !== null) {
        selectLogger(null);
        return true;
      }
      return false;
    },
  };
};
