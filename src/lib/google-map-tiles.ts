import { z } from "zod";

export type GoogleMapType = "roadmap" | "satellite";

export const GOOGLE_MAPS_DISPLAY_OPTIONS = {
  language: "en-US",
  region: "US",
} as const;

export type GoogleMapsSession = {
  session: string;
  expiry: number;
  tileWidth: number;
  tileHeight: number;
  imageFormat: string;
};

export type GoogleMapsBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

type SessionOptions = {
  apiKey: string;
  mapType: GoogleMapType;
  language: string;
  region: string;
  labelVisibility: boolean;
};

export const GOOGLE_MAPS_SESSION_RENEWAL_MARGIN_SECONDS = 60;

const sessions = new Map<string, GoogleMapsSession>();
const pendingSessions = new Map<string, Promise<GoogleMapsSession>>();

export function getGoogleMapsSession(
  options: SessionOptions,
): Promise<GoogleMapsSession> {
  if (!options.apiKey.trim()) {
    return Promise.reject(new Error("Google Maps API key is not configured."));
  }

  const cacheKey = JSON.stringify([
    options.apiKey,
    options.mapType,
    options.language,
    options.region,
    options.labelVisibility,
  ]);
  const cachedSession = sessions.get(cacheKey);
  if (
    cachedSession &&
    cachedSession.expiry - GOOGLE_MAPS_SESSION_RENEWAL_MARGIN_SECONDS >
      Date.now() / 1000
  ) {
    return Promise.resolve(cachedSession);
  }

  const pendingSession = pendingSessions.get(cacheKey);
  if (pendingSession) return pendingSession;

  const request = createSession(options)
    .then((session) => {
      sessions.set(cacheKey, session);
      return session;
    })
    .finally(() => {
      pendingSessions.delete(cacheKey);
    });
  pendingSessions.set(cacheKey, request);
  return request;
}

export function getGoogleMapsTileUrl(
  session: GoogleMapsSession,
  apiKey: string,
): string {
  const query = new URLSearchParams({ session: session.session, key: apiKey });
  return `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?${query.toString()}`;
}

export async function getGoogleMapsAttribution({
  apiKey,
  session,
  zoom,
  bounds,
  signal,
}: {
  apiKey: string;
  session: string;
  zoom: number;
  bounds: GoogleMapsBounds;
  signal?: AbortSignal;
}): Promise<string> {
  if (!apiKey.trim() || !session) {
    throw new Error("Google Maps credentials are not configured.");
  }
  if (
    !Number.isFinite(zoom) ||
    !Object.values(bounds).every(Number.isFinite) ||
    bounds.north < bounds.south
  ) {
    throw new Error("Google Maps viewport bounds are invalid.");
  }

  const spansWorld = Math.abs(bounds.east - bounds.west) >= 360;
  const query = new URLSearchParams({
    key: apiKey,
    session,
    zoom: String(Math.max(0, Math.min(22, Math.floor(zoom)))),
    north: String(clampLatitude(bounds.north)),
    south: String(clampLatitude(bounds.south)),
    east: String(spansWorld ? 179.999999 : wrapLongitude(bounds.east)),
    west: String(spansWorld ? -179.999999 : wrapLongitude(bounds.west)),
  });
  const response = await requestGoogleMaps(
    `https://tile.googleapis.com/tile/v1/viewport?${query.toString()}`,
    { signal },
  );
  const result = z
    .object({ copyright: z.string().min(1) })
    .safeParse(await readGoogleMapsJson(response));
  if (!result.success) {
    throw new Error("Google Maps returned invalid attribution data.");
  }
  return result.data.copyright;
}

async function createSession(
  options: SessionOptions,
): Promise<GoogleMapsSession> {
  const query = new URLSearchParams({ key: options.apiKey });
  const response = await requestGoogleMaps(
    `https://tile.googleapis.com/v1/createSession?${query.toString()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mapType: options.mapType,
        language: options.language,
        region: options.region,
        ...(options.mapType === "satellite" && options.labelVisibility
          ? { layerTypes: ["layerRoadmap"] }
          : {}),
        ...(options.mapType === "roadmap" && !options.labelVisibility
          ? {
              styles: [
                { elementType: "labels", stylers: [{ visibility: "off" }] },
              ],
            }
          : {}),
      }),
    },
  );
  const result = z
    .object({
      session: z.string().min(1),
      expiry: z.coerce.number().finite().positive(),
      tileWidth: z.number().int().positive(),
      tileHeight: z.number().int().positive(),
      imageFormat: z.enum(["png", "jpeg"]),
    })
    .safeParse(await readGoogleMapsJson(response));
  if (!result.success || result.data.expiry <= Date.now() / 1000) {
    throw new Error("Google Maps returned an invalid session response.");
  }
  return result.data;
}

async function requestGoogleMaps(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    if (init.signal?.aborted) {
      throw new DOMException(
        "Google Maps request was cancelled.",
        "AbortError",
      );
    }
    throw new Error("Could not connect to Google Maps.");
  }
  if (!response.ok) {
    throw new Error(`Google Maps request failed (${response.status}).`);
  }
  return response;
}

async function readGoogleMapsJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new Error("Google Maps returned an invalid response.");
  }
}

function clampLatitude(value: number): number {
  return Math.max(-89.999999, Math.min(89.999999, value));
}

function wrapLongitude(value: number): number {
  const wrapped = ((((value + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? (value > 0 ? 179.999999 : -179.999999) : wrapped;
}
