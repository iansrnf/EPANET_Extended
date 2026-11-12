import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import {
  buildLoggerPlaybackTimeline,
  getLoggerPlaybackStep,
} from "src/lib/logger-comparison/playback";
import type { LoggerPressureComparison } from "src/lib/logger-comparison";
import {
  buildLoggerPlaybackMarkerOption,
  buildLoggerPressureChartOption,
} from "./logger-pressure-chart-options";

echarts.use([
  LineChart,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  DataZoomComponent,
  SVGRenderer,
]);

type ChartSnapshot = {
  series: {
    id: string;
    data: [number, number][];
    markLine?: { data: { xAxis: number }[] };
  }[];
  dataZoom: { id: string; start: number; end: number }[];
};

describe("logger pressure playback", () => {
  it("moves and clears the marker without losing pressure series or zoom", () => {
    const start = Date.UTC(2026, 10, 11, 6);
    const history = Array.from({ length: 5 }, (_, index) => ({
      deviceId: "L1",
      timestamp: new Date(start + index * 60000).toISOString(),
      pressure: 19 + index,
    }));
    const comparison: LoggerPressureComparison = {
      status: "ready",
      samples: history.map((sample) => ({
        ...sample,
        deviceId: "simulation",
        pressure: sample.pressure + 8,
      })),
      loggerCount: 5,
      simulationCount: 5,
      pairedCount: 5,
      reportingIntervalSeconds: 60,
    };
    const chart = echarts.init(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 960,
      height: 480,
    });

    try {
      chart.setOption(
        buildLoggerPressureChartOption(
          history,
          {
            time: "Time (UTC+8)",
            pressure: "Pressure (psi)",
            unit: "psi",
          },
          "en",
          { expanded: true, comparison },
        ),
      );
      chart.dispatchAction({ type: "dataZoom", start: 20, end: 80 });
      const original = chart.getOption() as ChartSnapshot;
      const pressures = original.series.map(({ id, data }) => ({ id, data }));
      const zoom = original.dataZoom.map(({ id, start, end }) => ({
        id,
        start,
        end,
      }));
      expect(zoom).toEqual([
        { id: "logger-overview-inside", start: 20, end: 80 },
        { id: "logger-overview-slider", start: 20, end: 80 },
      ]);

      chart.setOption(buildLoggerPlaybackMarkerOption(start + 60000));
      const firstMarkerSvg = chart.renderToSVGString();
      chart.setOption(buildLoggerPlaybackMarkerOption(start + 120000));
      const moved = chart.getOption() as ChartSnapshot;
      const movedSvg = chart.renderToSVGString();

      expect(moved.series.map(({ id, data }) => ({ id, data }))).toEqual(
        pressures,
      );
      expect(moved.series[0].markLine?.data).toEqual([
        { xAxis: start + 120000 },
      ]);
      expect(
        moved.dataZoom.map(({ id, start, end }) => ({ id, start, end })),
      ).toEqual(zoom);
      expect(movedSvg).toContain("<svg");
      expect(movedSvg).not.toBe(firstMarkerSvg);

      const pixel = chart.convertToPixel({ xAxisIndex: 0 }, start + 120000);
      const timestamp = chart.convertFromPixel({ xAxisIndex: 0 }, pixel);
      expect(
        getLoggerPlaybackStep(
          buildLoggerPlaybackTimeline(history, comparison),
          timestamp,
        ),
      ).toBe(2);

      chart.setOption(buildLoggerPlaybackMarkerOption(null));
      const cleared = chart.getOption() as ChartSnapshot;
      expect(cleared.series[0].markLine?.data).toEqual([]);
      expect(cleared.series.map(({ id, data }) => ({ id, data }))).toEqual(
        pressures,
      );
      expect(
        cleared.dataZoom.map(({ id, start, end }) => ({ id, start, end })),
      ).toEqual(zoom);
      expect(chart.renderToSVGString()).not.toBe(movedSvg);
    } finally {
      chart.dispose();
    }
  });
});
