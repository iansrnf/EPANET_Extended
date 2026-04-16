import type { HandlerContext } from "src/types";
import { ephemeralStateAtom } from "src/state/drawing";
import { modeAtom, Mode } from "src/state/mode";
import noop from "lodash/noop";
import { useSetAtom, useAtomValue } from "jotai";
import { getMapCoord } from "../utils";
import { addPressureLogger } from "src/hydraulic-model/model-operations";
import { modelFactoriesAtom } from "src/state/model-factories";
import { selectionAtom } from "src/state/selection";
import { useSelection } from "src/selection";
import { useModelTransaction } from "src/hooks/persistence/use-model-transaction";

export function useDrawPressureLoggerHandlers({
  hydraulicModel,
  readonly = false,
}: HandlerContext): Handlers {
  const setMode = useSetAtom(modeAtom);
  const setEphemeralState = useSetAtom(ephemeralStateAtom);
  const selection = useAtomValue(selectionAtom);
  const { pressureLoggerFactory } = useAtomValue(modelFactoriesAtom);
  const { transact } = useModelTransaction();
  const { selectPressureLogger } = useSelection(selection);

  return {
    click: (e) => {
      if (readonly) return;

      const coordinates = getMapCoord(e);
      const moment = addPressureLogger(hydraulicModel, {
        coordinates,
        pressureLoggerFactory,
      });
      transact(moment);

      if (moment.putPressureLoggers && moment.putPressureLoggers.length > 0) {
        selectPressureLogger(moment.putPressureLoggers[0].id);
      }
    },
    move: noop,
    down: noop,
    up: noop,
    double: noop,
    exit() {
      setMode({ mode: Mode.NONE });
      setEphemeralState({ type: "none" });
    },
  };
}
