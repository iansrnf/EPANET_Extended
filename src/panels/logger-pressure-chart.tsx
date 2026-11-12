import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAtomValue } from "jotai";
import ReactECharts from "echarts-for-react/lib/core";
import type { EChartsInstance } from "echarts-for-react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import clsx from "clsx";
import { Button } from "src/components/elements";
import { useChangeTimestep } from "src/commands/change-timestep";
import { useTogglePlayback } from "src/commands/toggle-playback";
import { useLocale } from "src/hooks/use-locale";
import { useTranslate } from "src/hooks/use-translate";
import { MaximizeIcon, PauseIcon, PlayIcon, RefreshIcon } from "src/icons";
import type {
  LoggerHistoryInterval,
  LoggerHistoryMode,
  LoggerHistoryRange,
} from "src/lib/logger-history";
import type { LoggerPressureComparison } from "src/lib/logger-comparison";
import {
  buildLoggerPlaybackTimeline,
  getLoggerPlaybackStep,
  getLoggerPlaybackTimestamp,
  type LoggerPlaybackTimeline,
} from "src/lib/logger-comparison/playback";
import { formatTimestepTime } from "src/lib/format-timestep-time";
import { simulationStepAtom } from "src/state/simulation";
import { isPlayingAtom } from "src/state/simulation-playback";
import {
  MAX_LOGGER_PRESSURE_SAMPLES,
  formatLoggerPressure,
  formatLoggerTimestamp,
  type LoggerPressureSample,
} from "src/lib/logger-stream";
import {
  buildLoggerPressureChartOption,
  buildLoggerPlaybackMarkerOption,
  LOGGER_PRESSURE_COLOR,
  SIMULATED_PRESSURE_COLOR,
} from "./logger-pressure-chart-options";

echarts.use([
  LineChart,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  DataZoomComponent,
  SVGRenderer,
]);

