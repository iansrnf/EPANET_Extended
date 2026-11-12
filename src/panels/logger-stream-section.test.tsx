import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { useLoggerStreamActions } from "src/commands/logger-stream";
import {
  createInitialLoggerStreamState,
  type LoggerReading,
  type LoggerStreamState,
} from "src/lib/logger-stream";
import { projectSettingsAtom } from "src/state/project-settings";
import { loggerStreamsAtom } from "src/state/logger-stream";
import {
  createInitialLoggerHistoryViewState,
  loggerHistoryViewsAtom,
  type LoggerHistoryViewState,
} from "src/state/logger-history";
import { selectedLoggerIdAtom } from "src/state/loggers";
import { LoggerStreamSection } from "./logger-stream-section";

vi.mock("src/commands/logger-stream", () => ({
  useLoggerStreamActions: vi.fn(),
}));

vi.mock("echarts-for-react/lib/core", async () => {
  const { forwardRef } = await import("react");
  const MockChart = forwardRef(() => null);
  MockChart.displayName = "MockChart";
  return { default: MockChart };
});

const IDS = { LOGGER: "logger-1" } as const;

const reading: LoggerReading = {
  deviceId: "L1",
  type: "pressure",
  timestamp: "2026-11-10T10:28:23",
  pressure: -0.250298,
  pressureTimestamp: "2026-11-10T10:28:22",
  status: "online",
  temp_or_status: 31,
  battery_v: 7.27,
  external_v: 5.14,
  gsm_pct: 48,
  raw: "SIMULATED_PRESSURE",
};

const createLoggerStore = (stream: LoggerStreamState) => {
  const store = createStore();
  store.set(projectSettingsAtom, {
    ...store.get(projectSettingsAtom),
    loggers: [
      {
        id: IDS.LOGGER,
        label: "Logger 1",
        coordinates: [0, 0],
        connection: null,
      },
    ],
  });
  store.set(selectedLoggerIdAtom, IDS.LOGGER);
  store.set(loggerStreamsAtom, new Map([[IDS.LOGGER, stream]]));
  return store;
};

const renderStream = (store: ReturnType<typeof createLoggerStore>) =>
  render(
    <Provider store={store}>
      <LoggerStreamSection loggerId={IDS.LOGGER} />
    </Provider>,
  );

const telemetryValue = (label: string) =>
  screen.getByText(label).parentElement!;

