import { useAtomValue } from "jotai";
import { useMediaQuery } from "react-responsive";
import { Tooltip } from "@epanet-js/ui-kit";
import { useToggleFlowAnimation } from "src/commands/toggle-flow-animation";
import { useTranslate } from "src/hooks/use-translate";
import { PauseIcon, PlayIcon } from "src/icons";
import { simulationResultsDerivedAtom } from "src/state/derived-branch-state";
import { flowAnimationEnabledAtom } from "src/state/map";
import { FlowAnimationColorsEditor } from "./flow-animation-colors-editor";

export const FlowAnimationControl = () => {
  const translate = useTranslate();
  const enabled = useAtomValue(flowAnimationEnabledAtom);
  const results = useAtomValue(simulationResultsDerivedAtom);
  const toggle = useToggleFlowAnimation();
  const reducedMotion = useMediaQuery({
    query: "(prefers-reduced-motion: reduce)",
  });
  const playing = (enabled ?? !reducedMotion) && !!results;
  const disabled = !results;
  const label = translate(
    playing ? "flowAnimation.pause" : "flowAnimation.play",
  );
  const description = translate(
    !results
      ? "flowAnimation.needsSimulation"
      : reducedMotion && enabled === null
        ? "flowAnimation.reducedMotion"
        : "flowAnimation.description",
  );

  return (
    <div
      className="absolute bottom-24 left-2 z-10 flex items-center rounded-xl border bg-popover shadow-lg"
      onKeyDown={(event) => event.stopPropagation()}
      onKeyPress={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
    >
      <Tooltip content={description} side="top">
        <button
          type="button"
          aria-label={disabled ? description : label}
          aria-pressed={playing}
          disabled={disabled}
          className="flex min-h-11 items-center gap-2 rounded-l-xl px-3 text-size-small text-default hover:bg-base-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:text-disabled"
          onClick={() => toggle(playing)}
        >
          {playing ? (
            <PauseIcon aria-hidden="true" />
          ) : (
            <PlayIcon aria-hidden="true" />
          )}
          <span>{translate("flowAnimation.title")}</span>
          <span className="text-subtle">
            {translate(
              playing
                ? "flowAnimation.pauseAction"
                : "flowAnimation.playAction",
            )}
          </span>
        </button>
      </Tooltip>
      <div className="h-6 border-l" aria-hidden="true" />
      <FlowAnimationColorsEditor />
    </div>
  );
};
