import { useCallback } from "react";
import { useUserTracking } from "src/infra/user-tracking";
import { useSetAtom } from "jotai";
import { dialogAtom } from "src/state/dialog";
import { useEarlyAccess } from "src/hooks/use-early-access";

export const useOpenModelBuilderApi = () => {
  const userTracking = useUserTracking();
  const setDialogState = useSetAtom(dialogAtom);
  const onlyEarlyAccess = useEarlyAccess();

  const openModelBuilderApi = useCallback(
    ({ source }: { source: string }) => {
      onlyEarlyAccess(() => {
        userTracking.capture({
          name: "modelBuilder.opened",
          source: `${source}-api`,
        });

        setDialogState({ type: "modelBuilderApiIframe" });
      }, "modelBuilderApiIframe");
    },
    [userTracking, setDialogState, onlyEarlyAccess],
  );

  return openModelBuilderApi;
};
