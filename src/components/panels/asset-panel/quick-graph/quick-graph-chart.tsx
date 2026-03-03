import { useMemo, useCallback, useRef, useEffect } from "react";
import ReactECharts, { EChartsInstance } from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { useTranslate } from "src/hooks/use-translate";
import { localizeDecimal } from "src/infra/i18n/numbers";
import { colors } from "src/lib/constants";

interface QuickGraphChartProps {
  values: number[];
  mainValues: number[] | null;
  mainLabel: string | null;
  intervalsCount: number;
  intervalSeconds: number;
  decimals: number;
  currentIntervalIndex: number;
  onIntevalClick: (intervalIndex: number) => void;
  scenarioName: string | null;
  liveValues?: (number | null)[];
  liveLabel?: string | null;
  liveColor?: string;
  extraSeries?:
    | {
        label: string;
        values: (number | null)[];
        color?: string;
      }[]
    | null;
}

export function QuickGraphChart(props: QuickGraphChartProps) {
  return <QuickGraphChartECharts {...props} />;
}

function QuickGraphChartECharts({
  values,
  mainValues,
  mainLabel,
  intervalsCount,
  intervalSeconds,
  currentIntervalIndex,
  decimals,
  onIntevalClick,
  scenarioName,
  liveValues,
  liveLabel,
  liveColor,
  extraSeries,
}: QuickGraphChartProps) {
  const translate = useTranslate();

  const hasValues = (arr: (number | null)[] | null | undefined) =>
    Array.isArray(arr) &&
    arr.some((value) => typeof value === "number" && Number.isFinite(value));

  const hasScenarioSeries = hasValues(values);
  const hasMainSeries = hasValues(mainValues);
  const hasLiveSeries = hasValues(liveValues);

  const showLegend =
    hasMainSeries ||
    (hasLiveSeries && !!liveLabel) ||
    (Array.isArray(extraSeries) && extraSeries.length > 0);

  const allValues = useMemo(() => {
    const flatten = (arr?: (number | null)[] | null) =>
      (arr ?? []).filter(
        (value): value is number =>
          typeof value === "number" && Number.isFinite(value),
      );

    const extra = (extraSeries ?? []).flatMap((series) =>
      flatten(series.values),
    );
    return [
      ...flatten(values),
      ...flatten(mainValues),
      ...flatten(liveValues),
      ...extra,
    ];
  }, [values, mainValues, liveValues, extraSeries]);

  const xAxis: EChartsOption["xAxis"] = useMemo(
    () => buildXAxis(intervalsCount, intervalSeconds),
    [intervalsCount, intervalSeconds],
  );
  const yAxis: EChartsOption["yAxis"] = useMemo(
    () => buildYAxis(allValues, decimals),
    [allValues, decimals],
  );

  const series: EChartsOption["series"] = useMemo(() => {
    const markerLine = {
      silent: true,
      symbol: "none",
      data: [{ xAxis: currentIntervalIndex }],
      lineStyle: {
        type: "solid" as const,
        color: colors.purple300,
        width: 1.5,
      },
      label: { show: false },
    };

    const scenarioSeries = {
      type: "line" as const,
      name: scenarioName ?? undefined,
      data: values,
      lineStyle: {
        color: colors.purple500,
        width: 2,
      },
      itemStyle: {
        color: colors.purple500,
      },
      symbol: "none",
      smooth: false,
      triggerLineEvent: true,
      markLine: markerLine,
    };

    const mainSeries = {
      type: "line" as const,
      name: mainLabel ?? undefined,
      data: mainValues,
      lineStyle: {
        color: colors.gray400,
        width: 1.5,
      },
      itemStyle: {
        color: colors.gray400,
      },
      symbol: "none",
      smooth: false,
      z: 0,
    };

    const liveSeries = {
      type: "line" as const,
      name: liveLabel ?? "Live",
      data: liveValues ?? [],
      lineStyle: {
        color: liveColor ?? "rgb(239, 68, 68)",
        width: 2,
      },
      itemStyle: {
        color: liveColor ?? "rgb(239, 68, 68)",
      },
      symbol: "none",
      smooth: false,
      z: 2,
    };

    const overlaySeries = (extraSeries ?? [])
      .filter((series) => hasValues(series.values))
      .map((series) => ({
        type: "line" as const,
        name: series.label,
        data: series.values,
        lineStyle: {
          color: series.color ?? colors.cyan700,
          width: 1.5,
        },
        itemStyle: {
          color: series.color ?? colors.cyan700,
        },
        symbol: "none",
        smooth: false,
        z: 1,
      }));

    const result = [];
    if (hasMainSeries) result.push(mainSeries);
    if (hasScenarioSeries) result.push(scenarioSeries);
    if (hasLiveSeries) result.push(liveSeries);
    result.push(...overlaySeries);

    if (result.length === 0) {
      return [scenarioSeries];
    }

    const hasSeriesWithMarker = result.some(
      (series) =>
        typeof series === "object" &&
        series !== null &&
        "markLine" in series &&
        !!series.markLine,
    );
    if (!hasSeriesWithMarker && result.length > 0) {
      result[0] = {
        ...(result[0] as Record<string, unknown>),
        markLine: markerLine,
      };
    }

    return result;
  }, [
    values,
    mainValues,
    mainLabel,
    scenarioName,
    currentIntervalIndex,
    liveValues,
    liveLabel,
    liveColor,
    extraSeries,
    hasMainSeries,
    hasScenarioSeries,
    hasLiveSeries,
  ]);

  const legend: EChartsOption["legend"] = useMemo(() => {
    if (!showLegend) return undefined;
    return {
      show: true,
      top: 0,
      right: 0,
      itemWidth: 16,
      itemHeight: 8,
      textStyle: {
        fontSize: 12,
        color: colors.gray600,
      },
    };
  }, [showLegend]);

  const option: EChartsOption = {
    animation: false,
    grid: {
      top: showLegend ? 20 : 8,
      right: 8,
      bottom: 4,
      left: 36,
      containLabel: false,
    },
    legend,
    xAxis,
    yAxis,
    series,
    tooltip: {
      trigger: "axis",
      backgroundColor: "white",
      borderColor: colors.gray300,
      textStyle: {
        color: colors.gray700,
        fontSize: 14,
      },
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return "";
        const timeLabel = params[0]?.name ?? "";
        const lines = params.map((p: any) => {
          const value =
            typeof p.value === "number" && Number.isFinite(p.value)
              ? localizeDecimal(p.value, { decimals })
              : "N/A";
          const isComparingScenarios = mainValues !== null;
          if (!isComparingScenarios) return value;
          const colorDot = `<span style="display:inline-block;width:8px;height:8px;background:${p.color};margin-right:4px;border-radius:50%;"></span>`;
          return `${colorDot}${p.seriesName ?? ""}: ${value}`;
        });
        return `${timeLabel}<br/>${lines.join("<br/>")}`;
      },
    },
  };

  const chartRef = useRef<ReactECharts>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const onChartReady = useCallback(
    (chart: EChartsInstance) => {
      const zr = chart.getZr();

      zr.on("click", (params: any) => {
        const pointInPixel = [params.offsetX, params.offsetY];
        if (!chart.containPixel("grid", pointInPixel)) return;

        const pointInGrid = chart.convertFromPixel("grid", pointInPixel);
        const dataIndex = Math.round(pointInGrid[0]);
        if (dataIndex >= 0 && dataIndex < values.length) {
          onIntevalClick(dataIndex);
        }
      });

      zr.on("mousemove", (params: any) => {
        const pointInPixel = [params.offsetX, params.offsetY];
        const isInGrid = chart.containPixel("grid", pointInPixel);
        zr.setCursorStyle(isInGrid ? "pointer" : "default");
      });
    },
    [onIntevalClick, values.length],
  );

  if (intervalsCount === 0 || values.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-xs">
        {translate("noDataAvailable")}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full w-full">
      <ReactECharts
        ref={chartRef}
        key={`${intervalSeconds}-${intervalsCount}`}
        option={option}
        style={{ height: "100%", width: "100%" }}
        opts={{ renderer: "svg" }}
        onChartReady={onChartReady}
        notMerge={true}
      />
    </div>
  );
}

