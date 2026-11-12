import {
  buildLoggerHistoryUpstreamUrl,
  DEFAULT_LOGGER_HISTORY_URL,
  requestLoggerHistory,
} from "./index";

const range = {
  from: "2026-03-10T00:00:00Z",
  to: "2026-03-11T23:59:59Z",
};

const createParameters = () =>
  new URLSearchParams({ ...range, deviceId: "L2" });

describe("logger history HTTP proxy", () => {
  afterEach(() => vi.useRealTimers());

  it("uses a configured HTTP endpoint and encodes only validated parameters", () => {
    const url = new URL(
      buildLoggerHistoryUpstreamUrl(
        "https://example.com/history?from=old&deviceId=old&unused=value",
        " L2&from=unexpected ",
        range,
      ),
    );
    expect(url.origin + url.pathname).toBe("https://example.com/history");
    expect([...url.searchParams.keys()]).toEqual(["from", "to", "deviceId"]);
    expect(url.searchParams.get("deviceId")).toBe("L2&from=unexpected");
    expect(url.searchParams.get("from")).toBe("2026-03-10T00:00:00.000Z");
    expect(url.searchParams.get("to")).toBe("2026-03-11T23:59:59.000Z");
    expect(
      buildLoggerHistoryUpstreamUrl(undefined, "L2", range).startsWith(
        DEFAULT_LOGGER_HISTORY_URL,
      ),
    ).toBe(true);
    expect(buildLoggerHistoryUpstreamUrl("", "L2", range)).toBe(
      buildLoggerHistoryUpstreamUrl(undefined, "L2", range),
    );
  });

  it("rejects unsafe upstream configuration and invalid query parameters", async () => {
    for (const configuredUrl of [
      "not a URL",
      "wss://example.com/history",
      "file:///history",
      "https://user:password@example.com/history",
      "https://example.com/history#fragment",
    ]) {
      expect(() =>
        buildLoggerHistoryUpstreamUrl(configuredUrl, "L2", range),
      ).toThrow("notConfigured");
    }
    const fetcher = vi.fn<typeof fetch>();
    const unknownParameter = createParameters();
    unknownParameter.set("url", "https://example.com");
    await expect(
      requestLoggerHistory(unknownParameter, { fetcher }),
    ).rejects.toMatchObject({ code: "invalidRange" });
    const duplicateParameter = createParameters();
    duplicateParameter.append("deviceId", "L1");
    await expect(
      requestLoggerHistory(duplicateParameter, { fetcher }),
    ).rejects.toMatchObject({ code: "invalidRange" });
    for (const deviceId of ["", " ", "x".repeat(101)]) {
      const parameters = createParameters();
      parameters.set("deviceId", deviceId);
      await expect(
        requestLoggerHistory(parameters, { fetcher }),
      ).rejects.toMatchObject({ code: "invalidDeviceId" });
    }
    const invalidRange = createParameters();
    invalidRange.set("from", "2026-03-12T00:00:00Z");
    await expect(
      requestLoggerHistory(invalidRange, { fetcher }),
    ).rejects.toMatchObject({ code: "invalidRange" });
    for (const limit of ["0", "-1", "1.5", "Infinity", "9007199254740992"]) {
      const invalidLimit = createParameters();
      invalidLimit.set("limit", limit);
      await expect(
        requestLoggerHistory(invalidLimit, { fetcher }),
      ).rejects.toMatchObject({ code: "invalidSampleLimit" });
    }
    const duplicateLimit = createParameters();
    duplicateLimit.append("limit", "10");
    duplicateLimit.append("limit", "24");
    await expect(
      requestLoggerHistory(duplicateLimit, { fetcher }),
    ).rejects.toMatchObject({ code: "invalidSampleLimit" });
    for (const interval of ["", "second", "Minute"]) {
      const invalidInterval = createParameters();
      invalidInterval.set("interval", interval);
      await expect(
        requestLoggerHistory(invalidInterval, { fetcher }),
      ).rejects.toMatchObject({ code: "invalidInterval" });
    }
    const duplicateInterval = createParameters();
    duplicateInterval.append("interval", "hourly");
    duplicateInterval.append("interval", "minute");
    await expect(
      requestLoggerHistory(duplicateInterval, { fetcher }),
    ).rejects.toMatchObject({ code: "invalidInterval" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fetches uncached history without forwarding credentials or following redirects", async () => {
    vi.useFakeTimers();
    const rows = [
      {
        id: 189,
        deviceId: "L2",
        type: "pressure",
        pressure: -0.03768,
        loggedAt: "2026-03-11T06:49:55.703Z",
      },
    ];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(rows)));
    await expect(
      requestLoggerHistory(createParameters(), { fetcher }),
    ).resolves.toEqual([
      {
        deviceId: "L2",
        type: "pressure",
        pressure: -0.03768,
        loggedAt: "2026-03-11T06:49:55.703Z",
      },
    ]);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(new URL(String(fetcher.mock.calls[0][0])).origin).toBe(
      "https://logger-api.gscwd.app",
    );
    expect(fetcher.mock.calls[0][1]).toEqual({
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      headers: { Accept: "application/json" },
      signal: expect.any(AbortSignal),
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reduces dense records to minimal hourly pressure samples before returning them", async () => {
    const rows = Array.from({ length: 65 }, (_, index) => ({
      id: 189 + index,
      deviceId: "L2",
      type: "pressure",
      pressure: index === 0 ? -0.03768 : -0.276288,
      tempOrStatus: 29,
      batteryV: 7.36,
      externalV: 4.57,
      gsmPct: 0,
      raw: "raw telemetry",
      loggedAt: "2026-03-11T06:49:55.703Z",
    })).reverse();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(rows)));

    await expect(
      requestLoggerHistory(createParameters(), { fetcher }),
    ).resolves.toEqual([
      {
        deviceId: "L2",
        type: "pressure",
        pressure: -0.03768,
        loggedAt: "2026-03-11T06:49:55.703Z",
      },
    ]);
  });

  it("applies requested limits after hourly sampling and supports all available beyond 150 hours", async () => {
    const start = Date.UTC(2026, 2, 1);
    const rows = Array.from({ length: 240 }, (_, index) => ({
      deviceId: "L2",
      type: "pressure",
      pressure: index,
      loggedAt: new Date(start + index * 3600000 + 3000).toISOString(),
    })).reverse();
    const parameters = new URLSearchParams({
      deviceId: "L2",
      from: new Date(start).toISOString(),
      to: new Date(start + 240 * 3600000).toISOString(),
      limit: "10",
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(rows))),
      );

    const limited = await requestLoggerHistory(parameters, { fetcher });
    expect(limited.map((sample) => sample.pressure)).toEqual(
      Array.from({ length: 10 }, (_, index) => 230 + index),
    );
    expect(
      new URL(String(fetcher.mock.calls[0][0])).searchParams.has("limit"),
    ).toBe(false);

    parameters.set("limit", "all");
    expect(await requestLoggerHistory(parameters, { fetcher })).toHaveLength(
      240,
    );
    parameters.delete("limit");
    expect(await requestLoggerHistory(parameters, { fetcher })).toHaveLength(
      240,
    );
  });

  it("distinguishes upstream failures from malformed responses", async () => {
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    await expect(
      requestLoggerHistory(createParameters(), { fetcher }),
    ).rejects.toMatchObject({ code: "requestFailed" });
    for (const response of [new Response("invalid-json"), new Response("{}")]) {
      fetcher.mockResolvedValueOnce(response);
      await expect(
        requestLoggerHistory(createParameters(), { fetcher }),
      ).rejects.toMatchObject({ code: "invalidResponse" });
    }
    fetcher.mockRejectedValueOnce(new Error("connection failed"));
    await expect(
      requestLoggerHistory(createParameters(), { fetcher }),
    ).rejects.toMatchObject({ code: "requestFailed" });
  });

  it("samples minute data before applying its point limit without forwarding interval upstream", async () => {
    const rows = [
      {
        deviceId: "L2",
        type: "pressure",
        loggedAt: "2026-03-11T08:00:20Z",
        pressure: 20,
      },
      {
        deviceId: "L2",
        type: "pressure",
        loggedAt: "2026-03-11T08:00:10Z",
        pressure: -0.250298,
      },
      {
        deviceId: "L2",
        type: "pressure",
        loggedAt: "2026-03-11T08:01:10Z",
        pressure: 0,
      },
    ];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(rows))),
      );
    const parameters = createParameters();
    parameters.set("interval", "minute");
    const minutes = await requestLoggerHistory(parameters, { fetcher });
    expect(minutes.map((sample) => sample.pressure)).toEqual([-0.250298, 0]);
    expect(
      new URL(String(fetcher.mock.calls[0][0])).searchParams.has("interval"),
    ).toBe(false);
    parameters.set("limit", "1");
    expect(
      (await requestLoggerHistory(parameters, { fetcher })).map(
        (sample) => sample.pressure,
      ),
    ).toEqual([0]);
    parameters.set("interval", "hourly");
    parameters.delete("limit");
    expect(
      (await requestLoggerHistory(parameters, { fetcher })).map(
        (sample) => sample.pressure,
      ),
    ).toEqual([-0.250298]);
  });

  it("aborts a pending upstream request when its caller cancels", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const fetcher = createAbortingFetcher();
    const pending = requestLoggerHistory(createParameters(), {
      signal: controller.signal,
      fetcher,
    });
    const rejected = expect(pending).rejects.toMatchObject({
      code: "requestFailed",
    });
    controller.abort();
    await rejected;
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);

    fetcher.mockClear();
    await expect(
      requestLoggerHistory(createParameters(), {
        signal: controller.signal,
        fetcher,
      }),
    ).rejects.toMatchObject({ code: "requestFailed" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("times out pending requests and releases its timer", async () => {
    vi.useFakeTimers();
    const fetcher = createAbortingFetcher();
    const pending = requestLoggerHistory(createParameters(), { fetcher });
    const rejected = expect(pending).rejects.toMatchObject({
      code: "requestFailed",
    });
    await vi.advanceTimersByTimeAsync(20000);
    await rejected;
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

const createAbortingFetcher = () =>
  vi.fn<typeof fetch>(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      }),
  );
