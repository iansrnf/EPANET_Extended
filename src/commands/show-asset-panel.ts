import { useAtomCallback } from "jotai/utils";
import { useCallback } from "react";
import { useUserTracking } from "src/infra/user-tracking";
import { ASSET_PANEL_ID } from "src/panels/asset-panel/create-panel";
import { splitsAtom } from "src/state/layout";
import { placedPanelsAtom } from "src/state/panels";
import { useActivateAssetPanel } from "./activate-asset-panel";

export const useShowAssetPanel = () => {
  const activateAssetPanel = useActivateAssetPanel();
  const userTracking = useUserTracking();

  return useAtomCallback(
    useCallback(
      (
        get,
        set,
        { source }: { source: "draw" | "modelAttributesValidation" },
      ) => {
        userTracking.capture({ name: "assetPanel.opened", source });
        const dock = get(placedPanelsAtom).find(
          (entry) => entry.id === ASSET_PANEL_ID,
        )?.dock;
        if (dock && dock !== "floating") {
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
        activateAssetPanel();
      },
      [activateAssetPanel, userTracking],
    ),
  );
};
