import { useCallback } from "react";
import { getScripting } from "src/lib/scripting";
import { createAssetPanel } from "./asset-panel/create-panel";
import { createScriptsPanel } from "./scripts/create-panel";
import type { Panel } from "./panel";

export const useDefaultPanels = () => {
  return useCallback(
    (): Panel[] => [
      createAssetPanel(),
      ...(getScripting() ? [createScriptsPanel()] : []),
    ],
    [],
  );
};
