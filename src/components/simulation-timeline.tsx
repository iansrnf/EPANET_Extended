import {
  useCallback,
  forwardRef,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { useAtomValue } from "jotai";
import { Tooltip } from "@epanet-js/ui-kit";
import * as Popover from "@radix-ui/react-popover";
import clsx from "clsx";
import { useRunSimulation } from "src/commands/run-simulation";
import { useShowSimulationSettings } from "src/commands/show-simulation-settings";
import { useShowReport } from "src/commands/show-report";
import { useChangeTimestep } from "src/commands/change-timestep";
import { useTogglePlayback } from "src/commands/toggle-playback";
import { useChangeSimulationTimeline } from "src/commands/change-simulation-timeline";
import { useLocale } from "src/hooks/use-locale";
import { useTranslate } from "src/hooks/use-translate";
import { useUserTracking } from "src/infra/user-tracking";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  FileTextIcon,
  PauseIcon,
  PlaybackSpeedIcon,
  PlayIcon,
  RefreshIcon,
  RunSimulationIcon,
  SettingsIcon,
} from "src/icons";
import {
  formatTimelineTime,
  getTimelineDate,
  getTimelineIndexAtPosition,
  getTimelineProgress,
  getTimelineProgressAtPosition,
  getTimelineTicks,
} from "src/lib/simulation-timeline";
import { inferSimulationTimingPreset } from "src/lib/simulation-timing-presets";
import {
  simulationPreviewStepAtom,
  simulationStartDateTimeAtom,
} from "src/state/simulation-timeline";
import { hasScenariosAtom } from "src/state/scenarios";
import type { EPSResultsReader } from "src/simulation";
import {
  simulationDerivedAtom,
  simulationSettingsDerivedAtom,
} from "src/state/derived-branch-state";
import {
  simulationStepAtom,
  simulationStepTransitionDurationAtom,
} from "src/state/simulation";
import {
  isPlayingAtom,
  simulationPlaybackAtom,
  type PlaybackSpeed,
} from "src/state/simulation-playback";
import { SimulationCalendar } from "./simulation-calendar";
import { Button } from "./elements";
import { ScenarioSwitcher } from "./footer";
import { ModelSettingsSummary } from "./model-settings-summary";
import {
  SimulationStatusBadge,
  SimulationStatusText,
} from "./simulation-status";

