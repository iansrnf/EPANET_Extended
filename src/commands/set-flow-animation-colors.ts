import { useSetAtom } from "jotai";
import { useCallback } from "react";
import { isValidFlowColors } from "src/map/overlays/flow-animation-colors";
import { flowAnimationColorsAtom } from "src/state/flow-animation";

export const useSetFlowAnimationColors = () => {
  const setColors = useSetAtom(flowAnimationColorsAtom);
  return useCallback(
    (colors: readonly string[]) => {
      if (isValidFlowColors(colors)) setColors(colors);
    },
    [setColors],
  );
};
