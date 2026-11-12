import { mergeLoggerReading, parseLoggerPacket } from "./parse-reading";
import { mergeLoggerPressureHistory } from "./history";
import { buildLoggerStreamUrl, LoggerStreamConfigurationError } from "./url";
import {
  createInitialLoggerStreamState,
  type LoggerStreamError,
  type LoggerStreamState,
} from "./types";

export type LoggerSocket = {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  close: () => void;
};

type StreamConnection = {
  id: string;
  state: LoggerStreamState;
  version: number;
  attempts: number;
  socket?: LoggerSocket;
  request?: AbortController;
  retryTimer?: ReturnType<typeof setTimeout>;
  connectionTimer?: ReturnType<typeof setTimeout>;
};

type LoggerStreamManagerOptions = {
  loadUrl: (signal: AbortSignal) => Promise<string>;
  onStateChange: (loggerId: string, state: LoggerStreamState | null) => void;
  createSocket?: (url: string) => LoggerSocket;
  connectionTimeoutMs?: number;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
};

export class LoggerStreamManager {
  private readonly connections = new Map<string, StreamConnection>();
  private readonly createSocket: (url: string) => LoggerSocket;
  private readonly connectionTimeoutMs: number;
  private readonly reconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;

  constructor(private readonly options: LoggerStreamManagerOptions) {
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url));
    this.connectionTimeoutMs = options.connectionTimeoutMs ?? 15000;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1000;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 30000;
  }

  getState(loggerId: string): LoggerStreamState | undefined {
    return this.connections.get(loggerId)?.state;
  }

  setDeviceId(loggerId: string, deviceId: string): boolean {
    const exists = this.connections.has(loggerId);
    const connection = this.getOrCreateConnection(loggerId, deviceId.trim());
    if (connection.state.isRunning) return false;
    const nextDeviceId = deviceId.trim();
    if (
      connection.state.deviceId === nextDeviceId &&
      connection.state.error === null
    ) {
      if (!exists) this.publish(connection, connection.state);
      return true;
    }
    this.publish(connection, {
      ...connection.state,
      deviceId: nextDeviceId,
      error: null,
      status:
        connection.state.status === "error" ? "idle" : connection.state.status,
    });
    return true;
  }

  start(loggerId: string, deviceId: string): void {
    const connection = this.getOrCreateConnection(loggerId, deviceId.trim());
    if (connection.state.isRunning) return;
    connection.state = {
      ...connection.state,
      deviceId: deviceId.trim(),
      isRunning: true,
      status: "connecting",
      error: null,
    };
    connection.attempts = 0;
    if (!connection.state.deviceId || connection.state.deviceId.length > 100) {
      this.failConfiguration(connection, "invalidDeviceId");
      return;
    }
    void this.connect(connection, false);
  }

  stop(loggerId: string): void {
    const connection = this.connections.get(loggerId);
    if (!connection) return;
    connection.version += 1;
    this.release(connection);
    this.publish(connection, {
      ...connection.state,
      isRunning: false,
      status: "disconnected",
      error: null,
    });
  }

  remove(loggerId: string): void {
    const connection = this.connections.get(loggerId);
    if (!connection) return;
    connection.version += 1;
    this.release(connection);
    this.connections.delete(loggerId);
    this.options.onStateChange(loggerId, null);
  }

  retainLoggerIds(loggerIds: ReadonlySet<string>): void {
    for (const loggerId of this.connections.keys()) {
      if (!loggerIds.has(loggerId)) this.remove(loggerId);
    }
  }

  clear(): void {
    for (const loggerId of this.connections.keys()) this.remove(loggerId);
  }

  private getOrCreateConnection(
    loggerId: string,
    deviceId: string,
  ): StreamConnection {
    const existing = this.connections.get(loggerId);
    if (existing) return existing;
    const connection: StreamConnection = {
      id: loggerId,
      state: createInitialLoggerStreamState(deviceId),
      version: 0,
      attempts: 0,
    };
    this.connections.set(loggerId, connection);
    this.options.onStateChange(loggerId, connection.state);
    return connection;
  }

  private async connect(
    connection: StreamConnection,
    reconnecting: boolean,
  ): Promise<void> {
    const version = ++connection.version;
    this.publish(connection, {
      ...connection.state,
      status: reconnecting ? "reconnecting" : "connecting",
      error: null,
    });
    const request = new AbortController();
    connection.request = request;
    connection.connectionTimer = setTimeout(() => {
      if (this.isCurrent(connection, version))
        this.scheduleReconnect(connection, "connectionFailed");
    }, this.connectionTimeoutMs);

    try {
      const configuredUrl = await this.options.loadUrl(request.signal);
      if (!this.isCurrent(connection, version)) return;
      const url = buildLoggerStreamUrl(
        configuredUrl,
        connection.state.deviceId,
      );
      const socket = this.createSocket(url);
      connection.socket = socket;
      socket.onopen = () => {
        if (!this.isCurrent(connection, version)) return;
        clearTimeout(connection.connectionTimer);
        connection.connectionTimer = undefined;
        connection.attempts = 0;
        this.publish(connection, {
          ...connection.state,
          status: "connected",
          error: null,
        });
      };
      socket.onmessage = (event) => {
        if (!this.isCurrent(connection, version)) return;
        const packet = parseLoggerPacket(event.data, connection.state.deviceId);
        if (!packet) return;
        const reading = mergeLoggerReading(connection.state.reading, packet);
        const history = mergeLoggerPressureHistory(
          connection.state.history,
          packet,
        );
        if (
          reading === connection.state.reading &&
          history === connection.state.history
        )
          return;
        this.publish(connection, { ...connection.state, reading, history });
      };
      socket.onerror = () => {
        if (this.isCurrent(connection, version))
          this.scheduleReconnect(connection, "connectionFailed");
      };
      socket.onclose = () => {
        if (this.isCurrent(connection, version))
          this.scheduleReconnect(connection, "connectionClosed");
      };
    } catch (error) {
      if (!this.isCurrent(connection, version)) return;
      if (
        error instanceof LoggerStreamConfigurationError &&
        error.code !== "connectionFailed" &&
        error.code !== "connectionClosed"
      ) {
        this.failConfiguration(connection, error.code);
      } else {
        this.scheduleReconnect(connection, "connectionFailed");
      }
    }
  }

  private isCurrent(connection: StreamConnection, version: number): boolean {
    return (
      this.connections.get(connection.id) === connection &&
      connection.version === version &&
      connection.state.isRunning
    );
  }

  private publish(
    connection: StreamConnection,
    state: LoggerStreamState,
  ): void {
    connection.state = state;
    this.options.onStateChange(connection.id, state);
  }

  private failConfiguration(
    connection: StreamConnection,
    error: LoggerStreamError,
  ): void {
    connection.version += 1;
    this.release(connection);
    this.publish(connection, {
      ...connection.state,
      status: "error",
      isRunning: false,
      error,
    });
  }

  private scheduleReconnect(
    connection: StreamConnection,
    error: LoggerStreamError,
  ): void {
    connection.version += 1;
    this.release(connection);
    const delay = Math.min(
      this.reconnectDelayMs * 2 ** Math.min(connection.attempts, 20),
      this.maxReconnectDelayMs,
    );
    connection.attempts += 1;
    this.publish(connection, {
      ...connection.state,
      status: "reconnecting",
      error,
    });
    connection.retryTimer = setTimeout(() => {
      connection.retryTimer = undefined;
      if (connection.state.isRunning) void this.connect(connection, true);
    }, delay);
  }

  private release(connection: StreamConnection): void {
    connection.request?.abort();
    connection.request = undefined;
    clearTimeout(connection.retryTimer);
    clearTimeout(connection.connectionTimer);
    connection.retryTimer = undefined;
    connection.connectionTimer = undefined;
    const socket = connection.socket;
    connection.socket = undefined;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close();
      } catch {
        return;
      }
    }
  }
}
