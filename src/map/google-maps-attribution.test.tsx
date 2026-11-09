import { act, cleanup, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { MapEngine } from "@epanet-js/map";
import { vi } from "vitest";
import {
  getGoogleMapsAttribution,
  getGoogleMapsSession,
} from "src/lib/google-map-tiles";
import { googleMapsSessionVersionAtom, layerConfigAtom } from "src/state/map";
import { offlineAtom } from "src/state/offline";
import { GoogleMapsAttribution } from "./google-maps-attribution";

vi.mock("@epanet-js/map", () => ({
  DEFAULT_CENTER: [-4.3800042, 55.914314],
  DEFAULT_ZOOM: 15.5,
  colorFor: vi.fn(),
}));

vi.mock("src/lib/env-client", () => ({
  env: { NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "test-key" },
}));

vi.mock("src/lib/google-map-tiles", () => ({
  getGoogleMapsAttribution: vi.fn(),
  getGoogleMapsSession: vi.fn(),
  GOOGLE_MAPS_DISPLAY_OPTIONS: { language: "en-US", region: "US" },
  GOOGLE_MAPS_SESSION_RENEWAL_MARGIN_SECONDS: 60,
}));

vi.mock("src/hooks/use-translate", () => {
  const translate = (key: string) => key;
  return { useTranslate: () => translate };
});

vi.mock("src/components/notifications", () => ({ notify: vi.fn() }));

describe("Google Maps session lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    vi.mocked(getGoogleMapsAttribution).mockResolvedValue(
      "Map data Google, Maxar",
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("rebuilds the style once when the session renews", async () => {
    const initialExpiry = Date.now() / 1000 + 120;
    vi.mocked(getGoogleMapsSession)
      .mockResolvedValueOnce(session("initial", initialExpiry))
      .mockResolvedValue(session("renewed", initialExpiry + 120));
    const { store } = mountAttribution();

    await act(() => Promise.resolve());
    expect(store.get(googleMapsSessionVersionAtom)).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60100);
    });

    expect(store.get(googleMapsSessionVersionAtom)).toBe(1);
    expect(getGoogleMapsSession).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Map data Google, Maxar")).toBeInTheDocument();
  });

  it("does not rebuild the style when focus reuses a session", async () => {
    vi.mocked(getGoogleMapsSession).mockResolvedValue(
      session("initial", Date.now() / 1000 + 3600),
    );
    const { store } = mountAttribution();
    await act(() => Promise.resolve());

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    expect(store.get(googleMapsSessionVersionAtom)).toBe(0);
    expect(getGoogleMapsSession).toHaveBeenCalledTimes(2);
  });

  it("rebuilds after recovering from an initial session failure", async () => {
    vi.mocked(getGoogleMapsSession)
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValue(session("recovered", Date.now() / 1000 + 3600));
    const { store } = mountAttribution();
    await act(() => Promise.resolve());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(store.get(googleMapsSessionVersionAtom)).toBe(1);
    expect(getGoogleMapsSession).toHaveBeenCalledTimes(2);
  });

  it("aborts stale attribution when the displayed source is removed", async () => {
    vi.mocked(getGoogleMapsSession).mockResolvedValue(
      session("initial", Date.now() / 1000 + 3600),
    );
    let finishAttribution: (value: string) => void = () => {};
    vi.mocked(getGoogleMapsAttribution).mockReturnValue(
      new Promise((resolve) => {
        finishAttribution = resolve;
      }),
    );
    const { store, map, applySession } = mountAttribution();
    await act(() => Promise.resolve());
    const signal = vi.mocked(getGoogleMapsAttribution).mock.calls[0][0].signal;

    await act(async () => {
      store.set(layerConfigAtom, new Map());
      await Promise.resolve();
      applySession(null);
      finishAttribution("Stale attribution");
      await Promise.resolve();
    });

    expect(signal?.aborted).toBe(true);
    expect(screen.queryByText("Stale attribution")).not.toBeInTheDocument();
    expect(map.map.off).toHaveBeenCalledWith("moveend", expect.any(Function));
  });

  it("keeps Google credits until the replacement style is installed", async () => {
    vi.mocked(getGoogleMapsSession).mockResolvedValue(
      session("initial", Date.now() / 1000 + 3600),
    );
    const { store, applySession } = mountAttribution();
    await act(() => Promise.resolve());

    await act(async () => {
      store.set(layerConfigAtom, new Map());
      await Promise.resolve();
    });

    expect(screen.getByText("Map data Google, Maxar")).toBeInTheDocument();
    await act(async () => {
      applySession(null);
      await Promise.resolve();
    });
    expect(screen.queryByText("Google Maps")).not.toBeInTheDocument();
  });

  it("uses the displayed session while a new Google basemap is pending", async () => {
    vi.mocked(getGoogleMapsSession)
      .mockResolvedValueOnce(session("initial", Date.now() / 1000 + 3600))
      .mockResolvedValue(session("roadmap", Date.now() / 1000 + 3600));
    vi.mocked(getGoogleMapsAttribution).mockImplementation(({ session }) =>
      Promise.resolve(`Credits for ${session}`),
    );
    const { store, applySession } = mountAttribution();
    await act(() => Promise.resolve());

    await act(async () => {
      const layer = store.get(layerConfigAtom).get("google");
      if (!layer || layer.type !== "GOOGLE") throw new Error("Missing layer");
      store.set(
        layerConfigAtom,
        new Map([[layer.id, { ...layer, mapType: "roadmap" }]]),
      );
      await Promise.resolve();
    });

    expect(screen.getByText("Credits for initial")).toBeInTheDocument();
    expect(getGoogleMapsAttribution).toHaveBeenCalledTimes(1);

    await act(async () => {
      applySession("roadmap");
      await Promise.resolve();
    });

    expect(screen.getByText("Credits for roadmap")).toBeInTheDocument();
    expect(getGoogleMapsAttribution).toHaveBeenLastCalledWith(
      expect.objectContaining({ session: "roadmap" }),
    );
  });

  it("retains displayed credits offline without requesting Google", async () => {
    vi.mocked(getGoogleMapsSession).mockResolvedValue(
      session("initial", Date.now() / 1000 + 3600),
    );
    const { store } = mountAttribution();
    await act(() => Promise.resolve());

    await act(async () => {
      store.set(offlineAtom, true);
      await Promise.resolve();
    });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    expect(screen.getByText("Map data Google, Maxar")).toBeInTheDocument();
    expect(getGoogleMapsSession).toHaveBeenCalledTimes(1);
    expect(getGoogleMapsAttribution).toHaveBeenCalledTimes(1);
  });

  it("waits for style metadata before reading the initial Google session", async () => {
    vi.mocked(getGoogleMapsSession).mockResolvedValue(
      session("initial", Date.now() / 1000 + 3600),
    );
    const { setStyleReadable } = mountAttribution({ styleReadable: false });
    await act(() => Promise.resolve());

    expect(getGoogleMapsAttribution).not.toHaveBeenCalled();
    expect(screen.queryByText("Google Maps")).not.toBeInTheDocument();

    await act(async () => {
      setStyleReadable(true, "style.load");
      await Promise.resolve();
    });

    expect(screen.getByText("Map data Google, Maxar")).toBeInTheDocument();
  });

  it("retains credits while a replacement style is not serializable", async () => {
    vi.mocked(getGoogleMapsSession).mockResolvedValue(
      session("initial", Date.now() / 1000 + 3600),
    );
    vi.mocked(getGoogleMapsAttribution).mockImplementation(({ session }) =>
      Promise.resolve(`Credits for ${session}`),
    );
    const { applySession, setStyleReadable } = mountAttribution();
    await act(() => Promise.resolve());

    await act(async () => {
      setStyleReadable(false);
      applySession("replacement");
      await Promise.resolve();
    });

    expect(screen.getByText("Credits for initial")).toBeInTheDocument();
    expect(getGoogleMapsAttribution).toHaveBeenCalledTimes(1);

    await act(async () => {
      setStyleReadable(true);
      await Promise.resolve();
    });

    expect(screen.getByText("Credits for replacement")).toBeInTheDocument();
  });
});