const buildXAxis = (
  intervalsCount: number,
  intervalSeconds: number,
): EChartsOption["xAxis"] => {
  const xAxisInterval = calculateXAxisInterval(intervalsCount, intervalSeconds);
  const xAxisStep = calculateXAxisStep(intervalsCount, intervalSeconds);
  return {
    type: "category",
    data: buildTimeLabels(intervalsCount, intervalSeconds),
    show: true,
    boundaryGap: false,
    splitLine: {
      show: true,
      lineStyle: { color: colors.gray300, type: "dashed" },
      interval: (index: number) => {
        if (index === intervalsCount - 1) return false;
        return index % xAxisStep === 0;
      },
    },
    axisTick: {
      show: true,
      alignWithLabel: true,
      lineStyle: { color: colors.gray300 },
      interval: (index: number) => index % xAxisStep === 0,
    },
    axisLabel: {
      show: true,
      interval: xAxisInterval,
      color: colors.gray500,
      fontSize: 12,
    },
    axisLine: { show: true, lineStyle: { color: colors.gray300 } },
  };
};

const buildTimeLabels = (intervalsCount: number, intervalSeconds: number) => {
  const labels: string[] = [];
  for (let i = 0; i < intervalsCount; i++) {
    const totalSeconds = i * intervalSeconds;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    labels.push(`${hours}:${minutes.toString().padStart(2, "0")}`);
  }
  return labels;
};

