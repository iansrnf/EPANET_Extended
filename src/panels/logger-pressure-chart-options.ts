import type { ComposeOption } from "echarts/core";
import type { LineSeriesOption } from "echarts/charts";
import type {
  GridComponentOption,
  TooltipComponentOption,
  DataZoomComponentOption,
  MarkLineComponentOption,
} from "echarts/components";
import type {
  LoggerHistoryMode,
  LoggerHistoryRange,
  LoggerHistoryInterval,
} from "src/lib/logger-history";
import type { LoggerPressureComparison } from "src/lib/logger-comparison";
import {
  formatLoggerPressure,
  formatLoggerTimestamp,
  getLoggerTimestampMilliseconds,
  LOGGER_TIME_ZONE,
  type LoggerPressureSample,
} from "src/lib/logger-stream";

type LoggerPressureChartOption = ComposeOption<
  | LineSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | DataZoomComponentOption
  | MarkLineComponentOption
>;

type ChartLabels = {
  time: string;
  pressure: string;
  unit: string;
  logger?: string;
  simulated?: string;
};
type ChartContext = {
  mode?: LoggerHistoryMode;
  range?: LoggerHistoryRange | null;
  sampleLimit?: number | null;
  interval?: LoggerHistoryInterval;
  expanded?: boolean;
  comparison?: LoggerPressureComparison;
};

export const LOGGER_PRESSURE_COLOR = "#0d9488";
export const SIMULATED_PRESSURE_COLOR = "#7c3aed";

export const buildLoggerPlaybackMarkerOption = (
  timestamp: number | null,
): LoggerPressureChartOption => ({
  series: [
    {
      id: "logger",
      type: "line",
      markLine: {
        silent: true,
        symbol: "none",
        label: { show: false },
        lineStyle: {
          type: "solid",
          color: SIMULATED_PRESSURE_COLOR,
          opacity: 0.6,
          width: 1.5,
        },
        data: timestamp === null ? [] : [{ xAxis: timestamp }],
      },
    },
  ],
});

export const buildLoggerPressureChartData = (
  history: readonly LoggerPressureSample[],
) => {
  const points: [number, number][] = [];
  let firstTime = Infinity;
  let lastTime = -Infinity;
  let minPressure = Infinity;
  let maxPressure = -Infinity;
  for (const sample of history) {
    const timestamp = getLoggerTimestampMilliseconds(sample.timestamp);
    if (timestamp === null || !Number.isFinite(sample.pressure)) continue;
    points.push([timestamp, sample.pressure]);
    firstTime = Math.min(firstTime, timestamp);
    lastTime = Math.max(lastTime, timestamp);
    minPressure = Math.min(minPressure, sample.pressure);
    maxPressure = Math.max(maxPressure, sample.pressure);
  }
  if (!points.length) return null;
  const pressureSpan = maxPressure - minPressure;
  const pressurePadding =
    pressureSpan > 0
      ? Math.max(pressureSpan * 0.12, 0.000001)
      : Math.max(Math.abs(minPressure) * 0.05, 0.01);

  return {
    points,
    sourceTimeRange: { min: firstTime, max: lastTime },
    timeRange: {
      min: firstTime === lastTime ? firstTime - 1000 : firstTime,
      max: firstTime === lastTime ? lastTime + 1000 : lastTime,
    },
    pressureRange: {
      min: minPressure - pressurePadding,
      max: maxPressure + pressurePadding,
    },
  };
};

