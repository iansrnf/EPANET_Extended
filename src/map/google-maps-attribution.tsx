import { useEffect, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import type { MapEngine } from "@epanet-js/map";
import type { Style } from "mapbox-gl";
import { notify } from "src/components/notifications";
import { useTranslate } from "src/hooks/use-translate";
import { env } from "src/lib/env-client";
import {
  getGoogleMapsAttribution,
  getGoogleMapsSession,
  GOOGLE_MAPS_DISPLAY_OPTIONS,
  GOOGLE_MAPS_SESSION_RENEWAL_MARGIN_SECONDS,
} from "src/lib/google-map-tiles";
import { googleMapsSessionVersionAtom, layerConfigAtom } from "src/state/map";
import { showGridAtom } from "src/state/map-projection";
import { offlineAtom } from "src/state/offline";

export const GoogleMapsAttribution = ({ map }: { map: MapEngine | null }) => {
  const translate = useTranslate();
  useGoogleMapsSessionRenewal(map);
  const appliedSession = useAppliedGoogleMapsSession(map);
  const copyright = useGoogleMapsCopyright(map, appliedSession);

  if (!appliedSession) return null;

  return (
    <div
      className="absolute bottom-7 right-12 z-10 max-w-[calc(100%-4rem)] rounded-sm border bg-base px-2 py-1 text-right text-size-small text-default shadow-sm"
      aria-label={translate("googleMaps.basemapAttribution")}
    >
      <a
        href="https://maps.google.com/"
        target="_blank"
        rel="noreferrer"
        className="font-medium"
      >
        Google Maps
      </a>
      {copyright && <div>{copyright}</div>}
    </div>
  );
};

const useGoogleMapsSessionRenewal = (map: MapEngine | null) => {
  const layerConfigs = useAtomValue(layerConfigAtom);
  const isGridOn = useAtomValue(showGridAtom);
  const isOffline = useAtomValue(offlineAtom);
  const refreshSession = useSetAtom(googleMapsSessionVersionAtom);
  const translate = useTranslate();
  const googleLayer = [...layerConfigs.values()].find(
    (layer) => layer.type === "GOOGLE" && layer.visibility,
  );
  const layerId = googleLayer?.id;
  const mapType = googleLayer?.type === "GOOGLE" ? googleLayer.mapType : null;
  const labelVisibility = googleLayer?.labelVisibility ?? true;
  const apiKey = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const lastSession = useRef<{
    layerId: string;
    mapType: string;
    labelVisibility: boolean;
    token: string;
  } | null>(null);

  useEffect(() => {
    if (isGridOn || isOffline || !apiKey || !map || !mapType || !layerId)
      return;

    let disposed = false;
    let renewalTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryCount = 0;
    let reportedError = false;
    let isRenewing = false;

    const renewSession = async () => {
      if (disposed || !map.isAlive() || isRenewing) return;
      isRenewing = true;
      clearTimeout(renewalTimer);
      clearTimeout(retryTimer);

      try {
        const nextSession = await getGoogleMapsSession({
          apiKey,
          mapType,
          labelVisibility,
          ...GOOGLE_MAPS_DISPLAY_OPTIONS,
        });
        if (disposed || !map.isAlive()) return;

        const previousSession = lastSession.current;
        const hasRenewed =
          previousSession?.layerId === layerId &&
          previousSession.mapType === mapType &&
          previousSession.labelVisibility === labelVisibility &&
          previousSession.token !== nextSession.session;
        const shouldRebuild = hasRenewed || retryCount > 0;
        lastSession.current = {
          layerId,
          mapType,
          labelVisibility,
          token: nextSession.session,
        };
        retryCount = 0;
        if (shouldRebuild) refreshSession((version) => version + 1);

        const delay = Math.max(
          1000,
          nextSession.expiry * 1000 -
            Date.now() -
            GOOGLE_MAPS_SESSION_RENEWAL_MARGIN_SECONDS * 1000 +
            100,
        );
        renewalTimer = setTimeout(
          () => {
            void renewSession();
          },
          Math.min(delay, 2147483647),
        );
      } catch {
        if (disposed) return;
        if (!reportedError) {
          reportedError = true;
          notify({
            variant: "error",
            title: translate("googleMaps.failedToLoad"),
            description: translate("googleMaps.failedToLoadExplain"),
            id: "google-maps-load-failed",
          });
        }
        if (retryCount < 3) {
          retryCount += 1;
          retryTimer = setTimeout(() => {
            void renewSession();
          }, retryCount * 30000);
        }
      } finally {
        isRenewing = false;
      }
    };

    const onResume = () => {
      if (document.visibilityState === "visible") void renewSession();
    };

    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onResume);
    void renewSession();

    return () => {
      disposed = true;
      clearTimeout(renewalTimer);
      clearTimeout(retryTimer);
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onResume);
    };
  }, [
    apiKey,
    isGridOn,
    isOffline,
    labelVisibility,
    layerId,
    map,
    mapType,
    refreshSession,
    translate,
  ]);
};

