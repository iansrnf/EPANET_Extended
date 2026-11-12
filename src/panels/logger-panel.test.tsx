import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider, createStore } from "jotai";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@epanet-js/ui-kit";
import type { Logger } from "@epanet-js/project-settings";
import { useLoggerActions } from "src/commands/logger-actions";
import { useIsEditionBlocked } from "src/hooks/use-is-edition-blocked";
import { projectSettingsAtom } from "src/state/project-settings";
import { selectedLoggerIdAtom } from "src/state/loggers";
import { modeAtom, Mode } from "src/state/mode";
import { LoggerPanel } from "./logger-panel";

vi.mock("src/commands/logger-actions", () => ({
  useLoggerActions: vi.fn(),
}));

vi.mock("src/hooks/use-is-edition-blocked", () => ({
  useIsEditionBlocked: vi.fn(() => false),
}));

vi.mock("src/hooks/use-is-drawing-available", () => ({
  useIsDrawingAvailable: () => true,
}));

vi.mock("src/hooks/use-zoom-to", () => ({
  useZoomTo: () => vi.fn(),
}));

const IDS = { LOGGER1: "logger-1", LOGGER2: "logger-2", J1: 1 } as const;

const loggers: Logger[] = [
  {
    id: IDS.LOGGER1,
    label: "Pressure west",
    coordinates: [0, 0],
    connection: null,
  },
  {
    id: IDS.LOGGER2,
    label: "Pressure east",
    coordinates: [1, 1],
    connection: null,
  },
];

const renderPanel = (mode = Mode.NONE) => {
  const store = createStore();
  store.set(modeAtom, { mode });
  store.set(projectSettingsAtom, {
    ...store.get(projectSettingsAtom),
    loggers,
  });
  store.set(selectedLoggerIdAtom, IDS.LOGGER1);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Provider store={store}>
        <TooltipProvider>
          <LoggerPanel />
        </TooltipProvider>
      </Provider>
    </QueryClientProvider>,
  );
  return store;
};

describe("LoggerPanel label validation", () => {
  const renameLogger = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    renameLogger.mockClear();
    vi.mocked(useIsEditionBlocked).mockReturnValue(false);
    vi.mocked(useLoggerActions).mockReturnValue({
      addLogger: vi.fn(),
      moveLogger: vi.fn(),
      connectLogger: vi.fn(),
      disconnectLogger: vi.fn(),
      deleteLogger: vi.fn(),
      renameLogger,
      selectLogger: vi.fn(),
      startConnection: vi.fn(),
      cancelConnection: vi.fn(),
    });
  });

  it("keeps a duplicate edit pending until a unique name is entered", async () => {
    renderPanel();
    const user = userEvent.setup();
    const input = screen.getByRole("textbox", { name: /Logger/ });

    await user.click(input);
    await user.keyboard("  pressure EAST  {Enter}");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "A Logger with this name already exists.",
    );
    expect(renameLogger).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");

    await user.clear(input);
    await user.type(input, "  Pressure north  {Enter}");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(renameLogger).toHaveBeenCalledWith(IDS.LOGGER1, "Pressure north");
  });

  it("discards a pending validation error when another logger is selected", async () => {
    const store = renderPanel();
    const user = userEvent.setup();
    const input = screen.getByRole("textbox", { name: /Logger/ });

    await user.click(input);
    await user.keyboard("{Backspace}{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a Logger name.");

    act(() => store.set(selectedLoggerIdAtom, IDS.LOGGER2));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Logger/ })).toHaveValue(
      "Pressure east",
    );
    expect(renameLogger).not.toHaveBeenCalled();
  });

  it("blocks edits and connection actions when the model is read only", () => {
    vi.mocked(useIsEditionBlocked).mockReturnValue(true);
    const store = renderPanel();

    expect(
      screen.queryByRole("textbox", { name: "Value for: Logger" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Value for: Logger")).toHaveTextContent(
      "Pressure west",
    );
    expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Connect Logger to a Pipe or node",
      }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();

    act(() => {
      const settings = store.get(projectSettingsAtom);
      store.set(projectSettingsAtom, {
        ...settings,
        loggers: settings.loggers!.map((logger) =>
          logger.id === IDS.LOGGER1
            ? {
                ...logger,
                connection: {
                  assetId: IDS.J1,
                  snapPoint: [0, 0] as [number, number],
                },
              }
            : logger,
        ),
      });
    });
    expect(
      screen.getByRole("button", {
        name: "Disconnect Logger from network",
      }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", {
        name: "Connect Logger to a Pipe or node",
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps connection cancellation available when editing becomes blocked", () => {
    vi.mocked(useIsEditionBlocked).mockReturnValue(true);
    renderPanel(Mode.CONNECT_LOGGER);

    expect(
      screen.getByRole("button", { name: "Cancel Logger connection" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(
      screen.queryByRole("button", {
        name: "Connect Logger to a Pipe or node",
      }),
    ).not.toBeInTheDocument();
  });
});