export const buildLoggerPressureChartOption = (
  history: readonly LoggerPressureSample[],
  labels: ChartLabels,
  locale: string,
  context: ChartContext = {},
): LoggerPressureChartOption => {
  const data = buildLoggerPressureChartData(history);
  const samples = history.filter(
    (sample) =>
      getLoggerTimestampMilliseconds(sample.timestamp) !== null &&
      Number.isFinite(sample.pressure),
  );
  const simulationSamples =
    context.comparison?.status === "ready"
      ? context.comparison.samples.filter(
          (sample) =>
            getLoggerTimestampMilliseconds(sample.timestamp) !== null &&
            Number.isFinite(sample.pressure),
        )
      : [];
  const simulationData = buildLoggerPressureChartData(simulationSamples);
  const simulationPlot = simulationData
    ? withSimulationGaps(
        simulationData.points,
        simulationSamples,
        context.comparison?.missingTimestamps ?? [],
      )
    : null;
  const hasComparison = simulationData !== null;
  const formatTime = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second:
      context.mode === "history" && !context.expanded ? undefined : "2-digit",
    hourCycle: "h23",
    timeZone: LOGGER_TIME_ZONE,
  });
  const formatDate = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "2-digit",
    timeZone: LOGGER_TIME_ZONE,
  });
  const isHistory = context.mode === "history";
  const rangeFrom = context.range
    ? getLoggerTimestampMilliseconds(context.range.from)
    : null;
  const rangeTo = context.range
    ? getLoggerTimestampMilliseconds(context.range.to)
    : null;
  const intervalMilliseconds = context.interval === "minute" ? 60000 : 3600000;
  const limitedTimeRange =
    isHistory && context.sampleLimit != null && data
      ? {
          min:
            Math.floor(data.sourceTimeRange.min / intervalMilliseconds) *
            intervalMilliseconds,
          max:
            (Math.floor(data.sourceTimeRange.max / intervalMilliseconds) + 1) *
            intervalMilliseconds,
        }
      : null;
  const displayedStart = Math.min(
    data?.sourceTimeRange.min ?? Infinity,
    simulationData?.sourceTimeRange.min ?? Infinity,
  );
  const displayedEnd = Math.max(
    data?.sourceTimeRange.max ?? -Infinity,
    simulationData?.sourceTimeRange.max ?? -Infinity,
  );
  const overviewTimeRange = Number.isFinite(displayedStart)
    ? {
        min:
          displayedStart === displayedEnd
            ? displayedStart - 1000
            : displayedStart,
        max:
          displayedStart === displayedEnd ? displayedEnd + 1000 : displayedEnd,
      }
    : null;
  const timeRange =
    context.expanded && overviewTimeRange
      ? overviewTimeRange
      : limitedTimeRange !== null
        ? limitedTimeRange
        : isHistory &&
            context.sampleLimit == null &&
            rangeFrom !== null &&
            rangeTo !== null &&
            rangeTo > rangeFrom
          ? { min: rangeFrom, max: rangeTo }
          : data?.timeRange;
  const pressureRange =
    data && simulationData
      ? {
          min: Math.min(
            data.pressureRange.min,
            simulationData.pressureRange.min,
          ),
          max: Math.max(
            data.pressureRange.max,
            simulationData.pressureRange.max,
          ),
        }
      : data?.pressureRange;
  const series: LineSeriesOption[] = [
    {
      id: "logger",
      type: "line",
      name: labels.logger ?? labels.pressure,
      data: data?.points ?? [],
      smooth: false,
      sampling: isHistory ? "lttb" : "none",
      progressive: isHistory ? 2000 : 0,
      showSymbol: samples.length === 1,
      symbol: "circle",
      symbolSize: context.expanded ? 8 : 6,
      lineStyle: {
        color: LOGGER_PRESSURE_COLOR,
        width: context.expanded ? 2.5 : 2,
      },
      itemStyle: { color: LOGGER_PRESSURE_COLOR },
      areaStyle: {
        color: LOGGER_PRESSURE_COLOR,
        opacity: hasComparison ? 0 : 0.08,
        origin: "start",
      },
      emphasis: { disabled: !context.expanded, scale: 1.5 },
    },
  ];
  if (hasComparison) {
    series.push({
      id: "simulation",
      type: "line",
      name: labels.simulated ?? labels.pressure,
      data: simulationPlot?.points ?? [],
      smooth: false,
      sampling: isHistory ? "lttb" : "none",
      progressive: isHistory ? 2000 : 0,
      showSymbol: simulationSamples.length === 1,
      symbol: "diamond",
      symbolSize: context.expanded ? 9 : 7,
      connectNulls: false,
      lineStyle: {
        color: SIMULATED_PRESSURE_COLOR,
        width: context.expanded ? 2.5 : 2,
        type: "dashed",
      },
      itemStyle: { color: SIMULATED_PRESSURE_COLOR },
      emphasis: { disabled: !context.expanded, scale: 1.5 },
    });
  }

  return {
    animation: false,
    useUTC: true,
    grid: {
      top: 8,
      left: 0,
      right: 6,
      bottom: context.expanded ? 116 : isHistory ? 40 : 30,
      containLabel: true,
    },
    xAxis: {
      type: "time",
      min: timeRange?.min,
      max: timeRange?.max,
      splitNumber: context.expanded ? 6 : 2,
      minInterval: isHistory && !context.expanded ? intervalMilliseconds : 1000,
      name: labels.time,
      nameLocation: "middle",
      nameGap: isHistory ? 35 : 25,
      nameTextStyle: {
        color: "var(--color-subtle)",
        fontSize: context.expanded ? 12 : 10,
      },
      axisLine: { lineStyle: { color: "var(--color-border)" } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        color: "var(--color-subtle)",
        fontSize: context.expanded ? 12 : 10,
        hideOverlap: true,
        formatter: (value: number) =>
          isHistory
            ? `${formatDate.format(value)}\n${formatTime.format(value)}`
            : formatTime.format(value),
      },
    },
    yAxis: {
      type: "value",
      scale: true,
      min: pressureRange?.min,
      max: pressureRange?.max,
      splitNumber: context.expanded ? 5 : 3,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        lineStyle: { color: "var(--color-border)", type: "dashed" },
      },
      axisLabel: {
        color: "var(--color-subtle)",
        fontSize: context.expanded ? 12 : 10,
        formatter: (value: number) => formatLoggerPressure(value, locale),
      },
    },
    tooltip: {
      trigger: "axis",
      confine: true,
      renderMode: "html",
      backgroundColor: "var(--color-popover)",
      borderColor: "var(--color-border)",
      padding: [8, 10],
      textStyle: { color: "var(--color-default)", fontSize: 12 },
      extraCssText:
        "border-radius:8px;font-variant-numeric:tabular-nums;max-width:100%;white-space:normal;overflow-wrap:anywhere;",
      axisPointer: {
        type: context.expanded ? "cross" : "line",
        label: { show: false },
        lineStyle: { color: "var(--color-subtle)", type: "dashed" },
        crossStyle: { color: "var(--color-subtle)", type: "dashed" },
      },
      formatter: (params) => {
        const items = Array.isArray(params) ? params : [params];
        if (!hasComparison) {
          const item = items[0];
          const sample = item ? samples[item.dataIndex] : undefined;
          return sample
            ? formatLoggerPressureTooltip(sample, labels.unit, locale)
            : "";
        }
        const anchor = items[0];
        const anchorTime =
          anchor?.seriesId === "simulation"
            ? simulationPlot?.points[anchor.dataIndex]?.[0]
            : anchor
              ? data?.points[anchor.dataIndex]?.[0]
              : undefined;
        if (anchorTime === undefined) return "";
        const loggerItem = items.find((item) => item.seriesId !== "simulation");
        const simulatedItem = items.find(
          (item) => item.seriesId === "simulation",
        );
        const simulationIntervalMilliseconds =
          (context.comparison?.reportingIntervalSeconds ?? 0) * 1000;
        const loggerSample = loggerItem
          ? samples[loggerItem.dataIndex]
          : nearestChartSample(
              data?.points ?? [],
              samples,
              anchorTime,
              (isHistory
                ? intervalMilliseconds
                : simulationIntervalMilliseconds) / 2,
            );
        const simulatedSample = simulatedItem
          ? simulationPlot?.samples[simulatedItem.dataIndex]
          : nearestChartSample(
              simulationPlot?.points ?? [],
              simulationPlot?.samples ?? [],
              anchorTime,
              simulationIntervalMilliseconds / 2,
            );
        const tooltipReadings = [
          { sample: simulatedSample, label: labels.simulated },
          { sample: loggerSample, label: labels.logger },
        ];
        if (
          loggerSample &&
          simulatedSample &&
          loggerSample.pressure > simulatedSample.pressure
        )
          tooltipReadings.reverse();
        return tooltipReadings
          .map(({ sample, label }) =>
            sample
              ? `${escapeHtml(label ?? labels.pressure)}<br/>${formatLoggerPressureTooltip(sample, labels.unit, locale)}`
              : "",
          )
          .filter(Boolean)
          .join('<div style="height:8px"></div>');
      },
    },
    dataZoom: context.expanded
      ? [
          {
            id: "logger-overview-inside",
            type: "inside",
            filterMode: "none",
          },
          {
            id: "logger-overview-slider",
            type: "slider",
            filterMode: "none",
            bottom: 12,
            height: 44,
            showDataShadow: true,
            brushSelect: true,
            handleSize: "100%",
            moveHandleSize: 10,
            dataBackground: {
              lineStyle: { color: LOGGER_PRESSURE_COLOR, opacity: 0.4 },
              areaStyle: { color: LOGGER_PRESSURE_COLOR, opacity: 0.08 },
            },
            selectedDataBackground: {
              lineStyle: { color: LOGGER_PRESSURE_COLOR },
              areaStyle: { color: LOGGER_PRESSURE_COLOR, opacity: 0.18 },
            },
            borderColor: "var(--color-border)",
            textStyle: { color: "var(--color-subtle)" },
          },
        ]
      : undefined,
    series,
  };
};