export const SimulationTimeline = ({
  onHeightChange,
}: {
  onHeightChange?: (height: number) => void;
}) => {
  const translate = useTranslate();
  const { locale } = useLocale();
  const simulation = useAtomValue(simulationDerivedAtom);
  const settings = useAtomValue(simulationSettingsDerivedAtom);
  const simulationStep = useAtomValue(simulationStepAtom);
  const stepTransitionDuration = useAtomValue(
    simulationStepTransitionDurationAtom,
  );
  const isPlaying = useAtomValue(isPlayingAtom);
  const { playbackSpeed } = useAtomValue(simulationPlaybackAtom);
  const runSimulation = useRunSimulation();
  const showSettings = useShowSimulationSettings();
  const showReport = useShowReport();
  const { changeTimestep, goToPreviousTimestep, goToNextTimestep } =
    useChangeTimestep();
  const { togglePlayback, stopPlayback, changePlaybackSpeed } =
    useTogglePlayback();
  const { changeStartDateTime, changeTimingPreset, changePreviewStep } =
    useChangeSimulationTimeline();
  const fromTimestamp = useAtomValue(simulationStartDateTimeAtom);
  const previewStep = useAtomValue(simulationPreviewStepAtom);
  const hasScenarios = useAtomValue(hasScenariosAtom);
  const timingReadonly = hasScenarios;
  const userTracking = useUserTracking();
  const [trackElement, setTrackElement] = useState<HTMLElement | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const selectorRef = useRef<HTMLSpanElement | null>(null);
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    target: HTMLDivElement;
  } | null>(null);
  const fromDate = new Date(fromTimestamp);
  const reader =
    "epsResultsReader" in simulation ? simulation.epsResultsReader : undefined;
  const hasResults =
    !!reader && reader.timestepCount > 1 && simulationStep !== null;
  const runStartTimestamp =
    reader && "startTimestamp" in simulation
      ? (simulation.startTimestamp ??
        getLegacyRunStartTimestamp(reader, fromTimestamp))
      : reader
        ? getLegacyRunStartTimestamp(reader, fromTimestamp)
        : fromTimestamp;
  const startDate = new Date(
    runStartTimestamp +
      (reader && "reportingStartTime" in simulation
        ? (simulation.reportingStartTime ?? 0) * 1000
        : 0),
  );
  const previewDuration = settings.timing.duration || 86400;
  const intervalSeconds = hasResults
    ? reader.reportingTimeStep
    : Math.min(settings.timing.reportTimestep || 3600, previewDuration);
  const timestepCount = hasResults
    ? reader.timestepCount
    : Math.max(2, Math.floor(previewDuration / intervalSeconds) + 1);
  const currentIndex = Math.max(
    0,
    Math.min(
      hasResults ? (simulationStep ?? 0) : previewStep,
      timestepCount - 1,
    ),
  );
  const running = simulation.status === "running";
  const canSeek = !running;
  const canPlay = hasResults && !running;
  const transitionDuration =
    canPlay && dragProgress === null ? stepTransitionDuration : 0;
  const lastIndex = timestepCount - 1;
  const progress =
    dragProgress ?? getTimelineProgress(currentIndex, timestepCount);
  const progressPosition = `${progress * 100}%`;
  const selectorCursor =
    dragProgress === null ? "cursor-pointer" : "cursor-grabbing";
  const currentDate = getTimelineDate(startDate, currentIndex, intervalSeconds);
  const elapsedSeconds = currentIndex * intervalSeconds;
  const clockTime = formatDateClock(currentDate);
  const endTime = formatTimelineTime(
    Math.max(0, timestepCount - 1) * intervalSeconds,
  );
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(currentDate);
  const speedLabel = translate(
    playbackSpeed === "x4"
      ? "playbackSpeedX4"
      : playbackSpeed === "x2"
        ? "playbackSpeedX2"
        : "playbackSpeedAuto",
  );
  const ticks = getTimelineTicks(
    timestepCount,
    intervalSeconds,
    Math.min(
      13,
      Math.max(
        2,
        Math.floor(
          trackWidth /
            Math.max(64, Math.max(endTime.length, clockTime.length) * 8 + 20),
        ) + 1,
      ),
    ),
  );
  const seek = (index: number) => {
    if (!canSeek) return;
    stopPlayback("timeline");
    const nextIndex = Math.max(0, Math.min(lastIndex, Math.round(index)));
    if (hasResults) changeTimestep(nextIndex, "timeline");
    else changePreviewStep(nextIndex, timestepCount);
  };
  const clearDrag = useCallback((resetProgress = true) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (resetProgress) setDragProgress(null);
    if (drag?.target.hasPointerCapture(drag.pointerId))
      drag.target.releasePointerCapture(drag.pointerId);
  }, []);

  useLayoutEffect(() => {
    clearDrag();
  }, [
    reader,
    fromTimestamp,
    intervalSeconds,
    timestepCount,
    canSeek,
    clearDrag,
  ]);

  useLayoutEffect(() => () => clearDrag(false), [clearDrag]);

  useLayoutEffect(() => {
    if (!trackElement) return;
    const observer = new ResizeObserver(([entry]) => {
      setTrackWidth(entry.contentRect.width);
      onHeightChange?.(Math.ceil(trackElement.getBoundingClientRect().height));
    });
    observer.observe(trackElement);
    return () => observer.disconnect();
  }, [trackElement, onHeightChange]);

  return (
    <section
      ref={setTrackElement}
      aria-label={translate("simulationTimeline.title")}
      data-has-scenarios={hasScenarios || undefined}
      className="simulation-timeline map-overlay-theme pointer-events-none absolute inset-x-0 bottom-6 z-20 px-2 py-2 text-default"
      onKeyDown={(event) => event.stopPropagation()}
      onKeyPress={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div
        className="grid items-center gap-x-2 gap-y-1"
        style={{
          gridTemplateColumns: `var(--simulation-timeline-columns, ${
            trackWidth >= 768
              ? "minmax(0, 1fr) auto minmax(0, 1fr)"
              : "minmax(0, 1fr)"
          })`,
        }}
      >
        <div className="simulation-timeline-actions map-overlay-surface flex min-w-0 flex-wrap items-center justify-self-start gap-1 rounded-lg px-1 py-0.5">
          <SimulationIconButton
            label={translate("simulate")}
            primary
            disabled={running}
            aria-busy={running}
            onClick={() => {
              userTracking.capture({
                name: "simulation.executed",
                source: "toolbar",
                qualityType: settings.qualitySimulationType,
              });
              void runSimulation();
            }}
          >
            {running ? (
              <RefreshIcon
                size="lg"
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
            ) : (
              <RunSimulationIcon size="lg" aria-hidden="true" />
            )}
          </SimulationIconButton>
          <SimulationStatusBadge />
          <SimulationSettingsMenu
            running={running}
            hasScenarios={hasScenarios}
            onShowSettings={() => showSettings({ source: "toolbar" })}
          />
          <SimulationIconButton
            label={translate("viewReport")}
            disabled={running || !("report" in simulation)}
            onClick={() => showReport({ source: "toolbar" })}
          >
            <FileTextIcon size="lg" aria-hidden="true" />
          </SimulationIconButton>
          <span aria-hidden="true" className="mx-1 h-4 border-l" />
          <SimulationIconButton
            label={translate(isPlaying ? "pausePlayback" : "playSimulation")}
            active={isPlaying}
            disabled={!canPlay}
            aria-pressed={isPlaying}
            onClick={() => togglePlayback("buttons")}
          >
            {isPlaying ? (
              <PauseIcon size="lg" aria-hidden="true" />
            ) : (
              <PlayIcon size="lg" aria-hidden="true" />
            )}
          </SimulationIconButton>
          <SimulationIconButton
            label={`${translate("selectPlaybackSpeed")}: ${speedLabel}`}
            disabled={!canPlay}
            onClick={() => {
              const speeds: PlaybackSpeed[] = ["auto", "x2", "x4"];
              changePlaybackSpeed(
                speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length],
              );
            }}
          >
            <PlaybackSpeedIcon size="lg" aria-hidden="true" />
          </SimulationIconButton>
          <output className="w-5 text-size-small tabular-nums text-subtle">
            {speedLabel}
          </output>
          {hasScenarios && <ScenarioSwitcher compact />}
        </div>
        <div className="map-overlay-surface mx-auto flex min-w-0 max-w-full items-center justify-center gap-1 rounded-lg px-1 py-0.5">
          <SimulationIconButton
            label={translate("previousTimestep")}
            disabled={!canSeek || currentIndex === 0}
            onClick={() => {
              if (hasResults) goToPreviousTimestep("buttons");
              else seek(currentIndex - 1);
            }}
          >
            <ChevronLeftIcon aria-hidden="true" />
          </SimulationIconButton>
          <SimulationCalendar
            startDate={startDate}
            fromDate={fromDate}
            onStartDateChange={changeStartDateTime}
            currentTimestepIndex={currentIndex}
            timestepCount={timestepCount}
            intervalSeconds={intervalSeconds}
            durationSeconds={previewDuration}
            hasResults={hasResults}
            timingPreset={inferSimulationTimingPreset(settings.timing).preset}
            onTimingPresetChange={changeTimingPreset}
            timingReadonly={timingReadonly}
            disabled={running}
            onOpen={() => stopPlayback("calendar")}
            onSelectTimestep={(index) => {
              stopPlayback("calendar");
              if (hasResults) changeTimestep(index, "calendar");
              else changePreviewStep(index, timestepCount);
            }}
          />
          <SimulationIconButton
            label={translate("nextTimestep")}
            disabled={!canSeek || currentIndex === lastIndex}
            onClick={() => {
              if (hasResults) goToNextTimestep("buttons");
              else seek(currentIndex + 1);
            }}
          >
            <ChevronRightIcon aria-hidden="true" />
          </SimulationIconButton>
        </div>
        {trackWidth >= 768 && (
          <output className="map-overlay-surface justify-self-end rounded-md px-2 py-1 text-right text-size-small tabular-nums text-subtle">
            {formatTimelineTime(elapsedSeconds)} / {endTime}
          </output>
        )}
      </div>
      <div
        role="slider"
        aria-label={translate("simulationTimeline.seek")}
        aria-valuemin={0}
        aria-valuemax={lastIndex}
        aria-valuenow={currentIndex}
        aria-valuetext={`${dateLabel}, ${clockTime}`}
        aria-disabled={!canSeek}
        aria-orientation="horizontal"
        tabIndex={canSeek ? 0 : -1}
        className="map-overlay-surface map-overlay-ruler pointer-events-none relative mt-2 h-16 w-full touch-none select-none overflow-hidden rounded-lg text-size-small tabular-nums outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
        onPointerDown={(event) => {
          if (!canSeek || event.button !== 0 || dragRef.current) return;
          const bounds = rulerRef.current?.getBoundingClientRect();
          if (!bounds || bounds.width <= 0) return;
          event.preventDefault();
          const isSelector =
            event.target instanceof Element &&
            event.target.closest("[data-timeline-selector]") !== null;
          const selectorBounds = selectorRef.current?.getBoundingClientRect();
          const offsetX =
            isSelector && selectorBounds
              ? event.clientX - (selectorBounds.left + selectorBounds.width / 2)
              : 0;
          const pointerX = event.clientX - offsetX;
          dragRef.current = {
            pointerId: event.pointerId,
            offsetX,
            target: event.currentTarget,
          };
          setDragProgress(
            getTimelineProgressAtPosition(pointerX, bounds.left, bounds.width),
          );
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          seek(
            getTimelineIndexAtPosition(
              pointerX,
              bounds.left,
              bounds.width,
              timestepCount,
            ),
          );
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const bounds = rulerRef.current?.getBoundingClientRect();
          if (!bounds || bounds.width <= 0) return;
          const pointerX = event.clientX - drag.offsetX;
          setDragProgress(
            getTimelineProgressAtPosition(pointerX, bounds.left, bounds.width),
          );
          seek(
            getTimelineIndexAtPosition(
              pointerX,
              bounds.left,
              bounds.width,
              timestepCount,
            ),
          );
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const bounds = rulerRef.current?.getBoundingClientRect();
          if (bounds && bounds.width > 0)
            seek(
              getTimelineIndexAtPosition(
                event.clientX - drag.offsetX,
                bounds.left,
                bounds.width,
                timestepCount,
              ),
            );
          clearDrag();
        }}
        onPointerCancel={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return;
          clearDrag();
        }}
        onLostPointerCapture={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return;
          clearDrag();
        }}
        onKeyDown={(event) => {
          const timestepByKey: Record<string, number> = {
            ArrowRight: currentIndex + 1,
            ArrowUp: currentIndex + 1,
            ArrowLeft: currentIndex - 1,
            ArrowDown: currentIndex - 1,
            Home: 0,
            End: lastIndex,
            PageUp: currentIndex + Math.max(1, Math.round(lastIndex / 10)),
            PageDown: currentIndex - Math.max(1, Math.round(lastIndex / 10)),
          };
          const nextIndex = timestepByKey[event.key];
          if (nextIndex === undefined) return;
          event.preventDefault();
          event.stopPropagation();
          seek(nextIndex);
        }}
      >
        <div
          ref={rulerRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 inset-x-2"
        >
          <div
            aria-hidden="true"
            className={clsx("absolute inset-x-0 top-5 h-11", selectorCursor)}
            style={{ pointerEvents: canSeek ? "auto" : "none" }}
          />
          {ticks.map((tick) => (
            <span
              key={tick.index}
              className="pointer-events-none absolute top-0 h-10"
              style={{
                left: `${getTimelineProgress(tick.index, timestepCount) * 100}%`,
              }}
            >
              <span
                className="absolute top-1 whitespace-nowrap font-medium text-default"
                style={{
                  transform:
                    tick.index === 0
                      ? "none"
                      : tick.index === lastIndex
                        ? "translateX(-100%)"
                        : "translateX(-50%)",
                }}
              >
                {formatDateClock(
                  getTimelineDate(startDate, tick.index, intervalSeconds),
                )}
              </span>
              <span
                className="absolute top-[26px] h-3 w-0.5 -translate-x-1/2 rounded-full"
                style={{ backgroundColor: timelineTrackColor }}
              />
            </span>
          ))}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-8 h-1 rounded-full"
            style={{
              backgroundColor: timelineTrackColor,
              boxShadow: "0 0 0 1px var(--timeline-outline-color)",
            }}
          />
          <div
            aria-hidden="true"
            className={clsx(
              "pointer-events-none absolute left-0 top-8 h-1 rounded-full ease-linear motion-reduce:transition-none",
              transitionDuration > 0 ? "transition-[width]" : "transition-none",
            )}
            style={{
              width: progressPosition,
              backgroundColor: "var(--timeline-active-color)",
              boxShadow: "0 0 0 2px var(--timeline-outline-color)",
              transitionDuration: `${transitionDuration}ms`,
            }}
          />
          <span
            aria-hidden="true"
            data-timeline-selector
            className={clsx(
              "absolute top-5 h-11 w-11 -translate-x-1/2 ease-linear motion-reduce:transition-none",
              selectorCursor,
              transitionDuration > 0 ? "transition-[left]" : "transition-none",
            )}
            style={{
              left: `clamp(22px, ${progressPosition}, calc(100% - 22px))`,
              pointerEvents: canSeek ? "auto" : "none",
              transitionDuration: `${transitionDuration}ms`,
            }}
          />
          <span
            ref={selectorRef}
            aria-hidden="true"
            data-timeline-selector
            className={clsx(
              "absolute top-10 h-3.5 w-3.5 origin-top -translate-x-1/2 scale-105 ease-linear motion-reduce:transition-none",
              selectorCursor,
              transitionDuration > 0 ? "transition-[left]" : "transition-none",
            )}
            style={{
              left: progressPosition,
              filter:
                "drop-shadow(0 0 1px var(--timeline-outline-color)) drop-shadow(0 1px 1px var(--timeline-outline-color))",
              pointerEvents: canSeek ? "auto" : "none",
              transitionDuration: `${transitionDuration}ms`,
            }}
          >
            <span
              className="pointer-events-none block h-full w-full"
              style={{
                backgroundColor: "var(--timeline-active-color)",
                clipPath: "polygon(50% 0, 100% 45%, 100% 100%, 0 100%, 0 45%)",
              }}
            />
          </span>
        </div>
      </div>
    </section>
  );
};

