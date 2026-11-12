import { act, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { ReactNode } from "react";
import type { LoggerSocket } from "src/lib/logger-stream";
import {
  getLoggerStreamManager,
  useLoggerStreamActions,
} from "src/commands/logger-stream";
import {
  loggerReadingsAtom,
  loggerStreamsAtom,
  resetLoggerStreamsAtom,
} from "src/state/logger-stream";
import { projectSettingsAtom } from "src/state/project-settings";
import { selectedLoggerIdAtom } from "src/state/loggers";
import { useLoggerStreamLifecycle } from "./use-logger-stream-lifecycle";

const IDS = { LOGGER1: "logger-1", LOGGER2: "logger-2" } as const;

class FakeSocket implements LoggerSocket {
  static sockets: FakeSocket[] = [];
  onopen: LoggerSocket["onopen"] = null;
  onmessage: LoggerSocket["onmessage"] = null;
  onerror: LoggerSocket["onerror"] = null;
  onclose: LoggerSocket["onclose"] = null;
  close = vi.fn();

  constructor(public readonly url: string) {
    FakeSocket.sockets.push(this);
  }

  receive(
    deviceId: string,
    pressure: number,
    timestamp = "2026-11-10T10:28:22",
  ) {
    this.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({
          deviceId,
          type: "pressure",
          timestamp,
          pressure,
        }),
      }),
    );
  }
}

const createProjectStore = () => {
  const store = createStore();
  store.set(projectSettingsAtom, {
    ...store.get(projectSettingsAtom),
    loggers: [IDS.LOGGER1, IDS.LOGGER2].map((id, index) => ({
      id,
      label: `Logger ${index + 1}`,
      coordinates: [index, index] as [number, number],
      connection: null,
    })),
  });
  return store;
};

describe("logger stream lifecycle", () => {
  beforeEach(() => {
    FakeSocket.sockets = [];
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ url: "wss://example.com/stream" }),
        }),
      ),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("keeps receiving when the sidebar command consumer unmounts or selection changes", async () => {
    const store = createProjectStore();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    const lifecycle = renderHook(() => useLoggerStreamLifecycle(), { wrapper });
    const consumer = renderHook(() => useLoggerStreamActions(), { wrapper });

    await act(async () => {
      consumer.result.current.startLoggerStream(IDS.LOGGER1);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const socket = FakeSocket.sockets[0];
    act(() => {
      socket.onopen?.(new Event("open"));
      socket.receive("L1", -0.250298);
    });
    const first = store.get(loggerReadingsAtom).get(IDS.LOGGER1);
    const firstHistory = store.get(loggerStreamsAtom).get(IDS.LOGGER1)!.history;

    consumer.unmount();
    act(() => store.set(selectedLoggerIdAtom, IDS.LOGGER2));
    expect(socket.close).not.toHaveBeenCalled();
    expect(store.get(loggerReadingsAtom).get(IDS.LOGGER1)).toBe(first);
    expect(store.get(loggerStreamsAtom).get(IDS.LOGGER1)!.history).toBe(
      firstHistory,
    );
    act(() => socket.receive("L1", 0, "2026-11-10T10:28:23"));
    const latest = store.get(loggerReadingsAtom).get(IDS.LOGGER1);
    expect(latest?.pressure).toBe(0);
    const history = store.get(loggerStreamsAtom).get(IDS.LOGGER1)!.history;
    expect(history.map((sample) => sample.pressure)).toEqual([-0.250298, 0]);

    const readingsBeforeStop = store.get(loggerReadingsAtom);
    act(() => getLoggerStreamManager(store).stop(IDS.LOGGER1));
    expect(store.get(loggerReadingsAtom)).toBe(readingsBeforeStop);
    expect(store.get(loggerStreamsAtom).get(IDS.LOGGER1)?.reading).toBe(latest);
    expect(store.get(loggerStreamsAtom).get(IDS.LOGGER1)?.history).toBe(
      history,
    );
    lifecycle.unmount();
  });

  it("closes only deleted logger sockets and clears every socket on a project reset", async () => {
    const store = createProjectStore();
    const lifecycle = renderHook(() => useLoggerStreamLifecycle(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    });
    const manager = getLoggerStreamManager(store);
    await act(async () => {
      manager.start(IDS.LOGGER1, "L1");
      manager.start(IDS.LOGGER2, "L2");
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const [firstSocket, secondSocket] = FakeSocket.sockets;
    act(() => {
      firstSocket.receive("L1", 1);
      secondSocket.receive("L2", 2);
      const settings = store.get(projectSettingsAtom);
      store.set(projectSettingsAtom, {
        ...settings,
        loggers: settings.loggers!.filter(
          (logger) => logger.id !== IDS.LOGGER1,
        ),
      });
    });

    expect(firstSocket.close).toHaveBeenCalledOnce();
    expect(secondSocket.close).not.toHaveBeenCalled();
    expect(store.get(loggerReadingsAtom).has(IDS.LOGGER1)).toBe(false);
    expect(store.get(loggerReadingsAtom).get(IDS.LOGGER2)?.pressure).toBe(2);

    act(() => store.set(resetLoggerStreamsAtom));
    expect(secondSocket.close).toHaveBeenCalledOnce();
    expect(store.get(loggerReadingsAtom).size).toBe(0);
    expect(store.get(loggerStreamsAtom).size).toBe(0);
    lifecycle.unmount();
  });
});
