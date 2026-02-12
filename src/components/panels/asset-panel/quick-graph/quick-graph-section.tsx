// File: src/components/asset-panel/quick-graph/use-quick-graph.tsx
// (Use the same path where your current QuickGraphSection lives. Replace that file’s contents with this.)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { PinIcon, PinOffIcon } from "src/icons";
import { Button } from "src/components/elements";
import { Selector } from "src/components/form/selector";
import { useTranslate } from "src/hooks/use-translate";
import { dataAtom, simulationAtom, stagingModelAtom } from "src/state/jotai";
import { worktreeAtom } from "src/state/scenarios";
import { getSimulationMetadata } from "src/simulation/epanet/simulation-metadata";
import {
  assetPanelFooterAtom,
  quickGraphPropertyAtom,
  DEFAULT_FOOTER_HEIGHT,
  type QuickGraphAssetType,
  type QuickGraphPropertyByAssetType,
} from "src/state/quick-graph";
import type { QuantityProperty } from "src/model-metadata/quantities-spec";
import type { TimeSeries } from "src/simulation/epanet/eps-results-reader";
import type { AssetId, Valve } from "src/hydraulic-model/asset-types";
import { useTimeSeries } from "./use-time-series";
import { QuickGraphChart } from "./quick-graph-chart";
import { useChangeTimestep } from "src/commands/change-timestep";

const QUICK_GRAPH_PROPERTIES: {
  [K in QuickGraphAssetType]: {
    value: QuickGraphPropertyByAssetType[K];
    labelKey: string;
    quantityKey: QuantityProperty;
  }[];
} = {
  junction: [
    { value: "pressure", labelKey: "pressure", quantityKey: "pressure" },
    { value: "head", labelKey: "head", quantityKey: "head" },
    { value: "demand", labelKey: "actualDemand", quantityKey: "actualDemand" },
  ],
  pipe: [
    { value: "flow", labelKey: "flow", quantityKey: "flow" },
    { value: "velocity", labelKey: "velocity", quantityKey: "velocity" },
    { value: "headloss", labelKey: "unitHeadloss", quantityKey: "unitHeadloss" },
  ],
  pump: [
    { value: "flow", labelKey: "flow", quantityKey: "flow" },
    { value: "headloss", labelKey: "pumpHead", quantityKey: "head" },
  ],
  valve: [
    { value: "flow", labelKey: "flow", quantityKey: "flow" },
    { value: "velocity", labelKey: "velocity", quantityKey: "velocity" },
    { value: "headloss", labelKey: "headlossShort", quantityKey: "headloss" },
    { value: "setting", labelKey: "setting", quantityKey: "tcvSetting" },
  ],
  tank: [
    { value: "level", labelKey: "level", quantityKey: "level" },
    { value: "volume", labelKey: "volume", quantityKey: "volume" },
    { value: "pressure", labelKey: "pressure", quantityKey: "pressure" },
    { value: "head", labelKey: "head", quantityKey: "head" },
  ],
  reservoir: [{ value: "head", labelKey: "head", quantityKey: "head" }],
};

export const useShowQuickGraph = () => {
  const simulation = useAtomValue(simulationAtom);
  const hadValidSimulationRef = useRef(false);

  const hasCompletedSimulation =
    simulation.status === "success" || simulation.status === "warning";

  if (hasCompletedSimulation) {
    const metadata = getSimulationMetadata(simulation.metadata);
    hadValidSimulationRef.current = metadata.reportingStepsCount > 1;
  }

  if (hasCompletedSimulation) return hadValidSimulationRef.current;
  if (simulation.status === "running") return hadValidSimulationRef.current;
  return false;
};

interface QuickGraphSectionProps {
  assetType: QuickGraphAssetType;
  assetId: AssetId;
  data: TimeSeries | null;
  mainData: TimeSeries | null;
  isLoading: boolean;
}

const getValveSettingQuantityKey = (valve: Valve): QuantityProperty | null => {
  if (valve.kind === "tcv") return null;
  if (["psv", "prv", "pbv"].includes(valve.kind)) return "pressure";
  if (valve.kind === "fcv") return "flow";
  return null;
};

// ------------------------
// Live logger helpers
// ------------------------
type LiveLoggerConfig = {
  enabled: boolean;
  wsUrl: string;
  deviceId: string;
  field: string;

  /**
   * How to map incoming timestamps onto the chart x-axis.
   * - "midnight": map to seconds since local midnight (works for 00:00..24:00 timelines)
   * - "rolling": map relative to when you hit Enable (useful for “last 1 hour” style charts)
   */
  timeMapping: "midnight" | "rolling";
};

