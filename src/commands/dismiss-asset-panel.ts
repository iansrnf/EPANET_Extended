import { useAtomCallback } from "jotai/utils";
import { useCallback } from "react";
import { USelection } from "src/selection";
import { selectedLoggerIdAtom } from "src/state/loggers";
import { loggerPreviewAtom } from "src/state/logger-map";
import { cursorStyleAtom } from "src/state/map";
import { Mode, modeAtom } from "src/state/mode";
import { selectionAtom } from "src/state/selection";

export const useDismissAssetPanel = () => {
  return useAtomCallback(
    useCallback((get, set) => {
      const loggerId = get(selectedLoggerIdAtom);
      if (loggerId !== null) {
        const preview = get(loggerPreviewAtom);
        if (
          preview &&
          preview.type !== "draw" &&
          preview.loggerId === loggerId
        ) {
          set(loggerPreviewAtom, null);
          set(cursorStyleAtom, "default");
        }
        if (get(modeAtom).mode === Mode.CONNECT_LOGGER) {
          set(modeAtom, { mode: Mode.NONE });
          set(cursorStyleAtom, "default");
        }
      }
      set(selectionAtom, USelection.none());
    }, []),
  );
};
