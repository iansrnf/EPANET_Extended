import { useAtomCallback } from "jotai/utils";
import { useCallback } from "react";
import { useShowCollections } from "src/commands/show-collections";
import { useFeatureLock } from "src/components/form/paywall";
import { usePermissions } from "src/hooks/use-permissions";
import { useUserTracking } from "src/infra/user-tracking";
import type { CollectionDraft } from "src/lib/collections";
import {
  collectionsOpenAtom,
  pendingCollectionDraftAtom,
} from "src/state/collections";

export const useStartCollectionDraft = () => {
  const showCollections = useShowCollections();
  const userTracking = useUserTracking();
  const { canManageCollections } = usePermissions();
  const { openPaywall } = useFeatureLock("selectionSets");

  return useAtomCallback(
    useCallback(
      (get, set, draft: CollectionDraft) => {
        const { kind, source } = draft;
        if (kind === "selectionSets") {
          userTracking.capture({
            name: "selectionSet.draftStarted",
            source,
            canManageCollections,
          });
        } else {
          userTracking.capture({
            name: "bookmark.draftStarted",
            source,
            canManageCollections,
          });
        }

        if (!canManageCollections) {
          if (get(collectionsOpenAtom)) return openPaywall();

          showCollections();
          return;
        }

        showCollections();
        set(pendingCollectionDraftAtom, draft);
      },
      [showCollections, userTracking, canManageCollections, openPaywall],
    ),
  );
};
