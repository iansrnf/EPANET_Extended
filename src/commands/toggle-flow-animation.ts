import { useSetAtom } from "jotai";
import { useCallback } from "react";
import { flowAnimationEnabledAtom } from "src/state/map";

export const useToggleFlowAnimation = () => {
  const setEnabled = useSetAtom(flowAnimationEnabledAtom);
  return useCallback((playing: boolean) => setEnabled(!playing), [setEnabled]);
};
