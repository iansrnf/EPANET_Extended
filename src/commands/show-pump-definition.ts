import { useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import type { AssetId } from "@epanet-js/hydraulic-model";
import { dialogAtom } from "src/state/dialog";
import { stagingModelDerivedAtom } from "src/state/derived-branch-state";

export const useShowPumpDefinition = () => {
  const model = useAtomValue(stagingModelDerivedAtom);
  const setDialog = useSetAtom(dialogAtom);
  return useCallback(
    (pumpId: AssetId) => {
      if (model.assets.get(pumpId)?.type !== "pump") return;
      setDialog({ type: "pumpDefinition", pumpId });
    },
    [model.assets, setDialog],
  );
};