const DEFAULT_LIVE_LOGGER: LiveLoggerConfig = {
  enabled: false,
  wsUrl: "wss://logger-api.gscwd.app/stream",
  deviceId: "pi-sim-001",
  field: "pressure",
  timeMapping: "midnight",
};

function safeNumber(x: unknown): number | null {
  if (typeof x !== "number") return null;
  if (!Number.isFinite(x)) return null;
  return x;
}

function parseTimestampMs(ts: unknown): number {
  if (typeof ts === "number" && Number.isFinite(ts)) return ts;
  if (typeof ts === "string") {
    const parsed = Date.parse(ts);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

function secondsSinceLocalMidnight(tsMs: number): number {
  const d = new Date(tsMs);
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}
// ------------------------

const QuickGraphSection = ({
  assetType,
  assetId,
  data,
  mainData,
  isLoading,
}: QuickGraphSectionProps) => {
  const translate = useTranslate();
  const [footerState, setFooterState] = useAtom(assetPanelFooterAtom);
  const [propertyByType, setPropertyByType] = useAtom(quickGraphPropertyAtom);
  const simulation = useAtomValue(simulationAtom);
  const worktree = useAtomValue(worktreeAtom);
  const {
    modelMetadata: { quantities },
  } = useAtomValue(dataAtom);
  const hydraulicModel = useAtomValue(stagingModelAtom);
  const { changeTimestep } = useChangeTimestep();

  const isInScenario = worktree.activeSnapshotId !== worktree.mainId;
  const activeSnapshot = worktree.snapshots.get(worktree.activeSnapshotId);
  const scenarioName = isInScenario ? (activeSnapshot?.name ?? null) : null;
  const mainLabel = isInScenario ? translate("scenarios.main") : null;

  const selectedProperty = propertyByType[assetType];

  const selectedOption = QUICK_GRAPH_PROPERTIES[assetType].find(
    (opt) => opt.value === selectedProperty,
  );

  const decimals = useMemo(() => {
    if (!selectedOption) return 0;
    let quantityKey = selectedOption.quantityKey;
    if (assetType === "valve" && selectedProperty === "setting") {
      const valve = hydraulicModel.assets.get(assetId) as Valve | undefined;
      if (valve) quantityKey = getValveSettingQuantityKey(valve) ?? quantityKey;
    }
    return quantities.getDecimals(quantityKey) ?? 0;
  }, [
    selectedOption,
    assetType,
    selectedProperty,
    assetId,
    hydraulicModel,
    quantities,
  ]);

  const values = useMemo(() => (data ? Array.from(data.values) : []), [data]);
  const mainValues = useMemo(
    () => (mainData ? Array.from(mainData.values) : null),
    [mainData],
  );

  const timeStepIndex =
    simulation.status === "success" || simulation.status === "warning"
      ? (simulation.currentTimestepIndex ?? 0)
      : 0;

  // ------------------------
  // Live logger state + buffers
  // ------------------------
  const [isLiveModalOpen, setIsLiveModalOpen] = useState(false);
  const [liveLogger, setLiveLogger] =
    useState<LiveLoggerConfig>(DEFAULT_LIVE_LOGGER);

  const wsRef = useRef<WebSocket | null>(null);

  // Rolling anchor (used when timeMapping="rolling")
  const rollingStartMsRef = useRef<number | null>(null);

  // Live series buffer aligned to values[] length
  const liveSeriesRef = useRef<(number | null)[]>([]);

  // A tick to force changes into memo deps and to ensure child gets new props
  const [tick, setTick] = useState(0);

  // Reset live buffers if timeline size changes
  useEffect(() => {
    liveSeriesRef.current = values.length ? Array(values.length).fill(null) : [];
    setTick((x) => x + 1);
  }, [values.length, data?.intervalSeconds, data?.intervalsCount]);

  // Keep live field in sync with selected property
  useEffect(() => {
    setLiveLogger((prev) => ({ ...prev, field: String(selectedProperty) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProperty]);

  // Connect/disconnect live websocket
  useEffect(() => {
    if (!liveLogger.enabled) {
      // disconnect
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
      return;
    }

    // clear series on connect
    liveSeriesRef.current = values.length ? Array(values.length).fill(null) : [];
    setTick((x) => x + 1);

    // set rolling anchor when enabling
    if (liveLogger.timeMapping === "rolling") {
      rollingStartMsRef.current = Date.now();
    }

    const ws = new WebSocket(liveLogger.wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        const deviceId = msg?.deviceId;
        if (liveLogger.deviceId && deviceId !== liveLogger.deviceId) return;

        const v = safeNumber(msg?.[liveLogger.field]);
        if (v === null) return;

        if (!data || values.length === 0) return;

        const tMs = parseTimestampMs(msg?.timestamp);

        // Map timestamp to index on the chart
        let idx = -1;

        if (liveLogger.timeMapping === "midnight") {
          const sec = secondsSinceLocalMidnight(tMs);
          idx = Math.round(sec / data.intervalSeconds);
        } else {
          const startMs = rollingStartMsRef.current ?? Date.now();
          rollingStartMsRef.current = startMs;
          const elapsedSec = (tMs - startMs) / 1000;
          idx = Math.round(elapsedSec / data.intervalSeconds);
        }

        // Drop points outside the current series length
        if (idx < 0 || idx >= values.length) return;

        // Ensure correct buffer length
        if (
          !liveSeriesRef.current ||
          liveSeriesRef.current.length !== values.length
        ) {
          liveSeriesRef.current = Array(values.length).fill(null);
        }

        // Update value and tick
        liveSeriesRef.current[idx] = v;
        setTick((x) => x + 1);
      } catch {
        // ignore invalid json
      }
    };

    ws.onclose = () => {
      // optional: you can set some "connected" UI state here
    };

    ws.onerror = () => {
      // optional: set some "error" UI state here
    };

    return () => {
      try {
        ws.close();
      } catch {}
      wsRef.current = null;
    };
  }, [
    liveLogger.enabled,
    liveLogger.wsUrl,
    liveLogger.deviceId,
    liveLogger.field,
    liveLogger.timeMapping,
    data,
    values.length,
  ]);

  // IMPORTANT:
  // Return a NEW array reference when tick changes.
  // This makes memoized children re-render reliably.
  const liveAlignedValues = useMemo(() => {
    if (!liveLogger.enabled) return null;
    if (!data) return null;

    const arr =
      liveSeriesRef.current && liveSeriesRef.current.length === values.length
        ? liveSeriesRef.current
        : Array(values.length).fill(null);

    return arr.slice();
  }, [liveLogger.enabled, data, values.length, tick]);
  // ------------------------

  const propertyOptions = useMemo(() => {
    const options = QUICK_GRAPH_PROPERTIES[assetType];
    return options.map((opt) => {
      const label = translate(opt.labelKey);
      let quantityKey = opt.quantityKey;
      if (assetType === "valve" && opt.value === "setting") {
        const valve = hydraulicModel.assets.get(assetId) as Valve | undefined;
        if (valve)
          quantityKey = getValveSettingQuantityKey(valve) ?? opt.quantityKey;
      }
      const unit = quantities.getUnit(quantityKey);
      return { value: opt.value, label: unit ? `${label} (${unit})` : label };
    });
  }, [assetType, assetId, hydraulicModel, translate, quantities]);

  const handlePropertyChange = useCallback(
    (value: QuickGraphPropertyByAssetType[typeof assetType]) => {
      setPropertyByType((prev) => ({ ...prev, [assetType]: value }));
    },
    [assetType, setPropertyByType],
  );

  const handlePinToggle = useCallback(() => {
    setFooterState((prev) => ({
      isPinned: !prev.isPinned,
      height: DEFAULT_FOOTER_HEIGHT,
    }));
  }, [setFooterState]);

  const handleIntervalClick = useCallback(
    (intervalIndex: number) => {
      void changeTimestep(intervalIndex, "quick-graph");
    },
    [changeTimestep],
  );

  const { isPinned } = footerState;

  const pinButton = (
    <div className="flex h-8 my-[-0.5rem]">
      <Button
        variant="quiet"
        onClick={handlePinToggle}
        title={isPinned ? translate("unpin") : translate("pin")}
        aria-label={isPinned ? translate("unpin") : translate("pin")}
        data-state-on={isPinned || undefined}
      >
        {isPinned ? <PinOffIcon /> : <PinIcon />}
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-start justify-between text-sm font-semibold pb-2">
        {translate("quickGraph")}
        {pinButton}
      </div>

      {/* selector + add live logger */}
      <div className="flex items-center gap-2 pb-2">
        <div className="w-max">
          <Selector
            options={propertyOptions}
            selected={selectedProperty}
            onChange={handlePropertyChange}
            styleOptions={{ border: true, textSize: "text-sm", paddingY: 1 }}
          />
        </div>

        <Button
          variant="quiet"
          onClick={() => setIsLiveModalOpen(true)}
          title="Add Live Logger"
          aria-label="Add Live Logger"
        >
          <span className="flex items-center gap-2 text-purple-600">
            <span className="text-lg leading-none">+</span>
            <span className="text-sm font-semibold">Add Live Logger</span>
          </span>
        </Button>
      </div>

      <div className="relative flex-1 min-h-[120px]">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-gray-900/50 z-10">
            <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {data !== null ? (
          <div className="absolute inset-0">
            <QuickGraphChart
              values={values}
              mainValues={mainValues}
              mainLabel={mainLabel}
              intervalSeconds={data.intervalSeconds}
              intervalsCount={data.intervalsCount}
              currentIntervalIndex={timeStepIndex}
              decimals={decimals}
              onIntevalClick={handleIntervalClick}
              scenarioName={scenarioName}
              liveValues={liveAlignedValues}
              liveLabel={liveLogger.enabled ? `Live (${liveLogger.deviceId})` : null}
              liveColor="rgb(239, 68, 68)"
            />
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400 text-xs">
            {translate("errorLoadingData")}
          </div>
        )}
      </div>

      {/* live modal */}
      {isLiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[520px] max-w-[92vw] rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between pb-2">
              <div className="text-sm font-semibold">Live Logger</div>
              <button
                className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                onClick={() => setIsLiveModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="grid gap-3 text-sm">
              <label className="grid gap-1">
                <span className="text-gray-600 dark:text-gray-300">WebSocket URL</span>
                <input
                  className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1"
                  value={liveLogger.wsUrl}
                  onChange={(e) =>
                    setLiveLogger((p) => ({ ...p, wsUrl: e.target.value }))
                  }
                  placeholder="ws://127.0.0.1:8765"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span className="text-gray-600 dark:text-gray-300">Device ID</span>
                  <input
                    className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1"
                    value={liveLogger.deviceId}
                    onChange={(e) =>
                      setLiveLogger((p) => ({ ...p, deviceId: e.target.value }))
                    }
                    placeholder="pi-sim-001"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-gray-600 dark:text-gray-300">Field</span>
                  <input
                    className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1"
                    value={liveLogger.field}
                    onChange={(e) =>
                      setLiveLogger((p) => ({ ...p, field: e.target.value }))
                    }
                    placeholder="pressure"
                  />
                </label>
              </div>

              <label className="grid gap-1">
                <span className="text-gray-600 dark:text-gray-300">Time mapping</span>
                <select
                  className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1"
                  value={liveLogger.timeMapping}
                  onChange={(e) =>
                    setLiveLogger((p) => ({
                      ...p,
                      timeMapping: e.target.value as LiveLoggerConfig["timeMapping"],
                    }))
                  }
                >
                  <option value="midnight">
                    Midnight-based (timestamp hour:minute chart 00:00..24:00)
                  </option>
                  <option value="rolling">
                    Rolling (starts at Enable chart starts at 00:00)
                  </option>
                </select>
              </label>

              <div className="text-xs text-gray-500">
                If your x-axis is 00:00..24:00, use Midnight-based.
                If your x-axis is “start now then run”, use Rolling.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="quiet"
                  onClick={() => {
                    setLiveLogger((p) => ({ ...p, enabled: false }));
                    setIsLiveModalOpen(false);
                  }}
                >
                  Disable
                </Button>

                <Button
                  onClick={() => {
                    // Reset buffers and anchors before enabling
                    rollingStartMsRef.current = Date.now();
                    liveSeriesRef.current = values.length
                      ? Array(values.length).fill(null)
                      : [];
                    setTick((x) => x + 1);

                    setLiveLogger((p) => ({ ...p, enabled: true }));
                    setIsLiveModalOpen(false);
                  }}
                >
                  Enable
                </Button>
              </div>

              <div className="text-xs text-gray-500">
                WebSocket message example:
                <code className="ml-1">
                  {`{"deviceId":"pi-sim-001","timestamp":"2026-02-12T09:48:34","pressure":-0.130149}`}
                </code>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const QuickGraph = QuickGraphSection;

export function useQuickGraph<T extends QuickGraphAssetType>(
  assetId: number,
  assetType: T,
) {
  const showQuickGraph = useShowQuickGraph();
  const [propertyByType] = useAtom(quickGraphPropertyAtom);
  const selectedProperty = propertyByType[assetType];

  const { data, mainData, isLoading } = useTimeSeries({
    assetId,
    assetType,
    property: selectedProperty,
  });

  const footer = showQuickGraph ? (
    <QuickGraph
      assetId={assetId}
      assetType={assetType}
      data={data}
      mainData={mainData}
      isLoading={isLoading}
    />
  ) : undefined;

  return { footer };
}
