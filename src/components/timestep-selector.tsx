import { useAtomValue } from "jotai";
import clsx from "clsx";
import { ChevronLeftIcon, ChevronRightIcon } from "src/icons";
import { simulationAtom } from "src/state/jotai";
import { Selector } from "./form/selector";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBreakpoint } from "src/hooks/use-breakpoint";
import { useChangeTimestep } from "src/commands/change-timestep";
import { getSimulationMetadata } from "src/simulation/epanet/simulation-metadata";

export const TimestepSelector = () => {
  const simulation = useAtomValue(simulationAtom);
  const { changeTimestep } = useChangeTimestep();
  const isSmOrLarger = useBreakpoint("sm");

  if (!isSmOrLarger) return null;
  if (simulation.status === "idle" || simulation.status === "running") return null;

  const { timestepCount, reportingTimeStep } = getSimulationMetadataValues(
    simulation.metadata,
  );
  const currentTimestepIndex = simulation.currentTimestepIndex ?? 0;

  if (timestepCount <= 1) return null;

  return (
    <TimestepSelectorUI
      currentTimestepIndex={currentTimestepIndex}
      timestepCount={timestepCount}
      reportTimestep={reportingTimeStep}
      onChangeTimestep={changeTimestep}
    />
  );
};

type ChangeTimestepSource = "buttons" | "dropdown";

type TimestepSelectorUIProps = {
  currentTimestepIndex: number;
  timestepCount: number;
  reportTimestep: number;
  onChangeTimestep: (index: number, source: ChangeTimestepSource) => void;
};

export const TimestepSelectorUI = ({
  currentTimestepIndex,
  timestepCount,
  reportTimestep,
  onChangeTimestep,
}: TimestepSelectorUIProps) => {
  const canGoPrevious = currentTimestepIndex > 0;
  const canGoNext = currentTimestepIndex < timestepCount - 1;

  // ===== Auto-next settings =====
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);

  // How fast should it auto-advance? (ms)
  // You can expose this via UI if you want.
  const AUTO_STEP_MS = 800;

  // Keep freshest values inside the timer without restarting it on every render.
  const latestIndexRef = useRef(currentTimestepIndex);
  const latestCountRef = useRef(timestepCount);
  const latestOnChangeRef = useRef(onChangeTimestep);

  useEffect(() => {
    latestIndexRef.current = currentTimestepIndex;
  }, [currentTimestepIndex]);

  useEffect(() => {
    latestCountRef.current = timestepCount;
  }, [timestepCount]);

  useEffect(() => {
    latestOnChangeRef.current = onChangeTimestep;
  }, [onChangeTimestep]);

  // Stop auto-play automatically if we hit the last timestep.
  useEffect(() => {
    if (isAutoPlaying && currentTimestepIndex >= timestepCount - 1) {
      setIsAutoPlaying(false);
    }
  }, [isAutoPlaying, currentTimestepIndex, timestepCount]);

  useEffect(() => {
    if (!isAutoPlaying) return;

    const id = window.setInterval(() => {
      const idx = latestIndexRef.current;
      const count = latestCountRef.current;

      // If we're at or past the last index, stop.
      if (idx >= count - 1) {
        setIsAutoPlaying(false);
        return;
      }

      // Move to next timestep.
      latestOnChangeRef.current(idx + 1, "buttons");
    }, AUTO_STEP_MS);

    return () => window.clearInterval(id);
  }, [isAutoPlaying]);
  // ===== end auto-next =====

  const options = useMemo(() => {
    return Array.from({ length: timestepCount }, (_, i) => ({
      label: formatTimestepTime(i, reportTimestep),
      value: String(i),
    }));
  }, [timestepCount, reportTimestep]);

  return (
    <div className="absolute top-3 right-3 flex items-center gap-1 p-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-black rounded-sm shadow-sm">
      {/* Auto-play toggle */}
      <button
        onClick={() => setIsAutoPlaying((v) => !v)}
        disabled={timestepCount <= 1}
        className={clsx(
          "h-[1.875rem] px-2 text-xs font-medium rounded-sm",
          "hover:bg-gray-200 dark:hover:bg-gray-800",
          "active:bg-gray-300 dark:active:bg-gray-600",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          isAutoPlaying ? "bg-gray-200 dark:bg-gray-800" : "bg-transparent",
        )}
        aria-label={isAutoPlaying ? "Pause auto-next" : "Start auto-next"}
        title={isAutoPlaying ? "Pause" : "Auto Next"}
      >
        {isAutoPlaying ? "⏸" : "▶"}
      </button>

      <button
        onClick={() => onChangeTimestep(currentTimestepIndex - 1, "buttons")}
        disabled={!canGoPrevious}
        className={clsx(
          "size-[1.875rem] p-1.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-l-sm",
          "active:bg-gray-300 dark:active:bg-gray-600",
          "disabled:opacity-40 disabled:active:bg-gray-200 disabled:cursor-not-allowed",
        )}
        aria-label="Previous timestep"
        title="Previous"
      >
        <ChevronLeftIcon />
      </button>

      <button
        onClick={() => onChangeTimestep(currentTimestepIndex + 1, "buttons")}
        disabled={!canGoNext}
        className={clsx(
          "size-[1.875rem] p-1.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-r-sm",
          "active:bg-gray-300 dark:active:bg-gray-600",
          "disabled:opacity-40 disabled:active:bg-gray-200 disabled:cursor-not-allowed",
        )}
        aria-label="Next timestep"
        title="Next"
      >
        <ChevronRightIcon />
      </button>

      <Selector
        options={options}
        selected={String(currentTimestepIndex)}
        onChange={(value) => onChangeTimestep(Number(value), "dropdown")}
        ariaLabel="Select timestep"
        styleOptions={{ paddingX: 1.5, paddingY: 1 }}
      />
    </div>
  );
};

function getSimulationMetadataValues(metadata: ArrayBuffer | undefined) {
  const simMetadata = getSimulationMetadata(metadata);
  return {
    timestepCount: simMetadata.reportingStepsCount,
    reportingTimeStep: simMetadata.reportingTimeStep,
  };
}

function formatTimestepTime(timestepIndex: number, intervalSeconds = 3600) {
  const totalSeconds = timestepIndex * intervalSeconds;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = hours.toString().padStart(2, "0");
  const mm = minutes.toString().padStart(2, "0");
  const ss = seconds.toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
