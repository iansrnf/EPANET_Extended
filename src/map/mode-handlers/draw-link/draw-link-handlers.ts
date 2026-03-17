import type { HandlerContext, Position } from "src/types";
import type { MapEngine } from "src/map";
import noop from "lodash/noop";
import {
  ephemeralStateAtom,
  EphemeralEditingState,
  pipeDrawingDefaultsAtom,
} from "src/state/drawing";
import { cursorStyleAtom } from "src/state/map";
import { modeAtom, Mode } from "src/state/mode";
import { selectionAtom } from "src/state/selection";
import { useSetAtom, useAtom, useAtomValue } from "jotai";
import { getMapCoord } from "../utils";
import { useRef } from "react";
import { useKeyboardState } from "src/keyboard";
import measureLength from "@turf/length";
import { useSnapping } from "../hooks/use-snapping";
import { captureError } from "src/infra/error-tracking";
import { nextTick } from "process";
import { AssetId, LinkAsset, NodeAsset } from "src/hydraulic-model";
import { PressureLogger } from "src/hydraulic-model/pressure-loggers";
import { useUserTracking } from "src/infra/user-tracking";
import { LinkType } from "src/hydraulic-model";
import { useElevations } from "src/map/elevations/use-elevations";
import { LngLat, MapMouseEvent, MapTouchEvent } from "mapbox-gl";
import { useSelection } from "src/selection";
import { DEFAULT_SNAP_DISTANCE_PIXELS } from "../../search";
import { addLink } from "src/hydraulic-model/model-operations";

export type SnappingCandidate =
  | NodeAsset
  | {
      type: "pipe";
      id: AssetId;
      coordinates: Position;
      vertexIndex: number | null;
    }
  | {
      type: "pressureLogger";
      id: number;
      coordinates: Position;
    };

export type SubmitLinkParams = {
  startNode: NodeAsset;
  startPressureLoggerId?: number;
  link: LinkAsset;
  endNode: NodeAsset;
  endPressureLoggerId?: number;
  startPipeId?: AssetId;
  endPipeId?: AssetId;
};

type NullDrawing = {
  isNull: true;
  snappingCandidate: SnappingCandidate | null;
};

type DrawingState =
  | {
      isNull: false;
      startNode: NodeAsset;
      startPressureLoggerId?: number;
      startPipeId?: AssetId;
      link: LinkAsset;
      snappingCandidate: SnappingCandidate | null;
    }
  | NullDrawing;

function isWithinSnappingDistance(
  map: MapEngine,
  position1: Position,
  position2: Position,
): boolean {
  const screen1 = map.map.project([position1[0], position1[1]]);
  const screen2 = map.map.project([position2[0], position2[1]]);

  const pixelDistance = Math.sqrt(
    Math.pow(screen1.x - screen2.x, 2) + Math.pow(screen1.y - screen2.y, 2),
  );

  return pixelDistance < DEFAULT_SNAP_DISTANCE_PIXELS;
}

function getSnappingCandidateIfEnabled(
  event: MapMouseEvent | MapTouchEvent,
  position: Position,
  isSnapping: () => boolean,
  findSnappingCandidate: (
    e: MapMouseEvent | MapTouchEvent,
    pos: Position,
  ) => SnappingCandidate | null,
): SnappingCandidate | null {
  return isSnapping() ? findSnappingCandidate(event, position) : null;
}

type LoopedLinkCheck = {
  isLoopedLink: boolean;
  isHoveringEphemeralStart: boolean;
  shouldPrevent: boolean;
};

function checkLoopedLinkConditions(
  drawing: DrawingState,
  snappingCandidate: SnappingCandidate | null,
  currentPosition: Position,
  map: MapEngine,
): LoopedLinkCheck {
  if (drawing.isNull) {
    return {
      isLoopedLink: false,
      isHoveringEphemeralStart: false,
      shouldPrevent: false,
    };
  }

  const isLoopedLink =
    snappingCandidate !== null &&
    ((snappingCandidate.type === "pressureLogger" &&
      snappingCandidate.id === drawing.startPressureLoggerId) ||
      (snappingCandidate.type !== "pipe" &&
        snappingCandidate.type !== "pressureLogger" &&
        snappingCandidate.id === drawing.startNode.id));

  const linkCopy = drawing.link.copy();
  const isHoveringEphemeralStart =
    !snappingCandidate &&
    isWithinSnappingDistance(map, linkCopy.firstVertex, currentPosition) &&
    !linkCopy.isStart(linkCopy.lastVertex);

  return {
    isLoopedLink,
    isHoveringEphemeralStart,
    shouldPrevent: isLoopedLink || isHoveringEphemeralStart,
  };
}

