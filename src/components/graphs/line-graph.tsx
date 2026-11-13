import { useMemo, useRef, useEffect, useCallback } from "react";
import ReactECharts, { EChartsInstance } from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { useTranslate } from "src/hooks/use-translate";
import { localizeDecimal } from "@epanet-js/i18n";
import { colors } from "src/lib/constants";

export interface StyledPointValue {
  x: number;
  y: number;
  itemStyle?: { color: string };
  symbol?: string;
  symbolSize?: number;
  lineStyle?: { color: string };
}

interface LineGraphProps {
  points: StyledPointValue[];
  linePoints?: StyledPointValue[];
  onPointClick?: (index: number | null) => void;
  xAxisLabel?: string;
  yAxisLabel?: string;
  zoomable?: boolean;
  resetZoomLabel?: string;
  zoomInstructions?: string;
}

export function LineGraph({
  points,
  linePoints,
  onPointClick,
  xAxisLabel,
  yAxisLabel,
  zoomable = false,
  resetZoomLabel = "Reset zoom",
  zoomInstructions,
}: LineGraphProps) {
  const translate = useTranslate();
  const chartRef = useRef<ReactECharts>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const onPointClickRef = useRef(onPointClick);
  onPointClickRef.current = onPointClick;

  const xAxis: EChartsOption["xAxis"] = useMemo(() => {
    const xValues = linePoints
      ? [...points.map((p) => p.x), ...linePoints.map((p) => p.x)]
      : points.map((p) => p.x);
    const { min, max, interval } = calculateInterval(xValues);
    return {
      type: "value",
      min,
      max,
      interval: zoomable ? undefined : interval,
      name: xAxisLabel,
      nameLocation: "middle",
      nameGap: 24,
      nameTextStyle: {
        color: colors.gray500,
        fontSize: 14,
      },
      axisLine: { show: true, lineStyle: { color: colors.gray300 } },
      axisTick: { show: true, lineStyle: { color: colors.gray300 } },
      splitLine: {
        show: true,
        lineStyle: { color: colors.gray300, type: "dashed" },
      },
      axisLabel: {
        show: true,
        color: colors.gray500,
        fontSize: 12,
        formatter: (value: number) => localizeDecimal(value, { decimals: 2 }),
      },
    };
  }, [points, linePoints, xAxisLabel, zoomable]);

  const yAxis: EChartsOption["yAxis"] = useMemo(() => {
    const yValues = linePoints
      ? [...points.map((p) => p.y), ...linePoints.map((p) => p.y)]
      : points.map((p) => p.y);
    const { min, max, interval } = calculateInterval(yValues);
    return {
      type: "value",
      min,
      max,
      interval: zoomable ? undefined : interval,
      name: yAxisLabel,
      nameLocation: "middle",
      nameGap: 40,
      nameTextStyle: {
        color: colors.gray500,
        fontSize: 14,
      },
      splitLine: {
        show: true,
        lineStyle: { color: colors.gray300, type: "dashed" },
      },
      axisLine: { show: true, lineStyle: { color: colors.gray300 } },
      axisTick: { show: true, lineStyle: { color: colors.gray300 } },
      axisLabel: {
        color: colors.gray500,
        fontSize: 12,
        formatter: (value: number) => localizeDecimal(value, { decimals: 2 }),
      },
    };
  }, [points, linePoints, yAxisLabel, zoomable]);

  const series: EChartsOption["series"] = useMemo(() => {
    const scatterData = points.map((p) => ({
      value: [p.x, p.y],
      itemStyle: p.itemStyle ?? { color: colors.purple500 },
      symbol: p.symbol,
      symbolSize: p.symbolSize,
    }));

    const result: EChartsOption["series"] = [];

    if (linePoints && linePoints.length > 0) {
      for (const segment of splitLineSegments(linePoints)) {
        result.push({
          type: "line",
          data: segment.points.map((p) => ({ value: [p.x, p.y] })),
          showSymbol: false,
          lineStyle: {
            color: segment.color,
            width: 2,
          },
          emphasis: { disabled: true },
          tooltip: { show: zoomable },
        });
      }
    }

    result.push({
      type: "scatter",
      data: scatterData,
      symbol: "circle",
      symbolSize: 8,
      emphasis: {
        itemStyle: {
          color: colors.fuchsia500,
        },
      },
      z: 10,
    });

    return result;
  }, [points, linePoints, zoomable]);

  const option: EChartsOption = useMemo(
    () => ({
      animation: false,
      grid: {
        top: 16,
        right: 16,
        bottom: xAxisLabel ? 40 : 24,
        left: yAxisLabel ? 56 : 40,
        containLabel: false,
      },
      xAxis,
      yAxis,
      series,
      dataZoom: zoomable
        ? [
            {
              type: "inside",
              xAxisIndex: 0,
              filterMode: "none",
              zoomOnMouseWheel: true,
              moveOnMouseMove: true,
              moveOnMouseWheel: false,
            },
            {
              type: "inside",
              yAxisIndex: 0,
              filterMode: "none",
              zoomOnMouseWheel: true,
              moveOnMouseMove: true,
              moveOnMouseWheel: false,
            },
          ]
        : undefined,
      tooltip: {
        trigger: "item",
        backgroundColor: "white",
        borderColor: colors.gray300,
        textStyle: {
          color: colors.gray700,
          fontSize: 14,
        },
        formatter: (params: unknown) => {
          const p = params as { value: [number, number] };
          const xVal = localizeDecimal(p.value[0], { decimals: 2 });
          const yVal = localizeDecimal(p.value[1], { decimals: 2 });
          const xLabel = xAxisLabel ?? "X";
          const yLabel = yAxisLabel ?? "Y";
          return `${xLabel}: ${xVal}<br/>${yLabel}: ${yVal}`;
        },
      },
    }),
    [xAxis, yAxis, series, xAxisLabel, yAxisLabel, zoomable],
  );

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

  const onChartReady = useCallback((chart: EChartsInstance) => {
    const zr = chart.getZr();
    let handledBySeriesClick = false;

    chart.on("click", (params: { dataIndex: number; seriesType?: string }) => {
      if (params.seriesType !== "scatter") return;
      handledBySeriesClick = true;
      onPointClickRef.current?.(params.dataIndex);
    });

    zr.on("click", () => {
      if (handledBySeriesClick) {
        handledBySeriesClick = false;
        return;
      }
      onPointClickRef.current?.(null);
    });

    zr.on("mousemove", (params: { offsetX: number; offsetY: number }) => {
      const pointInPixel = [params.offsetX, params.offsetY];
      const isInGrid = chart.containPixel("grid", pointInPixel);
      zr.setCursorStyle(isInGrid ? "pointer" : "default");
    });
  }, []);

  if (points.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-subtle text-xs">
        {translate("noDataAvailable")}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex h-full w-full flex-col">
      {zoomable && (
        <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
          {zoomInstructions && (
            <p className="text-size-small text-subtle">{zoomInstructions}</p>
          )}
          <button
            type="button"
            onClick={() =>
              chartRef.current?.getEchartsInstance().dispatchAction({
                type: "dataZoom",
                batch: [
                  { dataZoomIndex: 0, start: 0, end: 100 },
                  { dataZoomIndex: 1, start: 0, end: 100 },
                ],
              })
            }
            className="min-h-11 shrink-0 rounded-md border bg-base px-3 py-2 text-size-small text-default hover:bg-base-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {resetZoomLabel}
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <ReactECharts
          ref={chartRef}
          option={option}
          style={{ height: "100%", width: "100%" }}
          opts={{ renderer: "svg" }}
          notMerge={true}
          onChartReady={onChartReady}
        />
      </div>
    </div>
  );
}

const calculateInterval = (
  values: number[],
  targetIntervalsCount = 5,
): { min: number; max: number; interval: number } => {
  if (values.length === 0) return { min: 0, max: 1, interval: 0.2 };

  const decimals = 2;
  const factor = Math.pow(10, decimals);
  const minVal = Math.floor(Math.min(...values, 0) * factor) / factor;
  const maxVal = Math.ceil(Math.max(...values, 1) * factor) / factor;
  const range = maxVal - minVal;

  if (range === 0) return { min: 0, max: 1, interval: 0.2 };

  const roughInterval = range / (targetIntervalsCount - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughInterval)));
  const normalizedInterval = roughInterval / magnitude;

  const niceFactor = [1, 2, 2.5, 5, 10].reduce((prev, curr) =>
    Math.abs(curr - normalizedInterval) < Math.abs(prev - normalizedInterval)
      ? curr
      : prev,
  );

  const niceInterval = Math.round(niceFactor * magnitude * factor) / factor;
  const min = Math.floor(minVal / niceInterval) * niceInterval;
  const max = Math.ceil(maxVal / niceInterval) * niceInterval;

  return { min, max, interval: niceInterval };
};

const splitLineSegments = (
  points: StyledPointValue[],
): { points: StyledPointValue[]; color: string }[] => {
  if (points.length < 2) return [];

  const segments: { points: StyledPointValue[]; color: string }[] = [];
  let currentColor = points[0].lineStyle?.color ?? colors.purple500;
  let currentPoints = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const segmentColor = points[i].lineStyle?.color ?? colors.purple500;
    if (segmentColor !== currentColor) {
      currentPoints.push(points[i]);
      segments.push({ points: currentPoints, color: currentColor });
      currentColor = segmentColor;
      currentPoints = [points[i]];
    } else {
      currentPoints.push(points[i]);
    }
  }

  if (currentPoints.length >= 2) {
    segments.push({ points: currentPoints, color: currentColor });
  }

  return segments;
};
