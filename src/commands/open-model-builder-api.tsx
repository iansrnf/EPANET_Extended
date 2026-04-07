import { useCallback } from "react";
import { useUserTracking } from "src/infra/user-tracking";
import { useSetAtom } from "jotai";
import { dialogAtom } from "src/state/dialog";

export const useOpenModelBuilderApi = () => {
  const userTracking = useUserTracking();
  const setDialogState = useSetAtom(dialogAtom);

  const openModelBuilderApi = useCallback(
    ({ source }: { source: string }) => {
      userTracking.capture({
        name: "modelBuilder.opened",
        source: `${source}-api`,
      });

      setDialogState({ type: "modelBuilderApiIframe" });
    },
    [userTracking, setDialogState],
  );

  return openModelBuilderApi;
};