export function useDrawLinkHandlers({
  rep,
  hydraulicModel,
  units,
  map,
  linkType,
  sourceLink,
  onSubmitLink,
  disableEndAndContinue,
  readonly = false,
}: HandlerContext & {
  linkType: LinkType;
  sourceLink?: LinkAsset;
  onSubmitLink?: (params: SubmitLinkParams) => NodeAsset | undefined;
  disableEndAndContinue?: boolean;
}): Handlers {
  const setMode = useSetAtom(modeAtom);
  const [ephemeralState, setEphemeralState] = useAtom(ephemeralStateAtom);
  const selection = useAtomValue(selectionAtom);
  const { selectAsset } = useSelection(selection);
  const transact = rep.useTransact();
  const userTracking = useUserTracking();
  const usingTouchEvents = useRef<boolean>(false);
  const { assetBuilder } = hydraulicModel;
  const lengthUnit = units.length;
  const { findSnappingCandidate } = useSnapping(map, hydraulicModel.assets);

  const { isShiftHeld, isControlHeld } = useKeyboardState();
  const setCursor = useSetAtom(cursorStyleAtom);
  const pipeDrawingDefaults = useAtomValue(pipeDrawingDefaultsAtom);

  const getClickedPressureLogger = (
    e: MapMouseEvent | MapTouchEvent,
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

  const getSnappingCandidate = (
    e: MapMouseEvent | MapTouchEvent,
    position: Position,
  ): SnappingCandidate | null => {
    const clickedPressureLogger = getClickedPressureLogger(e);
    if (clickedPressureLogger) {
      return {
        type: "pressureLogger",
        id: clickedPressureLogger.id,
        coordinates: clickedPressureLogger.coordinates,
      };
    }

    return findSnappingCandidate(e, position);
  };

  const createLinkForType = (coordinates: Position[] = []) => {
    const startProperties = {
      label: "",
      coordinates,
    };
    switch (linkType) {
      case "pipe":
        return assetBuilder.buildPipe({
          ...startProperties,
          ...(pipeDrawingDefaults.diameter && {
            diameter: pipeDrawingDefaults.diameter,
          }),
          ...(pipeDrawingDefaults.roughness && {
            roughness: pipeDrawingDefaults.roughness,
          }),
        });
      case "pump":
        return assetBuilder.buildPump({
          ...startProperties,
          definitionType: "curve",
          curve: [{ x: 1, y: 1 }],
        });
      case "valve":
        return assetBuilder.buildValve(startProperties);
    }
  };

  const resetDrawing = () => {
    setCursor("default");
    setEphemeralState({ type: "none" });
  };

  const getDrawingState = (): DrawingState => {
    if (ephemeralState.type === "drawLink" && ephemeralState.startNode) {
      return {
        isNull: false,
        startNode: ephemeralState.startNode,
        startPressureLoggerId: ephemeralState.startPressureLoggerId,
        startPipeId: ephemeralState.startPipeId,
        snappingCandidate: ephemeralState.snappingCandidate || null,
        link: ephemeralState.link as LinkAsset,
      };
    }
    return {
      isNull: true,
      snappingCandidate:
        ephemeralState.type === "drawLink"
          ? ephemeralState.snappingCandidate
          : null,
    };
  };

  const setDrawing = ({
    startNode,
    startPressureLoggerId,
    link,
    snappingCandidate,
    startPipeId,
    draftJunction,
  }: {
    startNode: NodeAsset;
    startPressureLoggerId?: number;
    link: LinkAsset;
    snappingCandidate: SnappingCandidate | null;
    startPipeId?: AssetId;
    draftJunction?: NodeAsset;
  }) => {
    setEphemeralState({
      type: "drawLink",
      link,
      linkType,
      startNode,
      startPressureLoggerId,
      startPipeId,
      snappingCandidate,
      ...(sourceLink && { sourceLink }),
      ...(draftJunction && { draftJunction }),
    });
  };

  const setSnappingCandidate = (
    snappingCandidate: SnappingCandidate | null,
  ) => {
    setEphemeralState((prev: EphemeralEditingState) => {
      if (prev.type !== "drawLink") {
        const link = createLinkForType();

        return {
          type: "drawLink",
          linkType,
          link,
          snappingCandidate,
          ...(sourceLink && { sourceLink }),
        };
      }

      if (prev.snappingCandidate === snappingCandidate) {
        return prev;
      }

      return {
        ...prev,
        snappingCandidate,
      };
    });
  };

  const drawing = getDrawingState();

  const startDrawing = ({
    startNode,
    startPressureLoggerId,
    startPipeId,
  }: {
    startNode: NodeAsset;
    startPressureLoggerId?: number;
    startPipeId?: AssetId;
  }) => {
    const coordinates = startNode.coordinates;
    const link = sourceLink ? sourceLink.copy() : createLinkForType();
    link.setCoordinates([coordinates, coordinates]);

    setDrawing({
      startNode,
      startPressureLoggerId,
      link,
      snappingCandidate: null,
      startPipeId,
    });
    setCursor("default");
    return link.id;
  };

  const addVertex = (coordinates: Position) => {
    if (drawing.isNull) return;

    const linkCopy = drawing.link.copy();
    linkCopy.addVertex(coordinates);
    setDrawing({
      startNode: drawing.startNode,
      startPressureLoggerId: drawing.startPressureLoggerId,
      startPipeId: drawing.startPipeId,
      link: linkCopy,
      snappingCandidate: null,
    });
  };

  const submitLink = ({
    startNode,
    startPressureLoggerId,
    link,
    endNode,
    endPressureLoggerId,
    startPipeId,
    endPipeId,
  }: SubmitLinkParams) => {
    const length = measureLength(link.feature);
    if (!length) {
      return;
    }

    const startEndpoint = startPressureLoggerId
      ? resolvePressureLoggerEndpoint(startPressureLoggerId, startNode)
      : { node: startNode };
    const endEndpoint = endPressureLoggerId
      ? resolvePressureLoggerEndpoint(endPressureLoggerId, endNode)
      : { node: endNode };

    const moment = addLink(hydraulicModel, {
      link: link,
      startNode: startEndpoint.node,
      endNode: endEndpoint.node,
      startPipeId,
      endPipeId,
      lengthUnit,
    });
    const pressureLoggerUpdates = [
      startEndpoint.pressureLoggerUpdate,
      endEndpoint.pressureLoggerUpdate,
    ].filter((pressureLogger): pressureLogger is PressureLogger =>
      Boolean(pressureLogger),
    );

    if (pressureLoggerUpdates.length > 0) {
      moment.putPressureLoggers = [
        ...(moment.putPressureLoggers || []),
        ...pressureLoggerUpdates,
      ];
    }

    userTracking.capture({ name: "asset.created", type: link.type });
    transact(moment);

    if (moment.putAssets && moment.putAssets.length > 0) {
      const newLinkId = moment.putAssets[0].id;
      selectAsset(newLinkId);
    }

    const [, , endNodeUpdated] = moment.putAssets || [];
    return endNodeUpdated as NodeAsset;
  };

  const isSnapping = () => !isShiftHeld();
  const isEndAndContinueOn = disableEndAndContinue
    ? () => false
    : isControlHeld;

  const coordinatesToLngLat = (coordinates: Position) => {
    const [lng, lat] = coordinates;
    return { lng, lat };
  };
  const { fetchElevation, prefetchTile } = useElevations(units.elevation);

  const isClickInProgress = useRef<boolean>(false);

  const createJunction = (coordinates: Position, elevation: number) =>
    assetBuilder.buildJunction({
      label: "",
      coordinates,
      elevation,
    });

  const createPressureLoggerBackingJunction = (
    pressureLoggerId: number,
    coordinates: Position,
    elevation: number,
  ) => {
    const junction = createJunction(coordinates, elevation);
    junction.setProperty("visibility", false);
    junction.setProperty("pressureLoggerId", pressureLoggerId);
    return junction;
  };

  const getPressureLogger = (pressureLoggerId: number): PressureLogger => {
    const pressureLogger = hydraulicModel.pressureLoggers.get(pressureLoggerId);
    if (!pressureLogger) {
      throw new Error(`Pressure logger ${pressureLoggerId} not found`);
    }
    return pressureLogger;
  };

  const resolvePressureLoggerEndpoint = (
    pressureLoggerId: number,
    fallbackNode: NodeAsset,
  ): { node: NodeAsset; pressureLoggerUpdate?: PressureLogger } => {
    const pressureLogger = getPressureLogger(pressureLoggerId);
    const backingJunctionId = pressureLogger.connection?.junctionId;

    if (backingJunctionId !== undefined) {
      const backingJunction = hydraulicModel.assets.get(backingJunctionId);
      if (backingJunction && backingJunction.isNode) {
        return { node: backingJunction as NodeAsset };
      }
    }

    const junction = createPressureLoggerBackingJunction(
      pressureLoggerId,
      fallbackNode.coordinates,
      fallbackNode.elevation,
    );

    return {
      node: junction,
      pressureLoggerUpdate: pressureLogger.connect({ junctionId: junction.id }),
    };
  };

  const handleSnappingClick = async (
    snappingCandidate: SnappingCandidate,
    clickPosition: Position,
    pointElevation: number,
  ) => {
    if (drawing.isNull) {
      if (
        snappingCandidate.type === "pipe" ||
        snappingCandidate.type === "pressureLogger"
      ) {
        const startNode = createJunction(
          snappingCandidate.coordinates,
          await fetchElevation(
            coordinatesToLngLat(snappingCandidate.coordinates) as LngLat,
          ),
        );
        startDrawing({
          startNode,
          startPressureLoggerId:
            snappingCandidate.type === "pressureLogger"
              ? snappingCandidate.id
              : undefined,
          startPipeId:
            snappingCandidate.type === "pipe"
              ? snappingCandidate.id
              : undefined,
        });
      } else {
        startDrawing({
          startNode: snappingCandidate,
        });
      }
    } else {
      const submitParams = {
        startNode: drawing.startNode,
        startPressureLoggerId: drawing.startPressureLoggerId,
        startPipeId: drawing.startPipeId,
        link: drawing.link,
        endNode:
          snappingCandidate.type === "pipe" ||
          snappingCandidate.type === "pressureLogger"
            ? createJunction(clickPosition, pointElevation)
            : snappingCandidate,
        endPressureLoggerId:
          snappingCandidate.type === "pressureLogger"
            ? snappingCandidate.id
            : undefined,
        endPipeId:
          snappingCandidate.type === "pipe" ? snappingCandidate.id : undefined,
      };
      const endNode = onSubmitLink
        ? onSubmitLink(submitParams)
        : submitLink(submitParams);

      if (isEndAndContinueOn() && endNode) {
        startDrawing({
          startNode: endNode,
        });
      } else {
        resetDrawing();
      }
    }
  };

  const handlers: Handlers = {
    click: (e) => {
      if (readonly) return;

      isClickInProgress.current = true;

      const doAsyncClick = async () => {
        if (disableEndAndContinue && isControlHeld()) {
          return;
        }

        if (!drawing.isNull) {
          const currentPosition = getMapCoord(e);
          const snappingCandidate = getSnappingCandidateIfEnabled(
            e,
            currentPosition,
            isSnapping,
            getSnappingCandidate,
          );
          const check = checkLoopedLinkConditions(
            drawing,
            snappingCandidate,
            currentPosition,
            map,
          );

          if (check.shouldPrevent) {
            return;
          }
        }

        const snappingCandidate = getSnappingCandidateIfEnabled(
          e,
          getMapCoord(e),
          isSnapping,
          getSnappingCandidate,
        );
        const clickPosition = snappingCandidate
          ? snappingCandidate.coordinates
          : getMapCoord(e);
        const pointElevation =
          snappingCandidate &&
          snappingCandidate.type !== "pipe" &&
          snappingCandidate.type !== "pressureLogger"
            ? snappingCandidate.elevation
            : await fetchElevation(e.lngLat);

        if (snappingCandidate) {
          return handleSnappingClick(
            snappingCandidate,
            clickPosition,
            pointElevation,
          );
        }

        if (drawing.isNull) {
          const startNode = createJunction(clickPosition, pointElevation);
          startDrawing({
            startNode,
          });
        } else if (isEndAndContinueOn()) {
          const submitParams = {
            startNode: drawing.startNode,
            startPressureLoggerId: drawing.startPressureLoggerId,
            startPipeId: drawing.startPipeId,
            link: drawing.link,
            endNode: createJunction(clickPosition, pointElevation),
          };
          const endJunction = onSubmitLink
            ? onSubmitLink(submitParams)
            : submitLink(submitParams);
          if (endJunction) {
            startDrawing({
              startNode: endJunction,
            });
          }
        } else {
          addVertex(clickPosition);
        }
      };

      doAsyncClick()
        .then(() => {
          nextTick(() => (isClickInProgress.current = false));
        })
        .catch((error) => {
          captureError(error);
          nextTick(() => (isClickInProgress.current = false));
        });
    },
    move: (e) => {
      if (isClickInProgress.current) return;

      const isApplePencil = e.type === "mousemove" && usingTouchEvents.current;
      if (isApplePencil) {
        return;
      }

      void prefetchTile(e.lngLat);

      const snappingCandidate = getSnappingCandidateIfEnabled(
        e,
        getMapCoord(e),
        isSnapping,
        getSnappingCandidate,
      );

      if (drawing.isNull) {
        setSnappingCandidate(snappingCandidate);
      } else {
        const nextCoordinates =
          (snappingCandidate && snappingCandidate.coordinates) ||
          getMapCoord(e);

        const linkCopy = drawing.link.copy();
        linkCopy.setCoordinates([
          ...linkCopy.coordinates.slice(0, -1),
          nextCoordinates,
        ]);

        const shouldShowDraftJunction =
          isEndAndContinueOn() && !snappingCandidate;

        const draftJunction = shouldShowDraftJunction
          ? assetBuilder.buildJunction({
              label: "",
              coordinates: nextCoordinates,
            })
          : undefined;

        const check = checkLoopedLinkConditions(
          drawing,
          snappingCandidate,
          nextCoordinates,
          map,
        );

        if (check.shouldPrevent) {
          setCursor("not-allowed");
        } else {
          setCursor("default");
        }

        setDrawing({
          ...drawing,
          link: linkCopy,
          snappingCandidate: check.shouldPrevent ? null : snappingCandidate,
          draftJunction,
        });
      }
    },
    double: async (e) => {
      e.preventDefault();

      if (drawing.isNull) return;

      const currentPosition = getMapCoord(e);
      const snappingCandidate = getSnappingCandidateIfEnabled(
        e,
        currentPosition,
        isSnapping,
        getSnappingCandidate,
      );
      const check = checkLoopedLinkConditions(
        drawing,
        snappingCandidate,
        currentPosition,
        map,
      );

      if (check.shouldPrevent) {
        return;
      }

      const { startNode, link } = drawing;

      const endJunction: NodeAsset | undefined = assetBuilder.buildJunction({
        label: "",
        coordinates: link.lastVertex,
        elevation: await fetchElevation(
          coordinatesToLngLat(link.lastVertex) as LngLat,
        ),
      });

      const submitParams = {
        startNode,
        startPressureLoggerId: drawing.startPressureLoggerId,
        startPipeId: drawing.startPipeId,
        link,
        endNode: endJunction,
      };
      onSubmitLink ? onSubmitLink(submitParams) : submitLink(submitParams);
      resetDrawing();
    },
    exit() {
      const currentDrawing = getDrawingState();

      setCursor("default");

      if (!currentDrawing.isNull) {
        if (sourceLink) {
          setEphemeralState({
            type: "drawLink",
            linkType,
            snappingCandidate: null,
            sourceLink,
          });
        } else {
          resetDrawing();
        }
      } else if (sourceLink) {
        resetDrawing();
        setMode({ mode: Mode.NONE });
      } else {
        resetDrawing();
        setMode({ mode: Mode.NONE });
      }
    },
    touchstart: (e) => {
      usingTouchEvents.current = true;
      e.preventDefault();
    },

    touchmove: (e) => {
      handlers.move(e);
    },

    touchend: (e) => {
      handlers.click(e);
    },

    down: (e) => {
      if (e.type === "mousedown") {
        usingTouchEvents.current = false;
      }
    },
    up: noop,
    keydown: () => {
      if (
        isEndAndContinueOn() &&
        !drawing.isNull &&
        !drawing.snappingCandidate
      ) {
        const draftJunction = assetBuilder.buildJunction({
          label: "",
          coordinates: drawing.link.lastVertex,
        });
        setDrawing({
          ...drawing,
          draftJunction,
        });
      }
    },
    keyup: () => {
      if (!isControlHeld() && !drawing.isNull) {
        setDrawing({
          ...drawing,
          draftJunction: undefined,
        });
      }
    },
  };

  return handlers;
}