describe("logger live readings", () => {
  beforeEach(() => {
    vi.mocked(useLoggerStreamActions).mockReturnValue({
      startLoggerStream: vi.fn(),
      stopLoggerStream: vi.fn(),
      toggleLoggerStream: vi.fn(),
      setLoggerDeviceId: vi.fn(),
    });
  });

  it("keeps source precision and UTC+8 pressure time after the sidebar remounts", () => {
    const stream: LoggerStreamState = {
      ...createInitialLoggerStreamState("L1"),
      status: "connected",
      isRunning: true,
      reading,
      history: [
        {
          deviceId: reading.deviceId,
          timestamp: reading.pressureTimestamp!,
          pressure: reading.pressure!,
        },
      ],
    };
    const store = createLoggerStore(stream);
    const view = renderStream(store);

    expect(screen.getByLabelText("Pressure")).toHaveTextContent("-0.250298");
    expect(screen.getByLabelText("Pressure")).toHaveTextContent("psi");
    const summary =
      "1 pressure samples from Nov 10, 2026, 10:28:22 UTC+8 to Nov 10, 2026, 10:28:22 UTC+8. Latest pressure: -0.250298 psi.";
    expect(screen.getByRole("img", { name: summary })).toHaveAttribute(
      "aria-live",
      "off",
    );
    expect(
      within(telemetryValue("Pressure timestamp")).getByText(
        "Nov 10, 2026, 10:28:22 UTC+8",
      ),
    ).toHaveAttribute("datetime", reading.pressureTimestamp);
    expect(
      within(telemetryValue("Latest packet")).getByText(
        "Nov 10, 2026, 10:28:23 UTC+8",
      ),
    ).toHaveAttribute("datetime", reading.timestamp);

    view.unmount();
    expect(store.get(loggerStreamsAtom).get(IDS.LOGGER)?.reading).toBe(reading);
    renderStream(store);

    expect(screen.getByLabelText("Pressure")).toHaveTextContent("-0.250298");
    expect(screen.getByRole("img", { name: summary })).toBeInTheDocument();

    act(() => {
      store.set(
        loggerStreamsAtom,
        new Map([
          [
            IDS.LOGGER,
            {
              ...stream,
              isRunning: false,
              status: "disconnected",
              deviceId: "L2",
            },
          ],
        ]),
      );
    });

    expect(screen.getByLabelText("Pressure")).toHaveTextContent("-0.250298");
    expect(screen.getByText("Reading from L1")).toBeInTheDocument();
    expect(screen.getByLabelText("Device ID")).toHaveValue("L2");
    expect(screen.getByText("Last received reading")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: summary })).toBeInTheDocument();
    expect(store.get(loggerStreamsAtom).get(IDS.LOGGER)?.history).toBe(
      stream.history,
    );
  });

  it("distinguishes a missing pressure from a real zero reading", () => {
    const stream: LoggerStreamState = {
      ...createInitialLoggerStreamState("L1"),
      isRunning: true,
      status: "reconnecting",
      reading: {
        deviceId: "L1",
        type: "device_status",
        timestamp: reading.timestamp,
        status: "online",
        battery_v: 0,
        external_v: 0,
        gsm_pct: 0,
        temp_or_status: 31,
      },
    };
    const store = createLoggerStore(stream);
    renderStream(store);

    expect(screen.getByLabelText("Pressure")).toHaveTextContent("—");
    expect(
      screen.getByRole("button", { name: "Stop logger stream" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Stop logger stream" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(telemetryValue("Battery")).toHaveTextContent("0V");
    expect(telemetryValue("External supply")).toHaveTextContent("0V");
    expect(telemetryValue("GSM signal")).toHaveTextContent("0%");
    expect(telemetryValue("Temperature / status")).toHaveTextContent("31");
    expect(telemetryValue("Temperature / status")).not.toHaveTextContent("°C");

    act(() => {
      store.set(
        loggerStreamsAtom,
        new Map([
          [IDS.LOGGER, { ...stream, reading: { ...reading, pressure: 0 } }],
        ]),
      );
    });

    expect(screen.getByLabelText("Pressure")).toHaveTextContent("0psi");
    expect(screen.getByLabelText("Pressure")).not.toHaveTextContent("—");
  });

  it("keeps loaded history separate from live updates and sidebar remounts", () => {
    const stream: LoggerStreamState = {
      ...createInitialLoggerStreamState("L1"),
      status: "connected",
      isRunning: true,
      reading,
    };
    const historical: LoggerHistoryViewState = {
      ...createInitialLoggerHistoryViewState(),
      mode: "history",
      from: "2026-03-10T08:00",
      to: "2026-03-12T07:59:59",
      status: "loaded",
      samples: [
        {
          deviceId: "L2",
          timestamp: "2026-03-10T00:00:03Z",
          pressure: -0.03768,
        },
        {
          deviceId: "L2",
          timestamp: "2026-03-10T01:00:05Z",
          pressure: 0,
        },
      ],
      loadedRange: {
        from: "2026-03-10T00:00:00Z",
        to: "2026-03-11T23:59:59Z",
      },
      loadedDeviceId: "L2",
    };
    historical.allSamples = historical.samples;
    historical.minuteSamples = historical.samples;
    historical.loadedInterval = "hourly";
    const store = createLoggerStore(stream);
    store.set(loggerHistoryViewsAtom, new Map([[IDS.LOGGER, historical]]));
    const view = renderStream(store);
    const summary =
      "2 hourly pressure samples from Mar 10, 2026, 08:00:03 UTC+8 to Mar 10, 2026, 09:00:05 UTC+8. Last historical pressure: 0 psi.";

    expect(screen.getByRole("img", { name: summary })).toBeInTheDocument();
    expect(screen.getByText("Current live pressure")).toBeInTheDocument();
    expect(screen.getByText("Showing L2 · UTC+8")).toBeInTheDocument();

    act(() => {
      store.set(
        loggerStreamsAtom,
        new Map([
          [
            IDS.LOGGER,
            {
              ...stream,
              reading: { ...reading, pressure: 0.125 },
              history: [
                {
                  deviceId: reading.deviceId,
                  timestamp: reading.pressureTimestamp!,
                  pressure: 0.125,
                },
              ],
            },
          ],
        ]),
      );
    });

    expect(screen.getByLabelText("Pressure")).toHaveTextContent("0.125");
    expect(screen.getByRole("img", { name: summary })).toBeInTheDocument();
    view.unmount();
    renderStream(store);
    expect(screen.getByLabelText("From (UTC+8)")).toHaveValue(historical.from);
    expect(screen.getByLabelText("To (UTC+8)")).toHaveProperty(
      "valueAsNumber",
      Date.parse(`${historical.to}Z`),
    );
    expect(screen.getByRole("img", { name: summary })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Real time" }));
    expect(screen.getByRole("img")).toHaveAccessibleName(
      /Latest pressure: 0.125 psi/,
    );
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByRole("img", { name: summary })).toBeInTheDocument();
    expect(store.get(loggerStreamsAtom).get(IDS.LOGGER)?.isRunning).toBe(true);
    expect(store.get(loggerHistoryViewsAtom).get(IDS.LOGGER)?.samples).toBe(
      historical.samples,
    );
  });

  it("changes historical sample counts from the retained cache while live readings stay independent", () => {
    const stream: LoggerStreamState = {
      ...createInitialLoggerStreamState("L1"),
      status: "connected",
      isRunning: true,
      reading,
    };
    const allSamples = Array.from({ length: 200 }, (_, index) => ({
      deviceId: "L1",
      timestamp: new Date(Date.UTC(2026, 0, 1, index, 0, 3)).toISOString(),
      pressure: index - 100,
    }));
    const historical: LoggerHistoryViewState = {
      ...createInitialLoggerHistoryViewState(),
      mode: "history",
      status: "loaded",
      samples: allSamples,
      allSamples,
      minuteSamples: allSamples,
      loadedInterval: "hourly",
      loadedRange: {
        from: "2026-01-01T00:00:00Z",
        to: "2026-01-10T00:00:00Z",
      },
      loadedDeviceId: "L1",
    };
    const store = createLoggerStore(stream);
    store.set(loggerHistoryViewsAtom, new Map([[IDS.LOGGER, historical]]));
    const view = renderStream(store);

    expect(screen.getByRole("img")).toHaveAccessibleName(
      /^200 hourly pressure samples/,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Samples" }));
    fireEvent.click(screen.getByRole("option", { name: "10 samples" }));
    expect(screen.getByRole("img")).toHaveAccessibleName(
      /^10 hourly pressure samples/,
    );
    expect(store.get(loggerHistoryViewsAtom).get(IDS.LOGGER)?.samples).toEqual(
      allSamples.slice(-10),
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Samples" }));
    fireEvent.click(screen.getByRole("option", { name: "Custom" }));
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Number of samples" }),
      {
        target: { value: "175" },
      },
    );
    expect(screen.getByRole("img")).toHaveAccessibleName(
      /^175 hourly pressure samples/,
    );
    const retained = store.get(loggerHistoryViewsAtom).get(IDS.LOGGER)?.samples;
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Number of samples" }),
      {
        target: { value: "0" },
      },
    );
    expect(
      screen.getByRole("spinbutton", { name: "Number of samples" }),
    ).toHaveAttribute("aria-invalid", "true");
    expect(store.get(loggerHistoryViewsAtom).get(IDS.LOGGER)?.samples).toBe(
      retained,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Samples" }));
    fireEvent.click(screen.getByRole("option", { name: "All available (∞)" }));
    expect(screen.getByRole("img")).toHaveAccessibleName(
      /^200 hourly pressure samples/,
    );
    view.unmount();
    renderStream(store);
    expect(screen.getByRole("img")).toHaveAccessibleName(
      /^200 hourly pressure samples/,
    );
    expect(store.get(loggerHistoryViewsAtom).get(IDS.LOGGER)?.allSamples).toBe(
      allSamples,
    );
    expect(screen.getByLabelText("Pressure")).toHaveTextContent("-0.250298");
    expect(store.get(loggerStreamsAtom).get(IDS.LOGGER)?.isRunning).toBe(true);
  });

  it("switches cached minute and hourly points without changing live pressure", () => {
    const stream: LoggerStreamState = {
      ...createInitialLoggerStreamState("L1"),
      status: "connected",
      isRunning: true,
      reading,
    };
    const minuteSamples = [
      {
        deviceId: "L2",
        timestamp: "2026-03-10T00:00:10Z",
        pressure: -0.03768,
      },
      {
        deviceId: "L2",
        timestamp: "2026-03-10T00:01:20Z",
        pressure: 0.5,
      },
      {
        deviceId: "L2",
        timestamp: "2026-03-10T01:00:03Z",
        pressure: 0,
      },
    ];
    const hourlySamples = [minuteSamples[0], minuteSamples[2]];
    const historical: LoggerHistoryViewState = {
      ...createInitialLoggerHistoryViewState(),
      mode: "history",
      from: "2026-03-10T08:00:00",
      to: "2026-03-10T09:30:00",
      status: "loaded",
      samples: hourlySamples,
      allSamples: hourlySamples,
      minuteSamples,
      loadedRange: {
        from: "2026-03-10T00:00:00Z",
        to: "2026-03-10T01:30:00Z",
      },
      loadedDeviceId: "L2",
      loadedInterval: "hourly",
    };
    const store = createLoggerStore(stream);
    store.set(loggerHistoryViewsAtom, new Map([[IDS.LOGGER, historical]]));
    const view = renderStream(store);

    expect(screen.getByRole("img")).toHaveAccessibleName(
      /^2 hourly pressure samples/,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Sampling" }));
    fireEvent.click(screen.getByRole("option", { name: "Minute" }));
    expect(screen.getByRole("img")).toHaveAccessibleName(
      /^3 minute pressure samples/,
    );
    expect(screen.getByText("Minute pressure history")).toBeInTheDocument();
    expect(store.get(loggerHistoryViewsAtom).get(IDS.LOGGER)?.samples).toEqual(
      minuteSamples,
    );
    expect(screen.getByLabelText("Pressure")).toHaveTextContent("-0.250298");

    view.unmount();
    renderStream(store);
    expect(
      screen.getByRole("combobox", { name: "Sampling" }),
    ).toHaveTextContent("Minute");
    expect(screen.getByRole("img")).toHaveAccessibleName(
      /^3 minute pressure samples/,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Sampling" }));
    fireEvent.click(screen.getByRole("option", { name: "Hourly" }));
    expect(store.get(loggerHistoryViewsAtom).get(IDS.LOGGER)?.samples).toEqual(
      hourlySamples,
    );
    expect(
      store.get(loggerHistoryViewsAtom).get(IDS.LOGGER)?.minuteSamples,
    ).toBe(minuteSamples);
    expect(store.get(loggerStreamsAtom).get(IDS.LOGGER)?.isRunning).toBe(true);
  });
});
