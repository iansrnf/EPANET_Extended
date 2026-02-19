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
import { Unit, convertTo } from "src/quantity";

// ✅ Zustand store (must include liveLogger + ensureSeriesLength + resetLiveSeries)
import { useLiveSeriesStore, type LiveLoggerConfig } from "src/store/liveSeriesStore";

const QUICK_GRAPH_PROPERTIES: {
  [K in QuickGraphAssetType]: {
    value: QuickGraphPropertyByAssetType[K];
    labelKey: string;
    quantityKey: QuantityProperty;
    displayUnit?: Unit;
  }[];
} = {
  junction: [
    {
      value: "pressureMeters",
      labelKey: "pressure",
      quantityKey: "pressure",
      displayUnit: "mwc",
    },
    {
      value: "pressurePsi",
      labelKey: "pressure",
      quantityKey: "pressure",
      displayUnit: "psi",
    },
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
    {
      value: "pressureMeters",
      labelKey: "pressure",
      quantityKey: "pressure",
      displayUnit: "mwc",
    },
    {
      value: "pressurePsi",
      labelKey: "pressure",
      quantityKey: "pressure",
      displayUnit: "psi",
    },
    { value: "head", labelKey: "head", quantityKey: "head" },
  ],
  reservoir: [{ value: "head", labelKey: "head", quantityKey: "head" }],
};

const isPressureVariant = (
  property: QuickGraphPropertyByAssetType[QuickGraphAssetType],
) =>
  property === "pressure" ||
  property === "pressureMeters" ||
  property === "pressurePsi";

const toSeriesProperty = <T extends QuickGraphAssetType>(
  property: QuickGraphPropertyByAssetType[T],
): QuickGraphPropertyByAssetType[T] =>
  isPressureVariant(property)
    ? ("pressure" as QuickGraphPropertyByAssetType[T])
    : property;

const toTargetPressureUnit = (
  property: QuickGraphPropertyByAssetType[QuickGraphAssetType],
): Unit | null => {
  if (property === "pressureMeters") return "mwc";
  if (property === "pressurePsi") return "psi";
  return null;
};

