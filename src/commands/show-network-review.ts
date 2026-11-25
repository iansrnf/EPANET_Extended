import { useSetAtom, type Getter, type Setter } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback } from "react";
import { useUserTracking } from "src/infra/user-tracking";
import {
  networkReviewOpenAtom,
  selectedReviewCheckAtom,
} from "src/state/network-review";

export const useShowNetworkReview = () => {
  const setOpen = useSetAtom(networkReviewOpenAtom);
  const userTracking = useUserTracking();

  return useCallback(
    ({ source }: { source: "auto" }) => {
      userTracking.capture({ name: "networkReview.opened", source });
      setOpen(true);
    },
    [setOpen, userTracking],
  );
};

export const useSetNetworkReviewOpen = () => {
  const userTracking = useUserTracking();

  return useAtomCallback(
    useCallback(
      (get: Getter, set: Setter, open: boolean) => {
        if (open && !get(networkReviewOpenAtom)) {
          userTracking.capture({ name: "networkReview.opened", source: "map" });
        }
        set(networkReviewOpenAtom, open);
        if (!open) set(selectedReviewCheckAtom, null);
      },
      [userTracking],
    ),
  );
};
