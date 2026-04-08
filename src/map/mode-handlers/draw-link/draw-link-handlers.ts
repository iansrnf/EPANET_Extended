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
import { useUserTracking } from "src/infra/user-tracking";
import { LinkType } from "src/hydraulic-model";
import { useElevations } from "src/map/elevations/use-elevations";
import { LngLat, MapMouseEvent, MapTouchEvent } from "mapbox-gl";
import { useSelection } from "src/selection";
import { DEFAULT_SNAP_DISTANCE_PIXELS } from "../../search";
import { addLink } from "src/hydraulic-model/model-operations";
import { modelFactoriesAtom } from "src/state/model-factories";
import { PressureLogger } from "src/hydraulic-model/pressure-loggers";
import { useFeatureFlag } from "src/hooks/use-feature-flags";
import { useModelTransaction } from "src/hooks/persistence/use-model-transaction";

const PRESSURE_LOGGER_PICK_RADIUS = 24;
const PRESSURE_LOGGER_FALLBACK_PIXEL_RADIUS = 44;

export type SnappingCandidate =
  | NodeAsset
  | {
      type: "pipe";
      id: AssetId;
      coordinates: Position;
      vertexIndex: number | null;
    };

export type SubmitLinkParams = {
  startNode: NodeAsset;
  link: LinkAsset;
  endNode: NodeAsset;
  startPressureLoggerId?: number;
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
    snappingCandidate.type !== "pipe" &&
    snappingCandidate.id === drawing.startNode.id;

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
  const isStateRefactorOn = useFeatureFlag("FLAG_STATE_REFACTOR");
  const transactDeprecated = rep.useTransactDeprecated();
  const { transact: transactNew } = useModelTransaction();
  const transact = isStateRefactorOn ? transactNew : transactDeprecated;
  const userTracking = useUserTracking();
  const usingTouchEvents = useRef<boolean>(false);
  const { assetFactory, labelManager } = useAtomValue(modelFactoriesAtom);
  const lengthUnit = units.length;
  const { findSnappingCandidate } = useSnapping(map, hydraulicModel.assets);

  const { isShiftHeld, isControlHeld } = useKeyboardState();
  const setCursor = useSetAtom(cursorStyleAtom);
  const pipeDrawingDefaults = useAtomValue(pipeDrawingDefaultsAtom);

  const createLinkForType = (coordinates: Position[] = []) => {
    const startProperties = {
      label: "",
      coordinates,
    };
    switch (linkType) {
      case "pipe":
        return assetFactory.createPipe({
          ...startProperties,
          ...(pipeDrawingDefaults.diameter && {
            diameter: pipeDrawingDefaults.diameter,
          }),
          ...(pipeDrawingDefaults.roughness && {
            roughness: pipeDrawingDefaults.roughness,
          }),
        });
      case "pump":
        return assetFactory.createPump({
          ...startProperties,
          definitionType: "curve",
          curve: [{ x: 1, y: 1 }],
        });
      case "valve":
        return assetFactory.createValve(startProperties);
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
    link,
    endNode,
    startPressureLoggerId,
    endPressureLoggerId,
    startPipeId,
    endPipeId,
  }: {
    startNode: NodeAsset;
    link: LinkAsset;
    endNode: NodeAsset;
    startPressureLoggerId?: number;
    endPressureLoggerId?: number;
    startPipeId?: AssetId;
    endPipeId?: AssetId;
  }) => {
    const length = measureLength(link.feature);
    if (!length) {
      return;
    }

    const moment = addLink(hydraulicModel, {
      link: link,
      startNode,
      endNode,
      startPipeId,
      endPipeId,
      lengthUnit,
      assetFactory,
      labelManager,
    });

    const pressureLoggerUpdates: Record<number, NodeAsset> = {};
    if (startPressureLoggerId !== undefined) {
      pressureLoggerUpdates[startPressureLoggerId] = startNode;
    }
    if (endPressureLoggerId !== undefined) {
      pressureLoggerUpdates[endPressureLoggerId] = endNode;
    }

    const putPressureLoggers = Object.entries(pressureLoggerUpdates)
      .map(([pressureLoggerId, connectedNode]) => {
        const pressureLogger = hydraulicModel.pressureLoggers.get(
          Number(pressureLoggerId),
        );
        return pressureLogger?.connect({
          junctionId: connectedNode.id,
        });
      })
      .filter((logger): logger is PressureLogger => logger !== undefined);

    if (putPressureLoggers.length > 0) {
      moment.putPressureLoggers = [
        ...(moment.putPressureLoggers || []),
        ...putPressureLoggers,
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
    assetFactory.createJunction({
      label: "",
      coordinates,
      elevation,
    });

  const createHiddenJunction = (
    coordinates: Position,
    elevation: number,
    pressureLoggerId?: number,
  ) => {
    const junction = createJunction(coordinates, elevation);
    junction.setProperty("visibility", false);
    if (pressureLoggerId !== undefined) {
      junction.setProperty("pressureLoggerId", pressureLoggerId);
    }
    return junction;
  };

  const getClickedPressureLogger = (
    e: MapMouseEvent | MapTouchEvent,
  ): PressureLogger | null => {
    const pickedObjects = map.pickOverlayObjects({
      x: e.point.x,
      y: e.point.y,
      radius: PRESSURE_LOGGER_PICK_RADIUS,
    });

    for (const pickInfo of pickedObjects) {
      if (pickInfo.layer?.id === "pressure-loggers-layer" && pickInfo.object) {
        return pickInfo.object as PressureLogger;
      }
    }

    let nearestPressureLogger: PressureLogger | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const pressureLogger of hydraulicModel.pressureLoggers.values()) {
      const probeCoordinates: Position[] = [pressureLogger.coordinates];
      const backingJunctionId = pressureLogger.connection?.junctionId;
      if (backingJunctionId !== undefined) {
        const backingNode = hydraulicModel.assets.get(backingJunctionId);
        if (backingNode && backingNode.isNode) {
          probeCoordinates.push((backingNode as NodeAsset).coordinates);
        }
      }

      let loggerDistance = Number.POSITIVE_INFINITY;
      for (const coordinates of probeCoordinates) {
        const projected = map.map.project([coordinates[0], coordinates[1]]);
        const candidates = [
          { x: projected.x, y: projected.y },
          { x: projected.x, y: projected.y - 10 },
          { x: projected.x, y: projected.y - 14 },
          { x: projected.x, y: projected.y - 20 },
          { x: projected.x, y: projected.y - 24 },
          { x: projected.x, y: projected.y - 30 },
        ];

        for (const c of candidates) {
          const dx = c.x - e.point.x;
          const dy = c.y - e.point.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          loggerDistance = Math.min(loggerDistance, distance);
        }
      }

      if (loggerDistance <= PRESSURE_LOGGER_FALLBACK_PIXEL_RADIUS) {
        if (loggerDistance < nearestDistance) {
          nearestDistance = loggerDistance;
          nearestPressureLogger = pressureLogger;
        }
      }
    }

    return nearestPressureLogger;
  };

  const getOrCreatePressureLoggerJunction = async (
    pressureLogger: PressureLogger,
  ): Promise<{ node: NodeAsset; created: boolean }> => {
    const connectedJunctionId = pressureLogger.connection?.junctionId;
    if (connectedJunctionId !== undefined) {
      const connectedJunction = hydraulicModel.assets.get(connectedJunctionId);
      if (connectedJunction && connectedJunction.isNode) {
        return { node: connectedJunction as NodeAsset, created: false };
      }
    }

    const elevation = await fetchElevation(
      coordinatesToLngLat(pressureLogger.coordinates) as LngLat,
    );

    return {
      node: createHiddenJunction(
        pressureLogger.coordinates,
        elevation,
        pressureLogger.id,
      ),
      created: true,
    };
  };

  const handleSnappingClick = async (
    snappingCandidate: SnappingCandidate,
    clickPosition: Position,
    pointElevation: number,
  ) => {
    if (drawing.isNull) {
      if (snappingCandidate.type === "pipe") {
        const startNode = createJunction(
          snappingCandidate.coordinates,
          await fetchElevation(
            coordinatesToLngLat(snappingCandidate.coordinates) as LngLat,
          ),
        );
        startDrawing({
          startNode,
          startPipeId: snappingCandidate.id,
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
          snappingCandidate.type === "pipe"
            ? createJunction(clickPosition, pointElevation)
            : snappingCandidate,
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

        const clickedPressureLogger = getClickedPressureLogger(e);
        if (clickedPressureLogger) {
          const { node } = await getOrCreatePressureLoggerJunction(
            clickedPressureLogger,
          );

          if (!drawing.isNull && node.id === drawing.startNode.id) {
            return;
          }

          if (drawing.isNull) {
            startDrawing({
              startNode: node,
              startPressureLoggerId: clickedPressureLogger.id,
            });
            return;
          }

          const submitParams = {
            startNode: drawing.startNode,
            startPressureLoggerId: drawing.startPressureLoggerId,
            startPipeId: drawing.startPipeId,
            link: drawing.link,
            endNode: node,
            endPressureLoggerId: clickedPressureLogger.id,
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
          return;
        }

        if (!drawing.isNull) {
          const currentPosition = getMapCoord(e);
          const snappingCandidate = getSnappingCandidateIfEnabled(
            e,
            currentPosition,
            isSnapping,
            findSnappingCandidate,
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
          findSnappingCandidate,
        );
        const clickPosition = snappingCandidate
          ? snappingCandidate.coordinates
          : getMapCoord(e);
        const pointElevation =
          snappingCandidate && snappingCandidate.type !== "pipe"
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
        findSnappingCandidate,
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
          ? assetFactory.createJunction({
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

      const clickedPressureLogger = getClickedPressureLogger(e);
      if (clickedPressureLogger) {
        const { node } = await getOrCreatePressureLoggerJunction(
          clickedPressureLogger,
        );

        const submitParams = {
          startNode: drawing.startNode,
          startPressureLoggerId: drawing.startPressureLoggerId,
          startPipeId: drawing.startPipeId,
          link: drawing.link,
          endNode: node,
          endPressureLoggerId: clickedPressureLogger.id,
        };
        onSubmitLink ? onSubmitLink(submitParams) : submitLink(submitParams);
        resetDrawing();
        return;
      }

      const currentPosition = getMapCoord(e);
      const snappingCandidate = getSnappingCandidateIfEnabled(
        e,
        currentPosition,
        isSnapping,
        findSnappingCandidate,
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

      const endJunction = assetFactory.createJunction({
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
        const draftJunction = assetFactory.createJunction({
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
