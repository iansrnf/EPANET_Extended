import { useAtomValue } from "jotai";
import { useMediaQuery } from "react-responsive";
import { useId } from "react";
import { useToggleFlowAnimation } from "src/commands/toggle-flow-animation";
import { useTranslate } from "src/hooks/use-translate";
import { PauseIcon, PlayIcon, WaterFlowIcon } from "src/icons";
import { simulationResultsDerivedAtom } from "src/state/derived-branch-state";
import { flowAnimationEnabledAtom } from "src/state/map";
import { FlowAnimationColorsEditor } from "./flow-animation-colors-editor";
import { MapControlMenu } from "./map-control-menu";

export const FlowAnimationControl = () => {
  const translate = useTranslate();
  const descriptionId = useId();
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
    <div className="absolute bottom-[calc(var(--simulation-controls-height,0px)+1.5rem+var(--map-control-target-size))] left-2 z-20">
      <MapControlMenu
        label={translate("flowAnimation.title")}
        icon={<WaterFlowIcon size="lg" aria-hidden="true" />}
      >
        <button
          type="button"
          aria-label={disabled ? description : label}
          aria-describedby={descriptionId}
          aria-pressed={playing}
          disabled={disabled}
          className="flex min-h-[37.4px] w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-base-hover focus-visible:outline-2 focus-visible:outline-accent disabled:text-disabled pointer-coarse:min-h-11"
          onClick={() => toggle(playing)}
        >
          {playing ? (
            <PauseIcon aria-hidden="true" />
          ) : (
            <PlayIcon aria-hidden="true" />
          )}
          <span>
            {translate(
              playing
                ? "flowAnimation.pauseAction"
                : "flowAnimation.playAction",
            )}
          </span>
        </button>
        <FlowAnimationColorsEditor />
        <p id={descriptionId} className="mt-2 border-t px-2 pt-2 text-subtle">
          {description}
        </p>
      </MapControlMenu>
    </div>
  );
};
