import { useCallback } from "react";
import { useUserTracking } from "src/infra/user-tracking";
import { useSetAtom } from "jotai";
import { dialogAtom } from "src/state/dialog";
import { useStartBlankProject } from "src/hooks/persistence/use-start-new-project";
import { useUnsavedChangesCheck } from "./check-unsaved-changes";
import { contentViewAtom } from "src/state/content-view";
import { isModelBuilderEmbedded } from "src/global-config";

export const useOpenModelBuilder = () => {
  const userTracking = useUserTracking();
  const setDialogState = useSetAtom(dialogAtom);
  const checkUnsavedChanges = useUnsavedChangesCheck();
  const startBlankProject = useStartBlankProject();
  const setContentView = useSetAtom(contentViewAtom);

  const openModelBuilder = useCallback(
    ({ source }: { source: string }) => {
      const showModelBuilder = () => {
        userTracking.capture({
          name: "modelBuilder.opened",
          source,
        });
        setDialogState(null);
        setContentView({ type: "modelBuild", step: null });
      };

      if (!isModelBuilderEmbedded) {
        showModelBuilder();
        return;
      }

      checkUnsavedChanges(async () => {
        const started = await startBlankProject();
        if (!started) return;
        showModelBuilder();
      });
    },
    [
      userTracking,
      setDialogState,
      checkUnsavedChanges,
      startBlankProject,
      setContentView,
    ],
  );

  return openModelBuilder;
};