const timelineTrackColor = "var(--timeline-track-color)";

const legacyRunStartTimestamps = new WeakMap<EPSResultsReader, number>();

const getLegacyRunStartTimestamp = (
  reader: EPSResultsReader,
  fallbackTimestamp: number,
) => {
  const existing = legacyRunStartTimestamps.get(reader);
  if (existing !== undefined) return existing;
  legacyRunStartTimestamps.set(reader, fallbackTimestamp);
  return fallbackTimestamp;
};

const formatDateClock = (date: Date) =>
  formatTimelineTime(
    date.getHours() * 3600 +
      date.getMinutes() * 60 +
      date.getSeconds() +
      date.getMilliseconds() / 1000,
  );

const SimulationSettingsMenu = ({
  running,
  hasScenarios,
  onShowSettings,
}: {
  running: boolean;
  hasScenarios: boolean;
  onShowSettings: () => void;
}) => {
  const translate = useTranslate();
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const openingDialog = useRef(false);
  const titleId = useId();

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <SimulationIconButton
          ref={setTrigger}
          label={translate("modelSettings.title")}
          active={open}
        >
          <SettingsIcon size="lg" aria-hidden="true" />
        </SimulationIconButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          collisionBoundary={
            trigger?.closest(".drawing-toolbar-controls") ?? undefined
          }
          aria-labelledby={titleId}
          className="map-overlay-theme map-overlay-surface map-overlay-popover z-30 flex w-72 flex-col overflow-hidden rounded-lg border p-3 shadow-xl outline-none"
          style={{
            maxWidth:
              "min(calc(100vw - 1.5rem), var(--radix-popover-content-available-width))",
            maxHeight: "var(--radix-popover-content-available-height)",
          }}
          onCloseAutoFocus={(event) => {
            if (openingDialog.current) {
              event.preventDefault();
              openingDialog.current = false;
            }
          }}
          onKeyDown={(event) => event.stopPropagation()}
          onKeyPress={(event) => event.stopPropagation()}
          onKeyUp={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
            <h2
              id={titleId}
              className="text-size-small font-semibold text-accent"
            >
              {translate("modelSettings.title")}
            </h2>
            <Popover.Close asChild>
              <button
                type="button"
                aria-label={translate("modelSettings.close")}
                className="-mr-1 flex h-8 w-8 items-center justify-center rounded-sm hover:bg-base-hover focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 pointer-coarse:w-11"
              >
                <CloseIcon size="sm" aria-hidden="true" />
              </button>
            </Popover.Close>
          </div>
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
            <ModelSettingsSummary />
            <div className="border-t pt-3">
              <SimulationStatusText />
            </div>
            {!hasScenarios && (
              <div className="border-t pt-3 empty:hidden">
                <ScenarioSwitcher />
              </div>
            )}
            <Button
              type="button"
              size="sm"
              className="w-full shrink-0 justify-center pointer-coarse:min-h-11"
              disabled={running}
              onClick={() => {
                openingDialog.current = true;
                setOpen(false);
                onShowSettings();
              }}
            >
              {translate("modelSettings.openSimulationSettings")}
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

const SimulationIconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    primary?: boolean;
    active?: boolean;
    children: ReactNode;
  }
>(
  (
    { label, primary = false, active = false, children, className, ...props },
    ref,
  ) => (
    <Tooltip
      content={label}
      side="top"
      sideOffset={8}
      zIndex={50}
      className="map-overlay-theme map-overlay-surface map-overlay-tooltip"
    >
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={clsx(
          "group pointer-events-auto flex h-[var(--map-control-target-size)] w-[var(--map-control-target-size)] shrink-0 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40",
          className,
        )}
        {...props}
      >
        <span
          className={clsx(
            "flex h-[var(--map-control-face-size)] w-[var(--map-control-face-size)] items-center justify-center rounded-sm transition-colors [&_svg]:h-[var(--map-control-icon-size)] [&_svg]:w-[var(--map-control-icon-size)]",
            primary
              ? "bg-accent text-default-inverse shadow-sm group-hover:brightness-110"
              : active
                ? "bg-accent-tint text-accent"
                : "text-default group-hover:bg-base-hover",
          )}
        >
          {children}
        </span>
      </button>
    </Tooltip>
  ),
);