const normalizePressurePropertySelection = <T extends QuickGraphAssetType>(
  assetType: T,
  property: QuickGraphPropertyByAssetType[T],
): QuickGraphPropertyByAssetType[T] => {
  if (
    property === "pressure" &&
    (assetType === "junction" || assetType === "tank")
  ) {
    return "pressureMeters" as QuickGraphPropertyByAssetType[T];
  }
  return property;
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
  nodeTitle: string;
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
function safeNumber(x: unknown): number | null {
  if (typeof x !== "number") return null;
  if (!Number.isFinite(x)) return null;
  return x;
}

function pressureToPsiFromPayload(msg: Record<string, unknown>): number | null {
  const PSI_PER_METER = 1.42233433;
  const PSI_PER_KPA = 0.1450377377;
  const PSI_PER_BAR = 14.5037738;
  const PSI_PER_FOOT = 0.4333;

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

export const QuickGraph = ({
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

  const selectedProperty = normalizePressurePropertySelection(
    assetType,
    propertyByType[assetType],
  );

  const selectedOption = QUICK_GRAPH_PROPERTIES[assetType].find(
    (opt) => opt.value === selectedProperty,
  );
  const pressureTargetUnit = toTargetPressureUnit(selectedProperty);
  const pressureSourceUnit = quantities.getUnit("pressure");
  const convertPressureIfNeeded = useCallback(
    (value: number): number => {
      if (!pressureTargetUnit || !isPressureVariant(selectedProperty)) return value;
      if (!pressureSourceUnit || pressureSourceUnit === pressureTargetUnit) {
        return value;
      }
      return convertTo({ value, unit: pressureSourceUnit }, pressureTargetUnit);
    },
    [pressureTargetUnit, pressureSourceUnit, selectedProperty],
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

  const values = useMemo(
    () =>
      data
        ? Array.from(data.values).map((value) => convertPressureIfNeeded(value))
        : [],
    [data, convertPressureIfNeeded],
  );
  const mainValues = useMemo(
    () =>
      mainData
        ? Array.from(mainData.values).map((value) => convertPressureIfNeeded(value))
        : null,
    [mainData, convertPressureIfNeeded],
  );

  const timeStepIndex =
    simulation.status === "success" || simulation.status === "warning"
      ? (simulation.currentTimestepIndex ?? 0)
      : 0;

  // ------------------------
  // Live logger: GLOBAL state + local connection refs
  // ------------------------
  const [isLiveModalOpen, setIsLiveModalOpen] = useState(false);

  const liveSeries = useLiveSeriesStore((s) => s.liveSeries);
  const setLiveSeries = useLiveSeriesStore((s) => s.setLiveSeries);
  const resetLiveSeries = useLiveSeriesStore((s) => s.resetLiveSeries);
  const ensureSeriesLength = useLiveSeriesStore((s) => s.ensureSeriesLength);

  const liveLogger = useLiveSeriesStore((s) => s.liveLogger);
  const setLiveLogger = useLiveSeriesStore((s) => s.setLiveLogger);

  const wsRef = useRef<WebSocket | null>(null);
  const rollingStartMsRef = useRef<number | null>(null);

  // Keep series length aligned to chart length WITHOUT wiping existing points
  useEffect(() => {
    if (!values.length) return;
    ensureSeriesLength(values.length);
  }, [values.length, ensureSeriesLength]);

  // Keep live field in sync with selected property (optional but matches your old behavior)
  useEffect(() => {
    setLiveLogger((prev: LiveLoggerConfig) => ({ ...prev, field: String(selectedProperty) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProperty]);

  // Connect/disconnect websocket based on liveLogger.enabled
  useEffect(() => {
    // If disabled: close any existing socket (but DO NOT clear points here)
    if (!liveLogger.enabled) {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
      return;
    }

    // Ensure length so writes won't explode
    ensureSeriesLength(values.length);

    // Rolling anchor (only set if missing)
    if (liveLogger.timeMapping === "rolling" && rollingStartMsRef.current == null) {
      rollingStartMsRef.current = Date.now();
    }

    const ws = new WebSocket(liveLogger.wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        const deviceId = msg?.deviceId;
        if (liveLogger.deviceId && deviceId !== liveLogger.deviceId) return;

        const isPressureField =
          String(liveLogger.field).toLowerCase() === "pressure";
        const v = isPressureField
          ? pressureToPsiFromPayload(msg as Record<string, unknown>)
          : safeNumber(msg?.[liveLogger.field]);
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

        if (idx < 0 || idx >= values.length) return;

        // Immutable update to trigger React rerender, while preserving older points
        setLiveSeries((prev) => {
          const base =
            prev.length === values.length
              ? prev
              : prev.length > values.length
                ? prev.slice(0, values.length)
                : [...prev, ...Array(values.length - prev.length).fill(null)];

          const next = base.slice();
          next[idx] = v;
          return next;
        });
      } catch {
        // ignore invalid json
      }
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
    ensureSeriesLength,
    setLiveSeries,
    data,
    values.length,
  ]);

  // Chart gets live series only when enabled
  const liveAlignedValues = useMemo(() => {
    if (!liveLogger.enabled) return null;
    if (!data) return null;

    if (!liveSeries || liveSeries.length !== values.length) {
      return Array(values.length).fill(null);
    }
    return liveSeries.map((value) =>
      typeof value === "number" ? convertPressureIfNeeded(value) : value,
    );
  }, [
    liveLogger.enabled,
    data,
    liveSeries,
    values.length,
    convertPressureIfNeeded,
  ]);
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
      const effectiveUnit = opt.displayUnit ?? unit;
      return {
        value: opt.value,
        label: effectiveUnit
          ? `${label} (${effectiveUnit === "mwc" ? "m" : effectiveUnit})`
          : label,
      };
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

        {liveLogger.enabled && (
          <Button
            variant="quiet"
            onClick={() => {
              // ✅ ONLY here we clear points (because user explicitly stopped)
              setLiveLogger((p: LiveLoggerConfig) => ({ ...p, enabled: false }));
              resetLiveSeries();
              rollingStartMsRef.current = null;
            }}
          >
            <span className="flex items-center gap-2 text-red-600">
              <span className="text-sm font-semibold">Stop Logger</span>
            </span>
          </Button>
        )}
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
                    setLiveLogger((p: LiveLoggerConfig) => ({ ...p, wsUrl: e.target.value }))
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
                      setLiveLogger((p: LiveLoggerConfig) => ({ ...p, deviceId: e.target.value }))
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
                      setLiveLogger((p: LiveLoggerConfig) => ({ ...p, field: e.target.value }))
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
                    setLiveLogger((p: LiveLoggerConfig) => ({
                      ...p,
                      timeMapping: e.target.value as LiveLoggerConfig["timeMapping"],
                    }))
                  }
                >
                  <option value="midnight">
                    Midnight-based (timestamp hour:minute chart 00:00..24:00)
                  </option>
                  <option value="rolling">Rolling (starts at Enable chart starts at 00:00)</option>
                </select>
              </label>

              <div className="text-xs text-gray-500">
                Midnight-based = map to local time-of-day. Rolling = map from the moment you enable.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="quiet"
                  onClick={() => {
                    // Treat Disable as Stop (clears points) per your request
                    setLiveLogger((p: LiveLoggerConfig) => ({ ...p, enabled: false }));
                    resetLiveSeries();
                    rollingStartMsRef.current = null;
                    setIsLiveModalOpen(false);
                  }}
                >
                  Disable
                </Button>

                <Button
                  onClick={() => {
                    // Do NOT clear points when enabling (keep history)
                    if (liveLogger.timeMapping === "rolling") {
                      rollingStartMsRef.current = Date.now();
                    }
                    ensureSeriesLength(values.length);
                    setLiveLogger((p: LiveLoggerConfig) => ({ ...p, enabled: true }));
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

export function useQuickGraph<T extends QuickGraphAssetType>(
  label: string,
  assetId: number,
  assetType: T,
) {
  const showQuickGraph = useShowQuickGraph();
  const [propertyByType] = useAtom(quickGraphPropertyAtom);
  const selectedProperty = normalizePressurePropertySelection(
    assetType,
    propertyByType[assetType],
  );

  const { data, mainData, isLoading } = useTimeSeries({
    assetId,
    assetType,
    property: toSeriesProperty(selectedProperty),
  });

  const footer = showQuickGraph ? (
    <QuickGraph
      nodeTitle={label}
      assetId={assetId}
      assetType={assetType}
      data={data}
      mainData={mainData}
      isLoading={isLoading}
    />
  ) : undefined;

  return { footer };
}