const calculateXAxisInterval = (
  intervalCount: number,
  intervalSeconds: number,
  targetTickCount = 5,
) => {
  const totalSeconds = intervalCount * intervalSeconds;

  const logicalSteps = [3600, 7200, 10800, 14400, 21600, 28800, 43200, 86400];

  const idealStep = totalSeconds / (targetTickCount - 1 || 1);

  const bestStepSeconds = logicalSteps.reduce((prev, curr) => {
    return Math.abs(curr - idealStep) < Math.abs(prev - idealStep)
      ? curr
      : prev;
  });

  const indexInterval = Math.round(bestStepSeconds / intervalSeconds);

  return (index: number) => {
    return index % indexInterval === 0;
  };
};

const calculateXAxisStep = (
  intervalCount: number,
  intervalSeconds: number,
  targetTickCount = 5,
): number => {
  const totalSeconds = intervalCount * intervalSeconds;
  const rawStep = totalSeconds / Math.max(targetTickCount - 1, 1);

  const step = [3600, 7200, 10800, 14400, 21600, 28800, 43200, 86400].reduce(
    (prev, curr) => {
      return Math.abs(curr - rawStep) < Math.abs(prev - rawStep) ? curr : prev;
    },
  );

  return Math.max(1, Math.round(step / intervalSeconds));
};

const buildYAxis = (
  values: number[],
  decimals: number,
): EChartsOption["yAxis"] => {
  const safeValues = values.filter((value) => Number.isFinite(value));
  const { min, max, interval } = calculateInterval(decimals, safeValues, 5);
  return {
    type: "value",
    scale: true,
    min,
    max,
    interval,
    splitLine: {
      show: true,
      lineStyle: { color: colors.gray300, type: "dashed" },
    },
    axisLine: { show: true, lineStyle: { color: colors.gray300 } },
    axisTick: { show: true, lineStyle: { color: colors.gray300 } },
    axisLabel: {
      color: colors.gray500,
      fontSize: 12,
      formatter: (value: number) => {
        return localizeDecimal(value, { decimals });
      },
    },
  };
};

export const calculateInterval = (
  decimals: number,
  values: number[],
  targetIntervalsCount = 5,
): { min: number; max: number; interval: number } => {
  const safeValues = values.filter((value) => Number.isFinite(value));
  if (safeValues.length === 0) {
    return { min: 0, max: 1, interval: 0.2 };
  }

  const factor = Math.pow(10, decimals);
  const minVal =
    safeValues.length > 0
      ? Math.floor(Math.min(...safeValues) * factor) / factor
      : 0;
  const maxVal =
    safeValues.length > 0
      ? Math.ceil(Math.max(...safeValues) * factor) / factor
      : 0;
  const range = maxVal - minVal;

  const minPrecision = Math.pow(10, -decimals + 1);
  let niceInterval = minPrecision;
  if (range > 0) {
    const roughInterval = range / (targetIntervalsCount - 1);
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughInterval)));
    const normalizedInterval = roughInterval / magnitude;

    const niceFactor = [1, 2, 2.5, 5, 10].reduce((prev, curr) => {
      return Math.abs(curr - normalizedInterval) <
        Math.abs(prev - normalizedInterval)
        ? curr
        : prev;
    });

    niceInterval = Math.max(
      Math.round(niceFactor * magnitude * factor) / factor,
      minPrecision,
    );
  }
  if (niceInterval > minPrecision) {
    const min = Math.floor(minVal / niceInterval) * niceInterval;
    const max = Math.ceil(maxVal / niceInterval) * niceInterval;
    return { min, max, interval: niceInterval };
  }

  const offset =
    (targetIntervalsCount - 1) * minPrecision - Math.abs(maxVal - minVal);
  const halfOffset = offset / 2;

  let min: number;
  let max: number;
  if (minVal >= 0 && minVal < halfOffset) {
    const maxOffset = offset - minVal;
    min = 0;
    max = Math.floor((maxVal + maxOffset) / minPrecision) * minPrecision;
  } else {
    min = Math.ceil((minVal - halfOffset) / minPrecision) * minPrecision;
    max = Math.floor((maxVal + halfOffset) / minPrecision) * minPrecision;
  }

  // Ensure computed range contains all data points
  while (min > minVal) min -= minPrecision;
  while (max < maxVal) max += minPrecision;

  return { min, max, interval: minPrecision };
};
