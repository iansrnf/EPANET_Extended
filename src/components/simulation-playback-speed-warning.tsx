import { useAtomValue } from "jotai";
import { useTranslate } from "src/hooks/use-translate";
import { WarningIcon } from "src/icons";
import {
  currentSpeedWarningAtom,
  isPlayingAtom,
} from "src/state/simulation-playback";

export const SimulationPlaybackSpeedWarning = () => {
  const translate = useTranslate();
  const speedWarning = useAtomValue(currentSpeedWarningAtom);
  const isPlaying = useAtomValue(isPlayingAtom);

  if (!isPlaying || !speedWarning) return null;

  return (
    <div className="flex max-w-[16rem] items-start gap-1.5 rounded-sm border bg-panel/80 px-2 py-1 text-size-small shadow-md">
      <WarningIcon className="mt-px shrink-0 text-warning" />
      <span className="min-w-0 wrap-break-word">
        {translate(
          speedWarning === "slow"
            ? "playbackSpeedWarningSlow"
            : "playbackSpeedWarningTooFast",
        )}
      </span>
    </div>
  );
};