const session = (token: string, expiry: number) => ({
  session: token,
  expiry,
  tileWidth: 256,
  tileHeight: 256,
  imageFormat: "png",
});

const mountAttribution = ({ styleReadable = true } = {}) => {
  const store = createStore();
  let appliedSession: string | null = "initial";
  let isStyleReadable = styleReadable;
  const listeners = new Map<string, Set<() => void>>();
  store.set(
    layerConfigAtom,
    new Map([
      [
        "google",
        {
          id: "google",
          at: "a0",
          type: "GOOGLE",
          mapType: "satellite",
          name: "Google Satellite",
          opacity: 1,
          tms: false,
          isBasemap: true,
          labelVisibility: true,
          visibility: true,
        },
      ],
    ]),
  );
  const map = {
    isAlive: () => true,
    getZoom: () => 12,
    getBounds: () => ({
      getNorth: () => 20,
      getSouth: () => 10,
      getEast: () => 130,
      getWest: () => 120,
    }),
    map: {
      on: vi.fn((event: string, listener: () => void) => {
        const eventListeners = listeners.get(event) ?? new Set();
        eventListeners.add(listener);
        listeners.set(event, eventListeners);
      }),
      off: vi.fn((event: string, listener: () => void) => {
        listeners.get(event)?.delete(listener);
      }),
      getStyle: () => {
        if (!isStyleReadable) throw new Error("Style is not done loading");
        return {
          sources: appliedSession
            ? {
                google: {
                  type: "raster",
                  tiles: [
                    `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${appliedSession}&key=test-key`,
                  ],
                },
              }
            : {},
        };
      },
    },
  };
  render(
    <Provider store={store}>
      <GoogleMapsAttribution map={map as unknown as MapEngine} />
    </Provider>,
  );

  const applySession = (session: string | null) => {
    appliedSession = session;
    listeners.get("styledata")?.forEach((listener) => listener());
  };

  const setStyleReadable = (readable: boolean, event = "styledata") => {
    isStyleReadable = readable;
    listeners.get(event)?.forEach((listener) => listener());
  };

  return { store, map, applySession, setStyleReadable };
};
