import { LoggerStreamManager, type LoggerSocket } from "./stream-manager";
import type { LoggerStreamState } from "./types";

const IDS = { LOGGER1: "logger-1", LOGGER2: "logger-2" } as const;
const packet = {
  deviceId: "L1",
  type: "pressure",
  timestamp: "2026-11-10T10:28:22",
  pressure: -0.250298,
  status: "online",
};

class FakeSocket implements LoggerSocket {
  onopen: LoggerSocket["onopen"] = null;
  onmessage: LoggerSocket["onmessage"] = null;
  onerror: LoggerSocket["onerror"] = null;
  onclose: LoggerSocket["onclose"] = null;
  close = vi.fn();

  open() {
    this.onopen?.(new Event("open"));
  }

  receive(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }

  disconnect() {
    this.onclose?.(new Event("close") as CloseEvent);
  }
}

const createManager = (
  loadUrl = vi.fn((_signal: AbortSignal) =>
    Promise.resolve("wss://example.com/stream"),
  ),
) => {
  const states = new Map<string, LoggerStreamState>();
  const sockets: FakeSocket[] = [];
  const urls: string[] = [];
  const manager = new LoggerStreamManager({
    loadUrl,
    createSocket: (url) => {
      urls.push(url);
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    onStateChange: (id, state) => {
      if (state) states.set(id, state);
      else states.delete(id);
    },
  });
  return { manager, states, sockets, urls, loadUrl };
};

describe("logger stream manager", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps the last accepted reading through stop, restart and connection errors", async () => {
    const { manager, states, sockets, urls } = createManager();
    manager.start(IDS.LOGGER1, "L1");
    await vi.advanceTimersByTimeAsync(0);
    sockets[0].open();
    sockets[0].receive(JSON.stringify(packet));
    const reading = states.get(IDS.LOGGER1)!.reading;
    const history = states.get(IDS.LOGGER1)!.history;

    sockets[0].receive("not-json");
    sockets[0].receive(
      JSON.stringify({ ...packet, deviceId: "L2", pressure: 88 }),
    );
    expect(states.get(IDS.LOGGER1)!.reading).toBe(reading);
    expect(states.get(IDS.LOGGER1)!.history).toBe(history);
    manager.stop(IDS.LOGGER1);
    expect(states.get(IDS.LOGGER1)).toMatchObject({
      status: "disconnected",
      isRunning: false,
      reading,
      history,
    });
    expect(sockets[0].close).toHaveBeenCalledOnce();

    manager.start(IDS.LOGGER1, "L1");
    await vi.advanceTimersByTimeAsync(0);
    sockets[1].open();
    sockets[1].disconnect();
    expect(states.get(IDS.LOGGER1)!.reading).toBe(reading);
    expect(states.get(IDS.LOGGER1)!.history).toBe(history);
    expect(states.get(IDS.LOGGER1)!.status).toBe("reconnecting");
    expect(urls).toEqual([
      "wss://example.com/stream?deviceId=L1",
      "wss://example.com/stream?deviceId=L1",
    ]);
    manager.clear();
  });

  it("collects only pressure packets and resets history when a new device reports", async () => {
    const { manager, states, sockets } = createManager();
    manager.start(IDS.LOGGER1, "L1");
    await vi.advanceTimersByTimeAsync(0);
    sockets[0].receive(JSON.stringify(packet));
    const history = states.get(IDS.LOGGER1)!.history;
    expect(history).toEqual([
      {
        deviceId: packet.deviceId,
        timestamp: packet.timestamp,
        pressure: packet.pressure,
      },
    ]);

    sockets[0].receive(
      JSON.stringify({
        type: "snapshot",
        data: { ...packet, pressure: null, timestamp: "2026-11-10T10:28:23" },
      }),
    );
    expect(states.get(IDS.LOGGER1)!.history).toBe(history);
    expect(states.get(IDS.LOGGER1)!.reading!.pressure).toBe(packet.pressure);
    sockets[0].receive(
      JSON.stringify({ ...packet, timestamp: "invalid-time" }),
    );
    expect(states.get(IDS.LOGGER1)!.history).toBe(history);

    manager.stop(IDS.LOGGER1);
    manager.setDeviceId(IDS.LOGGER1, "L2");
    expect(states.get(IDS.LOGGER1)!.history).toBe(history);
    manager.start(IDS.LOGGER1, "L2");
    await vi.advanceTimersByTimeAsync(0);
    expect(states.get(IDS.LOGGER1)!.history).toBe(history);
    sockets[1].receive(
      JSON.stringify({ ...packet, deviceId: "L2", pressure: null }),
    );
    expect(states.get(IDS.LOGGER1)!.history).toEqual([]);
    sockets[1].receive(
      JSON.stringify({ ...packet, deviceId: "L2", pressure: 0 }),
    );
    expect(states.get(IDS.LOGGER1)!.history).toEqual([
      { deviceId: "L2", timestamp: packet.timestamp, pressure: 0 },
    ]);
    manager.clear();
  });

  it("reconnects with capped backoff and ignores late callbacks after Stop", async () => {
    const { manager, sockets, states } = createManager();
    manager.start(IDS.LOGGER1, "L1");
    await vi.advanceTimersByTimeAsync(0);
    const lateMessage = sockets[0].onmessage;
    sockets[0].disconnect();
    await vi.advanceTimersByTimeAsync(999);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);
    sockets[1].disconnect();
    await vi.advanceTimersByTimeAsync(1999);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(3);

    manager.stop(IDS.LOGGER1);
    lateMessage?.(
      new MessageEvent("message", { data: JSON.stringify(packet) }),
    );
    await vi.advanceTimersByTimeAsync(120000);
    expect(sockets).toHaveLength(3);
    expect(states.get(IDS.LOGGER1)!.reading).toBeNull();
    expect(states.get(IDS.LOGGER1)!.isRunning).toBe(false);
  });

  it("does not open a socket after Stop while configuration is loading", async () => {
    let resolveUrl: ((url: string) => void) | undefined;
    const loadUrl = vi.fn(
      (_signal: AbortSignal) =>
        new Promise<string>((resolve) => {
          resolveUrl = resolve;
        }),
    );
    const { manager, sockets, states } = createManager(loadUrl);
    manager.start(IDS.LOGGER1, "L1");
    manager.stop(IDS.LOGGER1);
    resolveUrl?.("wss://example.com/stream");
    await vi.advanceTimersByTimeAsync(0);

    expect(sockets).toHaveLength(0);
    expect(loadUrl.mock.calls[0][0].aborted).toBe(true);
    expect(states.get(IDS.LOGGER1)!.status).toBe("disconnected");
  });

  it("isolates device subscriptions and removes only deleted loggers", async () => {
    const { manager, sockets, states, urls } = createManager();
    manager.start(IDS.LOGGER1, "L1");
    manager.start(IDS.LOGGER2, "L2");
    await vi.advanceTimersByTimeAsync(0);
    sockets[0].open();
    sockets[1].open();
    sockets[0].receive(JSON.stringify(packet));
    sockets[1].receive(
      JSON.stringify({ ...packet, deviceId: "L2", pressure: 0 }),
    );

    expect(urls[1]).toBe("wss://example.com/stream?deviceId=L2");
    expect(states.get(IDS.LOGGER2)!.reading!.pressure).toBe(0);
    expect(states.get(IDS.LOGGER1)!.history[0].pressure).toBe(packet.pressure);
    expect(states.get(IDS.LOGGER2)!.history[0].pressure).toBe(0);
    manager.retainLoggerIds(new Set([IDS.LOGGER2]));
    expect(states.has(IDS.LOGGER1)).toBe(false);
    expect(sockets[0].close).toHaveBeenCalledOnce();
    expect(sockets[1].close).not.toHaveBeenCalled();
    expect(manager.setDeviceId(IDS.LOGGER2, "L3")).toBe(false);
    manager.clear();
    expect(sockets[1].close).toHaveBeenCalledOnce();
    expect(states.size).toBe(0);
  });
});