const useAppliedGoogleMapsSession = (map: MapEngine | null) => {
  const [applied, setApplied] = useState<{
    map: MapEngine | null;
    session: string | null;
  }>({ map: null, session: null });

  useEffect(() => {
    if (!map) return;
    const onStyleData = () => {
      if (!map.isAlive()) return;
      let sources: Style["sources"];
      try {
        sources = map.map.getStyle()?.sources ?? {};
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Style is not done loading"
        ) {
          return;
        }
        throw error;
      }
      let session: string | null = null;

      for (const source of Object.values(sources)) {
        if (source.type !== "raster") continue;
        for (const tileUrl of source.tiles ?? []) {
          if (!tileUrl.startsWith("https://tile.googleapis.com/v1/2dtiles/")) {
            continue;
          }
          session = new URL(tileUrl).searchParams.get("session");
          if (session) break;
        }
        if (session) break;
      }

      setApplied((current) =>
        current.map === map && current.session === session
          ? current
          : { map, session },
      );
    };

    map.map.on("styledata", onStyleData);
    map.map.on("style.load", onStyleData);
    onStyleData();
    return () => {
      map.map.off("styledata", onStyleData);
      map.map.off("style.load", onStyleData);
    };
  }, [map]);

  return applied.map === map ? applied.session : null;
};

const useGoogleMapsCopyright = (
  map: MapEngine | null,
  session: string | null,
) => {
  const isOffline = useAtomValue(offlineAtom);
  const translate = useTranslate();
  const apiKey = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [attribution, setAttribution] = useState<{
    map: MapEngine | null;
    session: string;
    copyright: string;
  }>({
    map: null,
    session: "",
    copyright: "",
  });

  useEffect(() => {
    if (!map || !session || !apiKey || isOffline) return;
    let disposed = false;
    let reportedError = false;
    let request: AbortController | undefined;

    const updateAttribution = async () => {
      if (disposed || !map.isAlive()) return;
      request?.abort();
      const currentRequest = new AbortController();
      request = currentRequest;

      try {
        const bounds = map.getBounds();
        const copyright = await getGoogleMapsAttribution({
          apiKey,
          session,
          zoom: Math.max(0, Math.min(22, Math.floor(map.getZoom()))),
          bounds: {
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest(),
          },
          signal: currentRequest.signal,
        });
        if (!disposed && !currentRequest.signal.aborted && map.isAlive()) {
          setAttribution({ map, session, copyright });
        }
      } catch {
        if (!disposed && !currentRequest.signal.aborted && !reportedError) {
          reportedError = true;
          notify({
            variant: "error",
            title: translate("googleMaps.failedToLoad"),
            description: translate("googleMaps.failedToLoadExplain"),
            id: "google-maps-load-failed",
          });
        }
      }
    };

    const onViewportChanged = () => {
      void updateAttribution();
    };

    map.map.on("moveend", onViewportChanged);
    map.map.on("resize", onViewportChanged);
    void updateAttribution();
    return () => {
      disposed = true;
      request?.abort();
      map.map.off("moveend", onViewportChanged);
      map.map.off("resize", onViewportChanged);
    };
  }, [apiKey, isOffline, map, session, translate]);

  return attribution.map === map && attribution.session === session
    ? attribution.copyright
    : "";
};
