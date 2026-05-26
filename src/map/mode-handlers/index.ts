import type { HandlerContext } from "src/types";
import { Mode } from "src/state/mode";
import { useNoneHandlers } from "./none";
import { useHglProfileHandlers } from "./hgl-profile";
import { useDrawNodeHandlers } from "./draw-node";
import { useDrawLinkHandlers } from "./draw-link";
import { useDrawCustomerPointHandlers } from "./draw-customer-point";
import { useConnectCustomerPointsHandlers } from "./connect-customer-points";
import { useRedrawLinkHandlers } from "./redraw-link";
import { useAreaSelectionHandlers } from "./area-selection";
import { useTraceSelectHandlers } from "./trace-select";

const noopHandler = (e: mapboxgl.MapMouseEvent | mapboxgl.MapTouchEvent) => {
  e.preventDefault();
};

const pressureLoggerHandlers: Handlers = {
  click: noopHandler,
  move: noopHandler,
  down: noopHandler,
  up: noopHandler,
  double: noopHandler,
  exit: () => undefined,
};

export function useModeHandlers(handlerContext: HandlerContext) {
  const noneHandlers = useNoneHandlers(handlerContext);

  const HANDLERS: Record<Mode, Handlers> = {
    [Mode.NONE]: noneHandlers,
    [Mode.SELECT_RECTANGULAR]: useAreaSelectionHandlers({
      ...handlerContext,
      selectionMode: "rectangular",
    }),
    [Mode.SELECT_POLYGONAL]: useAreaSelectionHandlers({
      ...handlerContext,
      selectionMode: "polygonal",
    }),
    [Mode.SELECT_FREEHAND]: useAreaSelectionHandlers({
      ...handlerContext,
      selectionMode: "freehand",
    }),
    [Mode.DRAW_JUNCTION]: useDrawNodeHandlers({
      ...handlerContext,
      nodeType: "junction",
    }),
    [Mode.DRAW_RESERVOIR]: useDrawNodeHandlers({
      ...handlerContext,
      nodeType: "reservoir",
    }),
    [Mode.DRAW_TANK]: useDrawNodeHandlers({
      ...handlerContext,
      nodeType: "tank",
    }),
    [Mode.DRAW_PIPE]: useDrawLinkHandlers({
      ...handlerContext,
      linkType: "pipe",
    }),
    [Mode.DRAW_PUMP]: useDrawLinkHandlers({
      ...handlerContext,
      linkType: "pump",
    }),
    [Mode.DRAW_VALVE]: useDrawLinkHandlers({
      ...handlerContext,
      linkType: "valve",
    }),
    [Mode.DRAW_CUSTOMER_POINT]: useDrawCustomerPointHandlers(handlerContext),
    [Mode.DRAW_PRESSURE_LOGGER]: pressureLoggerHandlers,
    [Mode.CONNECT_CUSTOMER_POINTS]:
      useConnectCustomerPointsHandlers(handlerContext),
    [Mode.REDRAW_LINK]: useRedrawLinkHandlers(handlerContext),
    [Mode.BOUNDARY_TRACE_SELECT]: useTraceSelectHandlers(handlerContext),
    [Mode.UPSTREAM_TRACE_SELECT]: useTraceSelectHandlers(handlerContext),
    [Mode.DOWNSTREAM_TRACE_SELECT]: useTraceSelectHandlers(handlerContext),
    [Mode.HGL_PROFILE]: useHglProfileHandlers(handlerContext),
  };
  return HANDLERS;
}
