import { useCallback } from "react";
import { useAtomValue } from "jotai";
import type { AssetId, PumpDefinition } from "@epanet-js/hydraulic-model";
import { changePumpDefinitions } from "@epanet-js/hydraulic-model-operations";
import { useModelTransaction } from "src/hooks/persistence/use-model-transaction";
import { useIsEditionBlocked } from "src/hooks/use-is-edition-blocked";
import { stagingModelDerivedAtom } from "src/state/derived-branch-state";
import { modelFactoriesAtom } from "src/state/model-factories";

export const useSavePumpDefinitions = () => {
  const model = useAtomValue(stagingModelDerivedAtom);
  const { idPools } = useAtomValue(modelFactoriesAtom);
  const { transact } = useModelTransaction();
  const isEditionBlocked = useIsEditionBlocked();
  return useCallback(
    (definitions: PumpDefinition[], pumpId: AssetId, definitionId: string) => {
      if (isEditionBlocked) return false;
      return !!transact(() =>
        changePumpDefinitions(model, {
          definitions,
          assignment: { pumpId, definitionId },
          curveIds: idPools.forPool("curve"),
        }),
      );
    },
    [model, idPools, transact, isEditionBlocked],
  );
};
