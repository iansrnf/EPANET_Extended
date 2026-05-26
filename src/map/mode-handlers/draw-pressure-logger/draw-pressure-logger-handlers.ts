import type { HandlerContext, Position } from "src/types";
import { ephemeralStateAtom, EphemeralEditingState } from "src/state/drawing";
import { cursorStyleAtom } from "src/state/map";
import { modeAtom, Mode } from "src/state/mode";
import noop from "lodash/noop";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useClickedAsset, useGetMapCoord } from "../utils";
import { modelFactoriesAtom } from "src/state/model-factories";
import { selectionAtom } from "src/state/selection";
import { useSelection } from "src/selection";
import { useModelTransaction } from "src/hooks/persistence/use-model-transaction";
import { useElevations } from "src/map/elevations/use-elevations";
import { addLink } from "src/hydraulic-model/model-operations";
import type { LinkAsset, NodeAsset } from "src/hydraulic-model";

export function useDrawPressureLoggerHandlers({
  hydraulicModel,
  map,
  units,
  readonly = false,
}: HandlerContext): Handlers {
  const setMode = useSetAtom(modeAtom);
  const [ephemeralState, setEphemeralState] = useAtom(ephemeralStateAtom);
  const setCursor = useSetAtom(cursorStyleAtom);
  const selection = useAtomValue(selectionAtom);
  const { assetFactory, labelManager, pressureLoggerFactory } =
    useAtomValue(modelFactoriesAtom);
  const { transact } = useModelTransaction();
  const { selectPressureLogger } = useSelection(selection);
  const { getClickedAsset } = useClickedAsset(map, hydraulicModel.assets);
  const getMapCoord = useGetMapCoord();
  const { fetchElevation } = useElevations(units.elevation);

  const resetDrawing = () => {
    setEphemeralState({ type: "none" });
    setCursor("default");
  };

  const getDrawing = () => {
    if (
      ephemeralState.type === "drawLink" &&
      ephemeralState.linkType === "pipe" &&
      ephemeralState.startNode
    ) {
      return {
        startNode: ephemeralState.startNode,
        link: ephemeralState.link as LinkAsset,
      };
    }
    return null;
  };

  const startDrawing = (startNode: NodeAsset) => {
    const pipe = assetFactory.createPipe({
      coordinates: [startNode.coordinates, startNode.coordinates],
    });

    setEphemeralState({
      type: "drawLink",
      linkType: "pipe",
      startNode,
      link: pipe,
      snappingCandidate: null,
    });
    setCursor("default");
  };

  const updatePreview = (coordinates: Position) => {
    const drawing = getDrawing();
    if (!drawing) return;

    const linkCopy = drawing.link.copy();
    linkCopy.setCoordinates([drawing.startNode.coordinates, coordinates]);

    setEphemeralState((prev: EphemeralEditingState) => {
      if (prev.type !== "drawLink") return prev;
      return {
        ...prev,
        link: linkCopy,
      };
    });
  };

  const finishDrawing = async (
    coordinates: Position,
    e: mapboxgl.MapMouseEvent | mapboxgl.MapTouchEvent,
  ) => {
    const drawing = getDrawing();
    if (!drawing) return;

    const pressureLogger = pressureLoggerFactory.create(coordinates);
    const helperJunction = assetFactory.createJunction({
      coordinates,
      elevation: await fetchElevation(e.lngLat),
      label: `${pressureLogger.label}_J`,
    });
    helperJunction.setProperty("visibility", false);
    helperJunction.setProperty("pressureLoggerId", pressureLogger.id);

    const linkCopy = drawing.link.copy();
    linkCopy.setCoordinates([drawing.startNode.coordinates, coordinates]);

    const linkMoment = addLink(hydraulicModel, {
      link: linkCopy,
      startNode: drawing.startNode,
      endNode: helperJunction,
      lengthUnit: units.length,
      assetFactory,
      labelManager,
    });

    transact({
      ...linkMoment,
      note: "Add pressure logger",
      putPressureLoggers: [
        pressureLogger.connect({ junctionId: helperJunction.id }),
      ],
    });
    selectPressureLogger(pressureLogger.id);
    resetDrawing();
  };

  return {
    click: (e) => {
      if (readonly) return;
      e.preventDefault();

      const drawing = getDrawing();
      if (drawing) {
        void finishDrawing(getMapCoord(e), e);
        return;
      }

      const clickedAsset = getClickedAsset(e);
      if (!clickedAsset || !clickedAsset.isNode) {
        return;
      }

      startDrawing(clickedAsset as NodeAsset);
    },
    move: (e) => {
      const drawing = getDrawing();
      if (!drawing) return;
      updatePreview(getMapCoord(e));
    },
    down: noop,
    up: noop,
    double: noop,
    exit() {
      resetDrawing();
      setMode({ mode: Mode.NONE });
    },
  };
}
