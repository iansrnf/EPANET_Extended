import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let client: typeof import("./google-map-tiles");

const options = {
  apiKey: "test-key",
  mapType: "satellite" as const,
  language: "en",
  region: "PH",
  labelVisibility: true,
};
const sessionResponse = {
  session: "test-session",
  expiry: "2000003600",
  tileWidth: 256,
  tileHeight: 256,
  imageFormat: "jpeg",
};

describe("Google Maps tiles", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(2000000000000);
    client = await import("./google-map-tiles");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shares session creation and reuses sessions until renewal is due", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(sessionResponse));
    vi.stubGlobal("fetch", fetch);

    const [first, concurrent] = await Promise.all([
      client.getGoogleMapsSession(options),
      client.getGoogleMapsSession(options),
    ]);
    const reused = await client.getGoogleMapsSession(options);

    expect(first).toBe(concurrent);
    expect(first).toBe(reused);
    expect(first.expiry).toBe(2000003600);
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.setSystemTime(2000003540000);
    fetch.mockResolvedValue(
      jsonResponse({
        ...sessionResponse,
        session: "renewed",
        expiry: "2000007200",
      }),
    );

    expect((await client.getGoogleMapsSession(options)).session).toBe(
      "renewed",
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("creates distinct sessions for label and map type changes", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(jsonResponse(sessionResponse)));
    vi.stubGlobal("fetch", fetch);

    await client.getGoogleMapsSession(options);
    await client.getGoogleMapsSession({ ...options, labelVisibility: false });
    await client.getGoogleMapsSession({
      ...options,
      mapType: "roadmap",
      labelVisibility: false,
    });

    const bodies = fetch.mock.calls.map(
      (call) => JSON.parse((call[1] as RequestInit).body as string) as unknown,
    );
    expect(bodies).toEqual([
      {
        mapType: "satellite",
        language: "en",
        region: "PH",
        layerTypes: ["layerRoadmap"],
      },
      { mapType: "satellite", language: "en", region: "PH" },
      {
        mapType: "roadmap",
        language: "en",
        region: "PH",
        styles: [{ elementType: "labels", stylers: [{ visibility: "off" }] }],
      },
    ]);
  });

  it("rejects missing keys without making a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(
      client.getGoogleMapsSession({ ...options, apiKey: " " }),
    ).rejects.toThrow("API key is not configured");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows retry after failed session creation and conceals provider errors", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("Invalid test-key", { status: 403 }))
      .mockResolvedValueOnce(jsonResponse(sessionResponse));
    vi.stubGlobal("fetch", fetch);

    await expect(client.getGoogleMapsSession(options)).rejects.toThrow(
      "Google Maps request failed (403).",
    );
    expect((await client.getGoogleMapsSession(options)).session).toBe(
      "test-session",
    );
  });

  it.each([
    { ...sessionResponse, expiry: "invalid" },
    { ...sessionResponse, expiry: "1999999999" },
    { ...sessionResponse, tileWidth: 0 },
    { ...sessionResponse, session: "" },
  ])("rejects malformed or expired sessions", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(body)));

    await expect(client.getGoogleMapsSession(options)).rejects.toThrow(
      "invalid session response",
    );
  });

  it("encodes credentials while preserving tile placeholders", () => {
    const url = client.getGoogleMapsTileUrl(
      { ...sessionResponse, session: "token&value", expiry: 2000003600 },
      "key&value",
    );
    expect(url).toContain("/v1/2dtiles/{z}/{x}/{y}?");
    expect(new URL(url).searchParams.get("session")).toBe("token&value");
    expect(new URL(url).searchParams.get("key")).toBe("key&value");
  });

  it("uses viewport attribution with normalized dateline bounds", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ copyright: "Map data © Google, Maxar" }),
      );
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();

    const copyright = await client.getGoogleMapsAttribution({
      apiKey: options.apiKey,
      session: sessionResponse.session,
      zoom: 14.8,
      bounds: { north: 12, south: -12, west: 170, east: 190 },
      signal: controller.signal,
    });

    expect(copyright).toBe("Map data © Google, Maxar");
    const query = new URL(fetch.mock.calls[0][0] as string).searchParams;
    expect(query.get("zoom")).toBe("14");
    expect(query.get("west")).toBe("170");
    expect(query.get("east")).toBe("-170");
    expect(fetch.mock.calls[0][1]).toEqual({ signal: controller.signal });
  });

  it("rejects missing attribution instead of concealing its absence", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));

    await expect(
      client.getGoogleMapsAttribution({
        apiKey: options.apiKey,
        session: sessionResponse.session,
        zoom: 10,
        bounds: { north: 12, south: -12, west: 120, east: 130 },
      }),
    ).rejects.toThrow("invalid attribution data");
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}
