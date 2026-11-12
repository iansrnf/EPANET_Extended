import type { LoggerPressureSample } from "src/lib/logger-stream";
import type { LoggerPressureComparison } from "src/lib/logger-comparison";
import {
  buildLoggerPressureChartData,
  buildLoggerPressureChartOption,
  formatLoggerPressureTooltip,
} from "./logger-pressure-chart-options";

const sample = (timestamp: string, pressure: number): LoggerPressureSample => ({
  deviceId: "L1",
  timestamp,
  pressure,
});

const comparison = (
  samples: readonly LoggerPressureSample[],
  overrides: Partial<LoggerPressureComparison> = {},
): LoggerPressureComparison => ({
  status: "ready",
  samples,
  loggerCount: samples.length,
  simulationCount: samples.length,
  pairedCount: samples.length,
  ...overrides,
});

describe("logger pressure chart", () => {
  it("preserves irregular time spacing and exact signed pressure", () => {
    const history = [
      sample("2026-11-10T10:28:22", -0.250298),
      sample("2026-11-10T10:28:23", 0),
      sample("2026-11-10T10:28:33", 0.134567),
    ];
    const data = buildLoggerPressureChartData(history)!;

    expect(data.points.map(([, pressure]) => pressure)).toEqual([
      -0.250298, 0, 0.134567,
    ]);
    expect(data.points[0][0]).toBe(Date.UTC(2026, 10, 10, 2, 28, 22));
    expect(data.points[1][0] - data.points[0][0]).toBe(1000);
    expect(data.points[2][0] - data.points[1][0]).toBe(10000);
    expect(data.pressureRange.min).toBeLessThan(-0.250298);
    expect(data.pressureRange.max).toBeGreaterThan(0.134567);
    expect(
      buildLoggerPressureChartOption(
        history,
        { time: "Time", pressure: "Pressure (psi)", unit: "psi" },
        "en",
      ),
    ).toMatchObject({
      animation: false,
      useUTC: true,
      xAxis: { type: "time" },
      series: [{ data: data.points, smooth: false }],
    });
  });

  it.each([-0.250298, 0, 7.27])(
    "keeps a flat %s series inside visible pressure and time ranges",
    (pressure) => {
      const history = [sample("2026-11-10T10:28:22", pressure)];
      const data = buildLoggerPressureChartData(history)!;
      expect(data.points).toHaveLength(1);
      expect(data.pressureRange.min).toBeLessThan(pressure);
      expect(data.pressureRange.max).toBeGreaterThan(pressure);
      expect(data.timeRange.min).toBeLessThan(data.points[0][0]);
      expect(data.timeRange.max).toBeGreaterThan(data.points[0][0]);
      expect(
        buildLoggerPressureChartOption(
          history,
          { time: "Time", pressure: "Pressure (psi)", unit: "psi" },
          "en",
        ),
      ).toMatchObject({ series: [{ showSymbol: true }] });
    },
  );

  it("leaves an empty history empty", () => {
    expect(buildLoggerPressureChartData([])).toBeNull();
  });

  it("shows UTC+8 time and localized six-decimal pressure in the tooltip", () => {
    const point = sample("2026-11-10T10:28:22+05:30", -0.250298);
    expect(formatLoggerPressureTooltip(point, "psi", "en")).toContain(
      "12:58:22",
    );
    expect(formatLoggerPressureTooltip(point, "psi", "en")).toContain(
      "<br/><strong>-0.250298 psi</strong>",
    );
    expect(formatLoggerPressureTooltip(point, "psi", "es")).toContain(
      "-0,250298 psi",
    );
    expect(formatLoggerPressureTooltip(point, "<psi>", "en")).toContain(
      "&lt;psi&gt;",
    );
  });

  it("shows the next UTC+8 day without shifting logger or simulation timestamps", () => {
    const timestamp = "2026-11-10T16:00:03.125Z";
    const history = [sample(timestamp, -0.25)];
    const simulated = [sample(timestamp, 40)];
    const option = buildLoggerPressureChartOption(
      history,
      { time: "Time (UTC+8)", pressure: "Pressure (psi)", unit: "psi" },
      "en",
      {
        mode: "history",
        interval: "minute",
        sampleLimit: 10,
        comparison: comparison(simulated),
      },
    );
    const numericTime = Date.UTC(2026, 10, 10, 16, 0, 3, 125);
    expect(option).toMatchObject({
      useUTC: true,
      series: [{ data: [[numericTime, -0.25]] }, { data: [[numericTime, 40]] }],
    });
    const xAxis = option.xAxis as {
      axisLabel: { formatter(value: number): string };
    };
    expect(xAxis.axisLabel.formatter(numericTime)).toBe("Nov 11\n00:00");
    expect(formatLoggerPressureTooltip(history[0], "psi", "en")).toBe(
      "Nov 11, 2026, 00:00:03.125 UTC+8<br/><strong>-0.25 psi</strong>",
    );
    expect(history[0].timestamp).toBe(timestamp);
    expect(simulated[0].timestamp).toBe(timestamp);
  });

  it("aligns naive UTC+8 logger clocks with zoned simulation times without adding eight hours twice", () => {
    const history = [
      sample("2026-11-11T14:54:10", -0.25),
      sample("2026-11-11T14:55:03", 0.5),
    ];
    const simulated = [
      sample("2026-11-11T06:54:10.000Z", 40),
      sample("2026-11-11T06:55:10.000Z", 41),
    ];
    const option = buildLoggerPressureChartOption(
      history,
      {
        time: "Time (UTC+8)",
        pressure: "Pressure (psi)",
        unit: "psi",
        logger: "Logger",
        simulated: "Simulated",
      },
      "en",
      {
        mode: "realtime",
        comparison: comparison(simulated, { reportingIntervalSeconds: 60 }),
      },
    );

    expect(option).toMatchObject({
      series: [
        {
          data: [
            [Date.UTC(2026, 10, 11, 6, 54, 10), -0.25],
            [Date.UTC(2026, 10, 11, 6, 55, 3), 0.5],
          ],
        },
        {
          data: [
            [Date.UTC(2026, 10, 11, 6, 54, 10), 40],
            [Date.UTC(2026, 10, 11, 6, 55, 10), 41],
          ],
        },
      ],
    });
    const xAxis = option.xAxis as {
      axisLabel: { formatter(value: number): string };
    };
    expect(xAxis.axisLabel.formatter(Date.UTC(2026, 10, 11, 6, 54, 10))).toBe(
      "14:54:10",
    );
    const tooltip = option.tooltip as {
      formatter(items: { seriesId: string; dataIndex: number }[]): string;
    };
    const content = tooltip.formatter([{ seriesId: "logger", dataIndex: 0 }]);
    expect(content).toContain("Logger");
    expect(content).toContain("Simulated");
    expect(content).toContain("14:54:10 UTC+8");
    expect(content).not.toContain("22:54:10");
    expect(history[0].timestamp).toBe("2026-11-11T14:54:10");
    expect(simulated[0].timestamp).toBe("2026-11-11T06:54:10.000Z");
  });

  it("shows sparse hourly readings within the requested UTC date range", () => {
    const history = [sample("2026-03-11T06:49:55.703Z", -0.03768)];
    const option = buildLoggerPressureChartOption(
      history,
      { time: "Time (UTC)", pressure: "Pressure (psi)", unit: "psi" },
      "en",
      {
        mode: "history",
        range: {
          from: "2026-03-10T00:00:00Z",
          to: "2026-03-11T23:59:59Z",
        },
      },
    );

    expect(option).toMatchObject({
      xAxis: {
        type: "time",
        min: Date.UTC(2026, 2, 10),
        max: Date.UTC(2026, 2, 11, 23, 59, 59),
        minInterval: 3600000,
      },
      series: [
        {
          data: [[Date.UTC(2026, 2, 11, 6, 49, 55, 703), -0.03768]],
          showSymbol: true,
        },
      ],
    });
    const xAxis = option.xAxis as {
      axisLabel: { formatter(value: number): string };
    };
    expect(xAxis.axisLabel.formatter(Date.UTC(2026, 2, 10))).toBe(
      "Mar 10\n08:00",
    );
    expect(xAxis.axisLabel.formatter(Date.UTC(2026, 2, 11))).toBe(
      "Mar 11\n08:00",
    );
  });

  it("focuses limited history on its selected readings instead of the whole request", () => {
    const history = [
      sample("2026-03-11T06:00:03Z", -0.03768),
      sample("2026-03-11T07:00:05Z", 0),
    ];
    const option = buildLoggerPressureChartOption(
      history,
      { time: "Time (UTC)", pressure: "Pressure (psi)", unit: "psi" },
      "en",
      {
        mode: "history",
        sampleLimit: 10,
        range: {
          from: "2026-01-01T00:00:00Z",
          to: "2026-03-11T23:59:59Z",
        },
      },
    );

    expect(option).toMatchObject({
      xAxis: {
        min: Date.UTC(2026, 2, 11, 6),
        max: Date.UTC(2026, 2, 11, 8),
      },
      series: [
        {
          data: [
            [Date.UTC(2026, 2, 11, 6, 0, 3), -0.03768],
            [Date.UTC(2026, 2, 11, 7, 0, 5), 0],
          ],
        },
      ],
    });
  });

  it("handles all available histories larger than function argument limits", () => {
    const length = 140000;
    const start = Date.UTC(2000, 0, 1);
    const history = Array.from({ length }, (_, index) =>
      sample(new Date(start + index * 3600000).toISOString(), index - 70000),
    );
    const data = buildLoggerPressureChartData(history)!;

    expect(data.points).toHaveLength(length);
    expect(data.timeRange).toEqual({
      min: start,
      max: start + (length - 1) * 3600000,
    });
    expect(data.pressureRange.min).toBeLessThan(-70000);
    expect(data.pressureRange.max).toBeGreaterThan(69999);
  });

  it("gives a single limited hourly sample readable UTC hour boundaries", () => {
    const history = [sample("2026-03-11T14:49:55.703+08:00", -0.03768)];
    const option = buildLoggerPressureChartOption(
      history,
      { time: "Time (UTC)", pressure: "Pressure (psi)", unit: "psi" },
      "en",
      {
        mode: "history",
        sampleLimit: 10,
        range: {
          from: "2026-03-10T00:00:00Z",
          to: "2026-03-11T23:59:59Z",
        },
      },
    );

    expect(option).toMatchObject({
      xAxis: {
        min: Date.UTC(2026, 2, 11, 6),
        max: Date.UTC(2026, 2, 11, 7),
        minInterval: 3600000,
      },
      series: [
        {
          data: [[Date.UTC(2026, 2, 11, 6, 49, 55, 703), -0.03768]],
          showSymbol: true,
        },
      ],
    });
  });

  it("shows minute bucket boundaries while preserving each actual reading time", () => {
    const history = [
      sample("2026-03-11T06:49:59Z", -0.03768),
      sample("2026-03-11T06:50:01Z", 0),
    ];
    const option = buildLoggerPressureChartOption(
      history,
      { time: "Time (UTC)", pressure: "Pressure (psi)", unit: "psi" },
      "en",
      { mode: "history", interval: "minute", sampleLimit: 10 },
    );

    expect(option).toMatchObject({
      xAxis: {
        min: Date.UTC(2026, 2, 11, 6, 49),
        max: Date.UTC(2026, 2, 11, 6, 51),
        minInterval: 60000,
      },
      series: [
        {
          data: [
            [Date.UTC(2026, 2, 11, 6, 49, 59), -0.03768],
            [Date.UTC(2026, 2, 11, 6, 50, 1), 0],
          ],
        },
      ],
    });
  });

  it("shows one minute in UTC even when the sample contains a timezone offset", () => {
    const point = sample("2026-03-11T14:49:55.703+08:00", -0.03768);
    const option = buildLoggerPressureChartOption(
      [point],
      { time: "Time (UTC)", pressure: "Pressure (psi)", unit: "psi" },
      "en",
      { mode: "history", interval: "minute", sampleLimit: 10 },
    );

    expect(option).toMatchObject({
      xAxis: {
        min: Date.UTC(2026, 2, 11, 6, 49),
        max: Date.UTC(2026, 2, 11, 6, 50),
        minInterval: 60000,
      },
      series: [{ data: [[Date.UTC(2026, 2, 11, 6, 49, 55, 703), -0.03768]] }],
    });
    expect(formatLoggerPressureTooltip(point, "psi", "en")).toContain(
      "14:49:55.703",
    );
  });

  it("shows both pressure ranges with distinct line styles and real time spacing", () => {
    const history = [
      sample("2026-11-10T01:00:10Z", -0.25),
      sample("2026-11-10T01:01:03Z", 0.5),
    ];
    const simulation = [
      sample("2026-11-10T01:00:10Z", 40),
      sample("2026-11-10T01:01:10Z", 42),
    ];
    const option = buildLoggerPressureChartOption(
      history,
      {
        time: "Time (UTC)",
        pressure: "Pressure (psi)",
        unit: "psi",
        logger: "Logger",
        simulated: "Simulated",
      },
      "en",
      {
        mode: "history",
        interval: "minute",
        sampleLimit: 100,
        expanded: true,
        comparison: comparison(simulation),
      },
    );
    expect(option).toMatchObject({
      yAxis: {
        min: expect.any(Number),
        max: expect.any(Number),
      },
      series: [
        {
          id: "logger",
          name: "Logger",
          data: [
            [Date.UTC(2026, 10, 10, 1, 0, 10), -0.25],
            [Date.UTC(2026, 10, 10, 1, 1, 3), 0.5],
          ],
          lineStyle: { color: "#0d9488" },
          areaStyle: { opacity: 0 },
        },
        {
          id: "simulation",
          name: "Simulated",
          data: [
            [Date.UTC(2026, 10, 10, 1, 0, 10), 40],
            [Date.UTC(2026, 10, 10, 1, 1, 10), 42],
          ],
          lineStyle: { color: "#7c3aed", type: "dashed" },
        },
      ],
      dataZoom: [{ type: "inside" }, { type: "slider" }],
    });
    const axis = option.yAxis as { min: number; max: number };
    expect(axis.min).toBeLessThan(-0.25);
    expect(axis.max).toBeGreaterThan(42);
  });

  it("keeps simulated gaps and resolves each tooltip to its original series sample", () => {
    const history = [
      sample("2026-11-10T01:00:10Z", -0.25),
      sample("2026-11-10T01:02:03Z", 0.5),
    ];
    const simulation = [
      sample("2026-11-10T01:00:10Z", 40),
      sample("2026-11-10T01:02:10Z", 42),
    ];
    const option = buildLoggerPressureChartOption(
      history,
      {
        time: "Time (UTC)",
        pressure: "Pressure (psi)",
        unit: "psi",
        logger: "Logger <L1>",
        simulated: "Simulated <J1>",
      },
      "en",
      {
        mode: "history",
        comparison: comparison(simulation, {
          missingTimestamps: ["2026-11-10T01:01:10Z"],
        }),
      },
    );
    expect(option).toMatchObject({
      series: [
        {},
        {
          data: [
            [Date.UTC(2026, 10, 10, 1, 0, 10), 40],
            [Date.UTC(2026, 10, 10, 1, 1, 10), null],
            [Date.UTC(2026, 10, 10, 1, 2, 10), 42],
          ],
          connectNulls: false,
        },
      ],
    });
    const tooltip = option.tooltip as {
      formatter(items: { seriesId: string; dataIndex: number }[]): string;
    };
    const content = tooltip.formatter([
      { seriesId: "logger", dataIndex: 1 },
      { seriesId: "simulation", dataIndex: 2 },
    ]);
    expect(content).toContain("Logger &lt;L1&gt;");
    expect(content).toContain("09:02:03");
    expect(content).toContain("0.5 psi");
    expect(content).toContain("Simulated &lt;J1&gt;");
    expect(content).toContain("09:02:10");
    expect(content).toContain("42 psi");
    expect(
      tooltip.formatter([{ seriesId: "simulation", dataIndex: 1 }]),
    ).not.toContain("Simulated &lt;J1&gt;");
  });

  it.each([
    [42, 40, "Logger", "Simulated"],
    [40, 42, "Simulated", "Logger"],
    [0, 0, "Simulated", "Logger"],
    [-0.1, -0.25, "Logger", "Simulated"],
    [-0.25, 0, "Simulated", "Logger"],
    [0, -0.25, "Logger", "Simulated"],
  ] as const)(
    "orders tooltip pressure %s versus %s independently of incoming series order",
    (loggerPressure, simulatedPressure, firstLabel, secondLabel) => {
      const timestamp = "2026-11-11T06:54:10Z";
      const option = buildLoggerPressureChartOption(
        [sample(timestamp, loggerPressure)],
        {
          time: "Time (UTC+8)",
          pressure: "Pressure (psi)",
          unit: "psi",
          logger: "Logger",
          simulated: "Simulated",
        },
        "en",
        {
          comparison: comparison([sample(timestamp, simulatedPressure)]),
        },
      );
      const tooltip = option.tooltip as {
        formatter(items: { seriesId: string; dataIndex: number }[]): string;
      };
      for (const order of [
        ["logger", "simulation"],
        ["simulation", "logger"],
      ]) {
        const content = tooltip.formatter(
          order.map((seriesId) => ({ seriesId, dataIndex: 0 })),
        );
        const firstIndex = content.indexOf(`${firstLabel}<br/>`);
        const secondIndex = content.indexOf(`${secondLabel}<br/>`);
        expect(firstIndex).toBeGreaterThanOrEqual(0);
        expect(secondIndex).toBeGreaterThan(firstIndex);
      }
      expect((option.series as { id: string }[]).map(({ id }) => id)).toEqual([
        "logger",
        "simulation",
      ]);
    },
  );

  it("shows both nearby readings when the axis tooltip supplies only one jittered series", () => {
    const history = [
      sample("2026-11-10T01:00:10Z", -0.25),
      sample("2026-11-10T01:01:03Z", 0.5),
      sample("2026-11-10T01:02:15Z", 0.6),
    ];
    const simulation = [
      sample("2026-11-10T01:00:10Z", 40),
      sample("2026-11-10T01:01:10Z", 41),
      sample("2026-11-10T01:02:10Z", 42),
    ];
    const option = buildLoggerPressureChartOption(
      history,
      {
        time: "Time (UTC)",
        pressure: "Pressure (psi)",
        unit: "psi",
        logger: "Logger",
        simulated: "Simulated",
      },
      "en",
      {
        mode: "history",
        interval: "minute",
        comparison: comparison(simulation, { reportingIntervalSeconds: 60 }),
      },
    );
    const tooltip = option.tooltip as {
      formatter(items: { seriesId: string; dataIndex: number }[]): string;
    };
    for (const seriesId of ["logger", "simulation"]) {
      const content = tooltip.formatter([{ seriesId, dataIndex: 1 }]);
      expect(content).toContain("Logger");
      expect(content).toContain("09:01:03");
      expect(content).toContain("0.5 psi");
      expect(content).toContain("Simulated");
      expect(content).toContain("09:01:10");
      expect(content).toContain("41 psi");
    }
  });

  it("does not fill the shared tooltip with missing, distant, or uncovered simulated readings", () => {
    const history = [
      sample("2026-11-10T01:00:10Z", -0.25),
      sample("2026-11-10T01:01:03Z", 0.5),
      sample("2026-11-10T01:02:03Z", 0.6),
      sample("2026-11-10T01:04:03Z", 0.7),
    ];
    const simulation = [
      sample("2026-11-10T01:00:10Z", 40),
      sample("2026-11-10T01:03:10Z", 43),
    ];
    const option = buildLoggerPressureChartOption(
      history,
      {
        time: "Time (UTC)",
        pressure: "Pressure (psi)",
        unit: "psi",
        logger: "Logger",
        simulated: "Simulated",
      },
      "en",
      {
        mode: "history",
        interval: "minute",
        comparison: comparison(simulation, {
          reportingIntervalSeconds: 60,
          missingTimestamps: ["2026-11-10T01:01:10Z"],
        }),
      },
    );
    const tooltip = option.tooltip as {
      formatter(items: { seriesId: string; dataIndex: number }[]): string;
    };
    for (const dataIndex of [1, 2, 3]) {
      const content = tooltip.formatter([{ seriesId: "logger", dataIndex }]);
      expect(content).toContain("Logger");
      expect(content).not.toContain("Simulated");
      expect(content).not.toContain("40 psi");
      expect(content).not.toContain("43 psi");
    }
  });

  it("omits unavailable or stale simulation values from the plotted series", () => {
    const history = [sample("2026-11-10T01:00:10Z", -0.25)];
    const option = buildLoggerPressureChartOption(
      history,
      { time: "Time", pressure: "Pressure (psi)", unit: "psi" },
      "en",
      {
        comparison: comparison([sample("2026-11-10T01:00:10Z", 999)], {
          status: "staleSimulation",
        }),
      },
    );
    expect(option.series).toHaveLength(1);
    expect((option.yAxis as { max: number }).max).toBeLessThan(0);
  });

  it("opens the expanded overview on the displayed readings rather than the broad request window", () => {
    const history = [
      sample("2026-03-11T06:49:55Z", -0.25),
      sample("2026-03-11T06:50:03Z", 0.5),
    ];
    const labels = {
      time: "Time (UTC+8)",
      pressure: "Pressure (psi)",
      unit: "psi",
    };
    const context = {
      mode: "history" as const,
      interval: "minute" as const,
      range: {
        from: "2026-01-01T00:00:00Z",
        to: "2026-03-31T23:59:59Z",
      },
    };
    const inline = buildLoggerPressureChartOption(
      history,
      labels,
      "en",
      context,
    );
    const expanded = buildLoggerPressureChartOption(history, labels, "en", {
      ...context,
      expanded: true,
    });

    expect(inline).toMatchObject({
      xAxis: {
        min: Date.UTC(2026, 0, 1),
        max: Date.UTC(2026, 2, 31, 23, 59, 59),
        minInterval: 60000,
      },
    });
    expect(expanded).toMatchObject({
      xAxis: {
        min: Date.UTC(2026, 2, 11, 6, 49, 55),
        max: Date.UTC(2026, 2, 11, 6, 50, 3),
        minInterval: 1000,
      },
      series: [{ emphasis: { disabled: false } }],
      tooltip: { axisPointer: { type: "cross", label: { show: false } } },
      dataZoom: [
        { type: "inside" },
        { type: "slider", height: 44, showDataShadow: true },
      ],
    });
    expect(
      (expanded.series as { data: unknown }[]).map((series) => series.data),
    ).toEqual(
      (inline.series as { data: unknown }[]).map((series) => series.data),
    );
    const xAxis = expanded.xAxis as {
      axisLabel: { formatter(value: number): string };
    };
    expect(xAxis.axisLabel.formatter(Date.UTC(2026, 2, 11, 6, 49, 55))).toBe(
      "Mar 11\n14:49:55",
    );
  });

  it("fits both displayed series into the expanded overview without changing their timestamps", () => {
    const history = [
      sample("2026-11-10T01:00:10Z", -0.25),
      sample("2026-11-10T01:01:03Z", 0.5),
    ];
    const simulated = [
      sample("2026-11-10T01:00:10Z", 40),
      sample("2026-11-10T01:01:10Z", 41),
    ];
    const option = buildLoggerPressureChartOption(
      history,
      { time: "Time (UTC+8)", pressure: "Pressure (psi)", unit: "psi" },
      "en",
      {
        expanded: true,
        mode: "history",
        interval: "minute",
        comparison: comparison(simulated),
      },
    );

    expect(option).toMatchObject({
      xAxis: {
        min: Date.UTC(2026, 10, 10, 1, 0, 10),
        max: Date.UTC(2026, 10, 10, 1, 1, 10),
      },
      series: [
        {
          data: [
            [Date.UTC(2026, 10, 10, 1, 0, 10), -0.25],
            [Date.UTC(2026, 10, 10, 1, 1, 3), 0.5],
          ],
        },
        {
          data: [
            [Date.UTC(2026, 10, 10, 1, 0, 10), 40],
            [Date.UTC(2026, 10, 10, 1, 1, 10), 41],
          ],
        },
      ],
    });
  });

  it("leaves existing manual zoom ranges untouched when expanded live data updates", () => {
    const labels = { time: "Time", pressure: "Pressure (psi)", unit: "psi" };
    const first = [sample("2026-11-10T01:00:10Z", -0.25)];
    const next = [...first, sample("2026-11-10T01:01:10Z", 0.5)];
    const firstOption = buildLoggerPressureChartOption(first, labels, "en", {
      expanded: true,
    });
    const nextOption = buildLoggerPressureChartOption(next, labels, "en", {
      expanded: true,
    });

    for (const option of [firstOption, nextOption]) {
      const zooms = option.dataZoom as Record<string, unknown>[];
      expect(zooms.map((zoom) => zoom.id)).toEqual([
        "logger-overview-inside",
        "logger-overview-slider",
      ]);
      for (const zoom of zooms) {
        for (const range of ["start", "end", "startValue", "endValue"]) {
          expect(zoom).not.toHaveProperty(range);
        }
      }
    }
  });
});
