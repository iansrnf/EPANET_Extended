import { useSetAtom, type Getter, type Setter } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback } from "react";
import {
  collectionsOpenAtom,
  pendingCollectionDraftAtom,
} from "src/state/collections";

export const useShowCollections = () => {
  const setOpen = useSetAtom(collectionsOpenAtom);

  return useCallback(() => setOpen(true), [setOpen]);
};

export const useSetCollectionsOpen = () =>
  useAtomCallback(
    useCallback((_get: Getter, set: Setter, open: boolean) => {
      set(collectionsOpenAtom, open);
      if (!open) set(pendingCollectionDraftAtom, null);
    }, []),
  );
