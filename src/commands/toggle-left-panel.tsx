import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useDeactivatePanel } from "src/commands/deactivate-panel";
import { useUserTracking } from "src/infra/user-tracking";
import { panelTrackingName } from "src/panels/panel";
import { activePanelIn, panelsIn } from "src/state/panels";
import { defaultSplits, splitsAtom } from "src/state/layout";

export const toggleLeftPanelShortcut = "ctrl+b";

export const useToggleLeftPanel = () => {
  const setSplits = useSetAtom(splitsAtom);
  const splits = useAtomValue(splitsAtom);
  const activeLeftPanel = useAtomValue(activePanelIn("left"));
  const hasLeftPanels = useAtomValue(panelsIn("left")).length > 0;
  const deactivatePanel = useDeactivatePanel();
  const userTracking = useUserTracking();

  const toggleLeftPanel = useCallback(
    ({ source }: { source: "toolbar" | "shortcut" }) => {
      if (!hasLeftPanels && !splits.leftOpen) return;
      if (splits.leftOpen) {
        deactivatePanel(activeLeftPanel?.panel);
      }
      const newOpen = !splits.leftOpen;
      setSplits((s) => ({ ...s, leftOpen: newOpen, left: defaultSplits.left }));
      userTracking.capture({
        name: "leftPanel.toggled",
        open: newOpen,
        activePanelType: activeLeftPanel
          ? panelTrackingName(activeLeftPanel.panel)
          : null,
        source,
      });
    },
    [
      splits.leftOpen,
      activeLeftPanel,
      hasLeftPanels,
      deactivatePanel,
      setSplits,
      userTracking,
    ],
  );

  return toggleLeftPanel;
};