export const LoggerPressureChart = memo(function LoggerPressureChart({
  history,
  mode = "realtime",
  historyRange,
  historyDeviceId,
  historySampleLimit,
  historyInterval,
  emptyMessage,
  expanded = false,
  onExpand,
  comparison,
}: {
  history: readonly LoggerPressureSample[];
  mode?: LoggerHistoryMode;
  historyRange?: LoggerHistoryRange | null;
  historyDeviceId?: string | null;
  historySampleLimit?: number | null;
  historyInterval?: LoggerHistoryInterval | null;
  emptyMessage?: string;
  expanded?: boolean;
  onExpand?: () => void;
  comparison?: LoggerPressureComparison;
}) {
  const translate = useTranslate();
  const { locale } = useLocale();
  const headingId = useId();
  const unit = translate("loggers.stream.unit");
  const pressureLabel = translate("loggers.stream.history.pressure", unit);
  const isHistory = mode === "history";
  const isMinute = historyInterval === "minute";
  const timeLabel = translate(
    isHistory
      ? "loggers.stream.historyMode.time"
      : "loggers.stream.history.time",
  );
  const emptyLabel = emptyMessage ?? translate("loggers.stream.history.empty");
  const loggerLabel = translate("loggers.stream.comparison.logger");
  const simulatedLabel = translate("loggers.stream.comparison.simulated");
  const playbackTimeline = useMemo(
    () =>
      buildLoggerPlaybackTimeline(
        history,
        comparison,
        isHistory ? (historyInterval ?? "hourly") : undefined,
      ),
    [history, comparison, isHistory, historyInterval],
  );
  const option = useMemo(
    () =>
      buildLoggerPressureChartOption(
        history,
        {
          time: timeLabel,
          pressure: pressureLabel,
          unit,
          logger: loggerLabel,
          simulated: simulatedLabel,
        },
        locale,
        {
          mode,
          range: historyRange,
          sampleLimit: historySampleLimit,
          interval: historyInterval ?? "hourly",
          expanded,
          comparison,
        },
      ),
    [
      history,
      timeLabel,
      pressureLabel,
      unit,
      locale,
      mode,
      historyRange,
      historySampleLimit,
      historyInterval,
      expanded,
      comparison,
      loggerLabel,
      simulatedLabel,
    ],
  );

  const first = history[0];
  const last = history[history.length - 1];
  const historySummary =
    first && last
      ? translate(
          isHistory
            ? isMinute
              ? "loggers.stream.historyMode.summaryMinute"
              : "loggers.stream.historyMode.summary"
            : "loggers.stream.history.summary",
          String(history.length),
          formatLoggerTimestamp(first.timestamp, locale),
          formatLoggerTimestamp(last.timestamp, locale),
          formatLoggerPressure(last.pressure, locale),
          unit,
        )
      : emptyLabel;
  const summary =
    comparison?.status === "ready"
      ? `${historySummary} ${translate(
          "loggers.stream.comparison.summary",
          comparison.nodeLabel ?? "",
          String(comparison.pairedCount),
        )}`
      : historySummary;

  return (
    <section
      aria-labelledby={headingId}
      className={clsx(
        expanded
          ? "flex h-full min-h-0 flex-col p-5"
          : "border-t px-3 pt-3 pb-2",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={
            expanded
              ? "flex min-w-0 flex-wrap items-center gap-3"
              : "min-w-0 space-y-1.5"
          }
        >
          <h3 id={headingId} className="font-medium text-size-small">
            {translate(
              isHistory
                ? isMinute
                  ? "loggers.stream.historyMode.chartTitleMinute"
                  : "loggers.stream.historyMode.chartTitle"
                : "loggers.stream.history.title",
            )}
          </h3>
          <span className="inline-block rounded-full bg-panel px-2 py-0.5 text-size-small text-subtle tabular-nums">
            {isHistory
              ? translate(
                  isMinute
                    ? "loggers.stream.historyMode.minuteSampleCount"
                    : "loggers.stream.historyMode.sampleCount",
                  String(history.length),
                )
              : translate(
                  "loggers.stream.history.samples",
                  String(history.length),
                  String(MAX_LOGGER_PRESSURE_SAMPLES),
                )}
          </span>
        </div>
      </div>
      {isHistory && historyRange && historyDeviceId && (
        <div
          className={clsx(
            "mt-2 text-size-small text-subtle",
            expanded
              ? "flex flex-wrap items-center gap-x-4 gap-y-1"
              : "space-y-1",
          )}
        >
          <p>
            {translate(
              "loggers.stream.historyMode.resultSource",
              historyDeviceId,
            )}
          </p>
          <p>
            {historySampleLimit == null
              ? translate(
                  isMinute
                    ? "loggers.stream.historyMode.resultAllMinute"
                    : "loggers.stream.historyMode.resultAll",
                )
              : translate(
                  isMinute
                    ? "loggers.stream.historyMode.resultLimitMinute"
                    : "loggers.stream.historyMode.resultLimit",
                  String(historySampleLimit),
                )}
          </p>
          <p className="break-words tabular-nums leading-relaxed">
            {translate(
              "loggers.stream.historyMode.resultRange",
              formatLoggerTimestamp(historyRange.from, locale),
              formatLoggerTimestamp(historyRange.to, locale),
            )}
          </p>
        </div>
      )}
      {comparison && (
        <ComparisonSummary comparison={comparison} compact={expanded} />
      )}
      <div className="mt-3 mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-size-small text-subtle">{pressureLabel}</p>
        {onExpand && (
          <Button
            type="button"
            variant="default"
            onClick={onExpand}
            aria-haspopup="dialog"
            className="min-h-11 shrink-0 justify-center gap-2 rounded-md"
          >
            <MaximizeIcon />
            {translate("loggers.stream.history.expand")}
          </Button>
        )}
      </div>
      <LoggerPressurePlot
        key={[
          mode,
          historyRange?.from,
          historyRange?.to,
          historyDeviceId,
          historySampleLimit,
          historyInterval,
        ].join("|")}
        option={option}
        summary={summary}
        emptyLabel={emptyLabel}
        hasSamples={history.length > 0}
        expanded={expanded}
        playbackTimeline={playbackTimeline}
      />
    </section>
  );
});

function LoggerPressurePlot({
  option,
  summary,
  emptyLabel,
  hasSamples,
  expanded,
  playbackTimeline,
}: {
  option: ReturnType<typeof buildLoggerPressureChartOption>;
  summary: string;
  emptyLabel: string;
  hasSamples: boolean;
  expanded: boolean;
  playbackTimeline: LoggerPlaybackTimeline | null;
}) {
  const chartRef = useRef<ReactECharts>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [chart, setChart] = useState<EChartsInstance | null>(null);
  const simulationStep = useAtomValue(simulationStepAtom) ?? 0;
  const isPlaying = useAtomValue(isPlayingAtom);
  const { changeTimestep } = useChangeTimestep();
  const { togglePlayback } = useTogglePlayback();
  const translate = useTranslate();
  const { locale } = useLocale();
  const playbackLabelId = useId();
  const playbackHintId = useId();
  const playbackTimestamp = getLoggerPlaybackTimestamp(
    playbackTimeline,
    simulationStep,
  );
  const playbackTime = formatTimestepTime(
    simulationStep,
    (playbackTimeline?.intervalMilliseconds ?? 1000) / 1000,
  );
  const resetView = useCallback(() => {
    const chart = chartRef.current?.getEchartsInstance();
    chart?.dispatchAction({
      type: "dataZoom",
      start: 0,
      end: 100,
    });
  }, []);

  useEffect(() => {
    if (!chart || chart.isDisposed()) return;
    chart.setOption(buildLoggerPlaybackMarkerOption(playbackTimestamp));
  }, [chart, playbackTimestamp, option]);

  useEffect(() => {
    if (!chart || chart.isDisposed() || !playbackTimeline) return;
    const renderer = chart.getZr();
    let pointerStart: [number, number] | null = null;
    const stepAtPoint = (event: { offsetX: number; offsetY: number }) => {
      const point = [event.offsetX, event.offsetY];
      if (!chart.containPixel({ gridIndex: 0 }, point)) return null;
      const timestamp = chart.convertFromPixel(
        { xAxisIndex: 0 },
        event.offsetX,
      );
      return getLoggerPlaybackStep(playbackTimeline, timestamp);
    };
    const startPointer = (event: { offsetX: number; offsetY: number }) => {
      pointerStart = [event.offsetX, event.offsetY];
    };
    const selectStep = (event: { offsetX: number; offsetY: number }) => {
      if (
        pointerStart &&
        Math.hypot(
          event.offsetX - pointerStart[0],
          event.offsetY - pointerStart[1],
        ) > 4
      )
        return;
      const step = stepAtPoint(event);
      if (step !== null) void changeTimestep(step, "quick-graph");
    };
    const updateCursor = (event: { offsetX: number; offsetY: number }) => {
      renderer.setCursorStyle(
        stepAtPoint(event) === null ? "default" : "pointer",
      );
    };
    renderer.on("mousedown", startPointer);
    renderer.on("click", selectStep);
    renderer.on("mousemove", updateCursor);
    return () => {
      renderer.off("mousedown", startPointer);
      renderer.off("click", selectStep);
      renderer.off("mousemove", updateCursor);
      if (!chart.isDisposed()) renderer.setCursorStyle("default");
    };
  }, [chart, playbackTimeline, changeTimestep]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const resizeObserver = new ResizeObserver(() => {
      const chart = chartRef.current?.getEchartsInstance();
      chart?.resize();
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div className={expanded ? "flex min-h-0 flex-1 flex-col" : undefined}>
      {playbackTimeline && (
        <div
          className={clsx(
            "mb-3 shrink-0 rounded-lg border bg-panel px-3 py-2",
            expanded && "flex flex-wrap items-center gap-x-4",
          )}
        >
          {expanded && (
            <Button
              type="button"
              variant="quiet/mode"
              onClick={() => togglePlayback("buttons")}
              aria-label={
                isPlaying
                  ? translate("pausePlayback")
                  : translate("playSimulation")
              }
              title={
                isPlaying
                  ? translate("pausePlayback")
                  : translate("playSimulation")
              }
              disabled={playbackTimeline.timestepCount < 2}
              className="min-h-11 min-w-11 shrink-0 justify-center rounded-md"
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </Button>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-size-small">
            <label
              id={playbackLabelId}
              htmlFor={`${playbackLabelId}-control`}
              className="inline-flex items-center gap-2 font-medium"
            >
              <span
                aria-hidden="true"
                className="h-4 border-l-2"
                style={{ borderColor: SIMULATED_PRESSURE_COLOR }}
              />
              {translate("loggers.stream.playback.label")}
            </label>
            <span className="font-mono tabular-nums text-accent">
              {playbackTime}
            </span>
          </div>
          <input
            type="range"
            id={`${playbackLabelId}-control`}
            min={0}
            max={playbackTimeline.timestepCount - 1}
            step={1}
            value={simulationStep}
            disabled={playbackTimeline.timestepCount < 2}
            onChange={(event) =>
              void changeTimestep(
                Number(event.currentTarget.value),
                "quick-graph",
              )
            }
            aria-labelledby={playbackLabelId}
            aria-describedby={playbackHintId}
            aria-valuetext={
              playbackTimestamp === null
                ? `${playbackTime}. ${translate("loggers.stream.playback.outsideRange")}`
                : `${playbackTime}. ${formatLoggerTimestamp(new Date(playbackTimestamp).toISOString(), locale)}`
            }
            className={clsx(
              "min-h-11 cursor-pointer accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default",
              expanded ? "min-w-40 flex-1" : "w-full",
            )}
          />
          <p
            id={playbackHintId}
            className={clsx(
              "w-full text-size-small leading-relaxed text-subtle",
              expanded && playbackTimestamp !== null && "sr-only",
            )}
          >
            {translate(
              playbackTimestamp === null
                ? "loggers.stream.playback.outsideRange"
                : "loggers.stream.playback.hint",
            )}
          </p>
        </div>
      )}
      {expanded && hasSamples && (
        <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
          <p className="text-size-small text-subtle">
            {translate("loggers.stream.history.zoomHint")}
          </p>
          <Button
            type="button"
            variant="default"
            onClick={resetView}
            className="min-h-11 shrink-0 justify-center gap-2 rounded-md"
          >
            <RefreshIcon />
            {translate("loggers.stream.history.resetView")}
          </Button>
        </div>
      )}
      <div
        ref={containerRef}
        role="img"
        aria-label={summary}
        aria-live="off"
        className={clsx(
          "w-full min-w-0",
          expanded ? "min-h-[280px] flex-1" : "h-72",
        )}
      >
        {hasSamples ? (
          <div aria-hidden="true" className="h-full w-full">
            <ReactECharts
              ref={chartRef}
              echarts={echarts}
              option={option}
              style={{ height: "100%", width: "100%" }}
              opts={{ renderer: "svg" }}
              notMerge={!expanded}
              replaceMerge={["series"]}
              onChartReady={setChart}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-size-small text-subtle">
            <p className="max-w-48 px-3">{emptyLabel}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ComparisonSummary({
  comparison,
  compact = false,
}: {
  comparison: LoggerPressureComparison;
  compact?: boolean;
}) {
  const translate = useTranslate();
  const { locale } = useLocale();
  const isReady = comparison.status === "ready";
  const formatCount = (count: number) =>
    new Intl.NumberFormat(locale).format(count);

  if (compact && isReady) {
    return (
      <div className="mt-2 flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-panel px-3 py-2 text-size-small">
        {comparison.nodeLabel && (
          <span className="break-words text-subtle">
            {translate("loggers.stream.comparison.node", comparison.nodeLabel)}
          </span>
        )}
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="w-5 border-t-2"
            style={{ borderColor: LOGGER_PRESSURE_COLOR }}
          />
          {translate("loggers.stream.comparison.logger")}
          <strong className="font-mono tabular-nums">
            {formatCount(comparison.loggerCount)}
          </strong>
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="w-5 border-t-2 border-dashed"
            style={{ borderColor: SIMULATED_PRESSURE_COLOR }}
          />
          {translate("loggers.stream.comparison.simulated")}
          <strong className="font-mono tabular-nums">
            {formatCount(comparison.pairedCount)}
          </strong>
        </span>
        {comparison.reportingIntervalSeconds != null &&
          comparison.durationSeconds != null && (
            <span className="text-subtle tabular-nums">
              {translate(
                "loggers.stream.comparison.timing",
                formatSimulationDuration(comparison.reportingIntervalSeconds),
                formatSimulationDuration(comparison.durationSeconds),
              )}
            </span>
          )}
        {comparison.pairedCount !== comparison.loggerCount && (
          <p className="w-full text-warning leading-relaxed">
            {translate("loggers.stream.comparison.differentCounts")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border bg-panel p-3 text-size-small">
      <div
        className={
          compact ? "flex flex-wrap items-center gap-x-4 gap-y-1" : undefined
        }
      >
        <p className="font-medium">
          {translate("loggers.stream.comparison.title")}
        </p>
        {comparison.nodeLabel && (
          <p className={clsx("break-words text-subtle", !compact && "mt-1")}>
            {translate("loggers.stream.comparison.node", comparison.nodeLabel)}
          </p>
        )}
      </div>
      {isReady ? (
        <>
          <dl
            className={
              compact
                ? "mt-2 flex flex-wrap gap-x-6 gap-y-2"
                : "mt-3 grid grid-cols-2 gap-3"
            }
          >
            <div className={compact ? "flex items-center gap-2" : undefined}>
              <dt className="flex items-center gap-1.5 text-subtle">
                <span
                  aria-hidden="true"
                  className="w-5 shrink-0 border-t-2"
                  style={{ borderColor: LOGGER_PRESSURE_COLOR }}
                />
                {translate("loggers.stream.comparison.logger")}
              </dt>
              <dd
                className={clsx(
                  "font-mono font-semibold tabular-nums",
                  !compact && "mt-1",
                )}
              >
                {formatCount(comparison.loggerCount)}
                <span className="ml-1 font-sans font-normal text-subtle">
                  {translate("loggers.stream.comparison.samples")}
                </span>
              </dd>
            </div>
            <div className={compact ? "flex items-center gap-2" : undefined}>
              <dt className="flex items-center gap-1.5 text-subtle">
                <span
                  aria-hidden="true"
                  className="w-5 shrink-0 border-t-2 border-dashed"
                  style={{ borderColor: SIMULATED_PRESSURE_COLOR }}
                />
                {translate("loggers.stream.comparison.simulated")}
              </dt>
              <dd
                className={clsx(
                  "font-mono font-semibold tabular-nums",
                  !compact && "mt-1",
                )}
              >
                {formatCount(comparison.pairedCount)}
                <span className="ml-1 font-sans font-normal text-subtle">
                  {translate("loggers.stream.comparison.samples")}
                </span>
              </dd>
            </div>
          </dl>
          {!compact && (
            <p className="mt-3 text-subtle leading-relaxed">
              {translate("loggers.stream.comparison.alignment")}
            </p>
          )}
          {comparison.reportingIntervalSeconds != null &&
            comparison.durationSeconds != null && (
              <p className="mt-1 text-subtle tabular-nums leading-relaxed">
                {translate(
                  "loggers.stream.comparison.timing",
                  formatSimulationDuration(comparison.reportingIntervalSeconds),
                  formatSimulationDuration(comparison.durationSeconds),
                )}
              </p>
            )}
          {comparison.pairedCount !== comparison.loggerCount && (
            <p className="mt-2 rounded-md bg-warning-subtle px-2 py-1.5 text-warning leading-relaxed">
              {translate("loggers.stream.comparison.differentCounts")}
            </p>
          )}
        </>
      ) : (
        <p
          className={clsx(
            "mt-2 leading-relaxed",
            comparison.status === "error" ? "text-error" : "text-subtle",
          )}
        >
          {translate(`loggers.stream.comparison.status.${comparison.status}`)}
        </p>
      )}
    </div>
  );
}

const formatSimulationDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return [hours, minutes, remainingSeconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
};