export const formatLoggerPressureTooltip = (
  sample: LoggerPressureSample,
  unit: string,
  locale: string,
) =>
  `${escapeHtml(formatLoggerTimestamp(sample.timestamp, locale))}<br/><strong>${escapeHtml(formatLoggerPressure(sample.pressure, locale))} ${escapeHtml(unit)}</strong>`;

const nearestChartSample = (
  points: readonly [number, number | null][],
  samples: readonly (LoggerPressureSample | null)[],
  timestamp: number,
  tolerance: number,
) => {
  if (
    !points.length ||
    !Number.isFinite(tolerance) ||
    tolerance <= 0 ||
    timestamp < points[0][0] ||
    timestamp > points[points.length - 1][0]
  )
    return null;
  let lower = 0;
  let upper = points.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (points[middle][0] < timestamp) lower = middle + 1;
    else upper = middle;
  }
  let index = Math.min(lower, points.length - 1);
  if (
    index > 0 &&
    timestamp - points[index - 1][0] <= points[index][0] - timestamp
  )
    index -= 1;
  return Math.abs(points[index][0] - timestamp) <= tolerance
    ? samples[index]
    : null;
};

const withSimulationGaps = (
  sourcePoints: [number, number][],
  sourceSamples: readonly LoggerPressureSample[],
  missingTimestamps: readonly string[],
) => {
  if (!missingTimestamps.length) {
    return { points: sourcePoints, samples: sourceSamples };
  }
  const missingTimes = missingTimestamps
    .map(getLoggerTimestampMilliseconds)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  const points: [number, number | null][] = [];
  const samples: (LoggerPressureSample | null)[] = [];
  let sourceIndex = 0;
  let missingIndex = 0;
  while (
    sourceIndex < sourcePoints.length ||
    missingIndex < missingTimes.length
  ) {
    const sourcePoint = sourcePoints[sourceIndex];
    const missingTime = missingTimes[missingIndex];
    if (
      sourcePoint &&
      (missingIndex >= missingTimes.length || sourcePoint[0] <= missingTime)
    ) {
      points.push(sourcePoint);
      samples.push(sourceSamples[sourceIndex]);
      sourceIndex += 1;
      if (sourcePoint[0] === missingTime) missingIndex += 1;
    } else {
      points.push([missingTime, null]);
      samples.push(null);
      missingIndex += 1;
    }
  }
  return { points, samples };
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
