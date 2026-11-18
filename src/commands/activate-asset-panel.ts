import { useAtomCallback } from "jotai/utils";
import { useCallback } from "react";
import { ASSET_PANEL_ID } from "src/panels/asset-panel/create-panel";
import { activePanelsAtom, placedPanelsAtom } from "src/state/panels";
import { splitsAtom } from "src/state/layout";
import { selectionAtom } from "src/state/selection";
import { selectedLoggerAtom } from "src/state/loggers";
import { USelection } from "src/selection";
import { useActivatePanel } from "./activate-panel";
import { useDeactivatePanel } from "./deactivate-panel";

export const useActivateAssetPanel = () => {
  const activatePanel = useActivatePanel();
  const deactivatePanel = useDeactivatePanel();

  return useAtomCallback(
    useCallback(
      (get, set) => {
        const dock = get(placedPanelsAtom).find(
          (entry) => entry.id === ASSET_PANEL_ID,
        )?.dock;
        if (!dock) return;

        if (dock === "floating") {
          const splits = get(splitsAtom);
          const active = get(activePanelsAtom);
          if (splits.rightOpen) deactivatePanel(active.right?.panel);
          if (splits.verticalOpen) deactivatePanel(active.vertical?.panel);
          set(splitsAtom, (previous) =>
            previous.rightOpen || previous.verticalOpen
              ? { ...previous, rightOpen: false, verticalOpen: false }
              : previous,
          );
        } else if (
          !USelection.isNone(get(selectionAtom)) ||
          get(selectedLoggerAtom)
        ) {
          const openKey =
            dock === "vertical"
              ? "verticalOpen"
              : dock === "bottom"
                ? "bottomOpen"
                : dock === "left"
                  ? "leftOpen"
                  : "rightOpen";
          set(splitsAtom, (previous) =>
            previous[openKey] ? previous : { ...previous, [openKey]: true },
          );
        }

        activatePanel(ASSET_PANEL_ID);
      },
      [activatePanel, deactivatePanel],
    ),
  );
};
