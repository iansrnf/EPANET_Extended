import { useEffect, useMemo, useRef } from "react";
import { useAtomValue } from "jotai";
import { useLiveSeriesStore } from "src/store/liveSeriesStore";
import { useLiveLoggerReadingsStore } from "src/store/liveLoggerReadingsStore";
import { stagingModelAtom } from "src/state/jotai";

const PSI_PER_METER = 1.42233433;
const PSI_PER_KPA = 0.1450377377;
const PSI_PER_BAR = 14.5037738;
const PSI_PER_FOOT = 0.4333;

function pressureToPsiFromPayload(msg: Record<string, unknown>): number | null {
  if (typeof msg.pressure_psi === "number" && Number.isFinite(msg.pressure_psi))
    return msg.pressure_psi;
  if (typeof msg.pressurePsi === "number" && Number.isFinite(msg.pressurePsi))
    return msg.pressurePsi;
  if (typeof msg.pressure_kpa === "number" && Number.isFinite(msg.pressure_kpa))
    return msg.pressure_kpa * PSI_PER_KPA;
  if (typeof msg.pressure_bar === "number" && Number.isFinite(msg.pressure_bar))
    return msg.pressure_bar * PSI_PER_BAR;
  if (typeof msg.pressure_ft === "number" && Number.isFinite(msg.pressure_ft))
    return msg.pressure_ft * PSI_PER_FOOT;
  if (typeof msg.pressure === "number" && Number.isFinite(msg.pressure))
    return msg.pressure * PSI_PER_METER;
  return null;
}

export const useLiveLoggerConnection = () => {
  const liveLogger = useLiveSeriesStore((s) => s.liveLogger);
  const setLiveLogger = useLiveSeriesStore((s) => s.setLiveLogger);
  const setConnection = useLiveLoggerReadingsStore((s) => s.setConnection);
  const upsertReading = useLiveLoggerReadingsStore((s) => s.upsertReading);
  const hydraulicModel = useAtomValue(stagingModelAtom);
  const wsRef = useRef<WebSocket | null>(null);
  const connectedDeviceIdRef = useRef<string | null>(null);
  const hasAutoActivatedRef = useRef(false);

  const firstLoggerIdentity = useMemo(() => {
    for (const asset of hydraulicModel.assets.values()) {
      if (asset.type !== "loggerPoint") continue;
      const deviceId = asset.deviceId?.trim();
      if (deviceId) return deviceId;
      const label = asset.label?.trim();
      if (label) return label;
    }
    return "";
  }, [hydraulicModel.assets]);

  const hasLoggerPoints = firstLoggerIdentity.length > 0;

  useEffect(() => {
    if (hasAutoActivatedRef.current) return;
    if (!hasLoggerPoints) return;

    hasAutoActivatedRef.current = true;
    setLiveLogger((prev) => ({
      ...prev,
      enabled: true,
      field: "pressure",
      deviceId: prev.deviceId?.trim() ? prev.deviceId : firstLoggerIdentity,
    }));
  }, [firstLoggerIdentity, hasLoggerPoints, setLiveLogger]);

  useEffect(() => {
    const markDisconnected = () => {
      const connectedDeviceId = connectedDeviceIdRef.current;
      if (connectedDeviceId) {
        setConnection(connectedDeviceId, false);
      }
      connectedDeviceIdRef.current = null;
    };

    if (!liveLogger.enabled) {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
      markDisconnected();
      return;
    }

    const ws = new WebSocket(liveLogger.wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      const initialDeviceId = liveLogger.deviceId.trim();
      if (initialDeviceId) {
        connectedDeviceIdRef.current = initialDeviceId;
        setConnection(initialDeviceId, true);
      }
    };

    ws.onclose = () => {
      markDisconnected();
    };

    ws.onerror = () => {
      markDisconnected();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as Record<string, unknown>;
        const payloadDeviceId =
          typeof msg.deviceId === "string" ? msg.deviceId.trim() : "";
        const configuredDeviceId = liveLogger.deviceId.trim();

        const effectiveDeviceId =
          payloadDeviceId ||
          connectedDeviceIdRef.current ||
          configuredDeviceId;
        if (!effectiveDeviceId) return;

        const pressurePsi = pressureToPsiFromPayload(msg);
        if (pressurePsi === null) return;

        if (
          connectedDeviceIdRef.current &&
          connectedDeviceIdRef.current !== effectiveDeviceId
        ) {
          setConnection(connectedDeviceIdRef.current, false);
        }
        connectedDeviceIdRef.current = effectiveDeviceId;
        setConnection(effectiveDeviceId, true);
        upsertReading(effectiveDeviceId, {
          pressurePsi,
          timestamp:
            typeof msg.timestamp === "string" ? msg.timestamp : undefined,
        });

        // Support aliases like L1/L2 when payload uses hardware IDs.
        if (configuredDeviceId && configuredDeviceId !== effectiveDeviceId) {
          setConnection(configuredDeviceId, true);
          upsertReading(configuredDeviceId, {
            pressurePsi,
            timestamp:
              typeof msg.timestamp === "string" ? msg.timestamp : undefined,
          });
        }
      } catch {}
    };

    return () => {
      try {
        ws.close();
      } catch {}
      wsRef.current = null;
      markDisconnected();
    };
  }, [
    liveLogger.enabled,
    liveLogger.wsUrl,
    liveLogger.deviceId,
    setConnection,
    upsertReading,
  ]);
};
