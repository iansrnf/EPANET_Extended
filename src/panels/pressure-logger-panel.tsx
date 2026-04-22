import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Maybe } from "purify-ts/Maybe";
import { WarningIcon, ZoomToIcon } from "src/icons";
import { BBox } from "src/types";
import { useZoomTo } from "src/hooks/use-zoom-to";
import { selectionAtom } from "src/state/selection";
import { projectSettingsAtom } from "src/state/project-settings";
import { simulationStepAtom } from "src/state/simulation";
import {
  simulationDerivedAtom,
  stagingModelDerivedAtom,
} from "src/state/derived-branch-state";
import { useTranslate } from "src/hooks/use-translate";
import { ActionButton } from "src/components/action-button";
import { SectionList } from "src/components/form/fields";
import { Checkbox } from "src/components/form/Checkbox";
import { SectionWrapper, TextRow } from "src/panels/asset-panel/ui-components";
import { loggerTelemetryAtom } from "src/state/logger-telemetry";
import type { StyledPointValue } from "src/components/graphs";
import { localizeDecimal } from "src/infra/i18n/numbers";
import { colors } from "src/lib/constants";
import { convertTo, type Unit } from "src/quantity";
import type {
  EPSResultsReader,
  TimeSeries,
} from "src/simulation/epanet/eps-results-reader";
import { captureError } from "src/infra/error-tracking";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import {
  alignSimulationValuesToLoggerPoints,
  buildPressureLoggerConnectionDebug,
  buildLoggerPressurePoints,
  getConnectedPressureLoggerNodes,
} from "./pressure-logger-panel-utils";
import type { ConnectedPressureLoggerNode } from "./pressure-logger-panel-utils";

export function PressureLoggerPanel() {
  const selection = useAtomValue(selectionAtom);
  const hydraulicModel = useAtomValue(stagingModelDerivedAtom);
  const projectSettings = useAtomValue(projectSettingsAtom);
  const loggerTelemetry = useAtomValue(loggerTelemetryAtom);
  const simulation = useAtomValue(simulationDerivedAtom);
  const simulationStep = useAtomValue(simulationStepAtom);
  const currentTimestepIndex =
    simulation.status === "success" || simulation.status === "warning"
      ? (simulationStep ?? 0)
      : null;
  const translate = useTranslate();
  const zoomTo = useZoomTo();

  const pressureLogger =
    selection.type === "singlePressureLogger"
      ? hydraulicModel.pressureLoggers.get(selection.id)
      : undefined;

  const coordinates = useMemo(() => {
    if (!pressureLogger) return null;
    const [lng, lat] = pressureLogger.coordinates;
    return {
      longitude: String(lng),
      latitude: String(lat),
    };
  }, [pressureLogger]);

  const liveTelemetry = useMemo(() => {
    if (!pressureLogger) return null;

    const reading = loggerTelemetry.readingsByDeviceId[pressureLogger.label];
    const pressureHistory =
      loggerTelemetry.pressureHistoryByDeviceId[pressureLogger.label] ?? [];
    const latestPressureSample = pressureHistory[pressureHistory.length - 1];
    const currentPressurePsi = reading?.psi ?? latestPressureSample?.psi;

    return {
      status: reading?.status ?? translate("notAvailable"),
      currentPressure:
        currentPressurePsi !== undefined
          ? `${currentPressurePsi.toFixed(2)} psi`
          : translate("notAvailable"),
      lastUpdated: reading?.timestamp ?? translate("notAvailable"),
      tempOrStatus: reading?.tempOrStatus ?? translate("notAvailable"),
      batteryVoltage: reading?.batteryVoltage ?? translate("notAvailable"),
      externalVoltage: reading?.externalVoltage ?? translate("notAvailable"),
      gsmPercent:
        reading?.gsmPercent !== undefined
          ? `${reading.gsmPercent}%`
          : translate("notAvailable"),
      raw: reading?.raw ?? translate("notAvailable"),
    };
  }, [
    loggerTelemetry.pressureHistoryByDeviceId,
    loggerTelemetry.readingsByDeviceId,
    pressureLogger,
    translate,
  ]);

  const livePressurePsi = useMemo(() => {
    if (!pressureLogger) return null;
    return (
      loggerTelemetry.readingsByDeviceId[pressureLogger.label]?.psi ??
      loggerTelemetry.pressureHistoryByDeviceId[pressureLogger.label]?.[
        loggerTelemetry.pressureHistoryByDeviceId[pressureLogger.label].length -
          1
      ]?.psi ??
      null
    );
  }, [
    loggerTelemetry.pressureHistoryByDeviceId,
    loggerTelemetry.readingsByDeviceId,
    pressureLogger,
  ]);

  const pressureHistory = useMemo(() => {
    if (!pressureLogger) return [];
    return (
      loggerTelemetry.pressureHistoryByDeviceId[pressureLogger.label] ?? []
    );
  }, [loggerTelemetry.pressureHistoryByDeviceId, pressureLogger]);

  const pressureHistoryPoints = useMemo<StyledPointValue[]>(() => {
    return buildLoggerPressurePoints(pressureHistory).map((point) => ({
      x: point.x,
      y: point.y,
      itemStyle: { color: colors.purple500 },
    }));
  }, [pressureHistory]);

  const connectedNodes = useMemo(() => {
    if (!pressureLogger) return [];
    return getConnectedPressureLoggerNodes(hydraulicModel, pressureLogger);
  }, [hydraulicModel, pressureLogger]);

  const connectionDebug = useMemo(() => {
    if (!pressureLogger) return null;
    return buildPressureLoggerConnectionDebug(hydraulicModel, pressureLogger);
  }, [hydraulicModel, pressureLogger]);

  const { simulationSeriesByNodeId, isLoadingSimulationSeries } =
    useConnectedNodeSimulationSeries(
      connectedNodes,
      projectSettings.units.pressure,
    );

  const [selectedConnectedNodeIds, setSelectedConnectedNodeIds] = useState<
    number[]
  >([]);

  useEffect(() => {
    const validNodeIds = new Set(connectedNodes.map((node) => node.id));
    const connectedNodeIds = connectedNodes.map((node) => node.id);
    setSelectedConnectedNodeIds((currentIds) => {
      const currentValidIds = currentIds.filter((nodeId) =>
        validNodeIds.has(nodeId),
      );
      const missingConnectedIds = connectedNodeIds.filter(
        (nodeId) => !currentValidIds.includes(nodeId),
      );

      return [...currentValidIds, ...missingConnectedIds];
    });
  }, [connectedNodes]);

  const selectedSimulationSeries = useMemo<PressureGraphSeries[]>(() => {
    const alignedSeries = selectedConnectedNodeIds
      .map((nodeId, index) => {
        const node = connectedNodes.find(
          (candidate) => candidate.id === nodeId,
        );
        const series = simulationSeriesByNodeId[nodeId];
        if (!node || !series) return null;

        const nextSeries: PressureGraphSeries = {
          name: node.label,
          color:
            CONNECTED_NODE_SERIES_COLORS[
              index % CONNECTED_NODE_SERIES_COLORS.length
            ],
          points: alignSimulationValuesToLoggerPoints(
            pressureHistoryPoints.map((point) => ({ x: point.x, y: point.y })),
            series.values,
            series.intervalSeconds,
          ),
          step: "end",
        };

        return nextSeries;
      })
      .filter((series): series is PressureGraphSeries => Boolean(series));

    return alignedSeries;
  }, [
    connectedNodes,
    pressureHistoryPoints,
    selectedConnectedNodeIds,
    simulationSeriesByNodeId,
  ]);

  const connectedSimulationComparisons = useMemo(() => {
    if (currentTimestepIndex === null || livePressurePsi === null) return [];

    return connectedNodes
      .map((node) => {
        const series = simulationSeriesByNodeId[node.id];
        if (!series) return null;

        const maxIndex = series.values.length - 1;
        if (maxIndex < 0) return null;

        const simulatedPressure =
          series.values[Math.min(currentTimestepIndex, maxIndex)] ?? null;
        if (simulatedPressure === null) return null;

        return {
          nodeId: node.id,
          nodeLabel: node.label,
          simulatedPressure,
          livePressure: livePressurePsi,
          delta: livePressurePsi - simulatedPressure,
        };
      })
      .filter(
        (
          comparison,
        ): comparison is {
          nodeId: number;
          nodeLabel: string;
          simulatedPressure: number;
          livePressure: number;
          delta: number;
        } => Boolean(comparison),
      );
  }, [
    connectedNodes,
    currentTimestepIndex,
    livePressurePsi,
    simulationSeriesByNodeId,
  ]);

  if (!pressureLogger || !coordinates) return null;

  return (
    <div className="flex flex-col flex-grow overflow-hidden">
      Test dawdawd
      <div className="px-3 pt-4 pb-3 relative">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold p-1 truncate">
            {pressureLogger.label}
          </span>
          <div className="flex gap-1 h-8 shrink-0">
            <ActionButton
              action={{
                icon: <ZoomToIcon />,
                applicable: true,
                label: translate("zoomTo"),
                onSelect: function doZoomTo() {
                  const [lng, lat] = pressureLogger.coordinates;
                  return Promise.resolve(
                    zoomTo(Maybe.of([lng, lat, lng, lat] as BBox)),
                  );
                },
              }}
            />
          </div>
        </div>
        <span className="text-sm text-gray-500 pl-1">
          {translate("pressureLogger")}
        </span>
      </div>
      <SectionList gap={3} padding={4} overflow={true}>
        {connectedSimulationComparisons.length > 0 && (
          <SectionWrapper
            title="Live vs connected simulation (psi)"
            section="simulationResults"
          >
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
              <div className="space-y-3 text-sm text-gray-700">
                {connectedSimulationComparisons.map((comparison) => {
                  const showWarning =
                    Math.abs(comparison.delta) >=
                    LIVE_SIMULATION_DELTA_WARNING_PSI;

                  return (
                    <div
                      key={comparison.nodeId}
                      className="last:pb-0 border-b last:border-b-0 border-sky-100 pb-3"
                    >
                      <div className="font-medium text-gray-800">
                        {comparison.nodeLabel} simulated:{" "}
                        {localizeDecimal(comparison.simulatedPressure, {
                          decimals: 3,
                        })}
                      </div>
                      <div className="mt-1">
                        {pressureLogger.label}:{" "}
                        {localizeDecimal(comparison.livePressure, {
                          decimals: 3,
                        })}
                      </div>
                      <div className="mt-1 inline-flex items-center gap-1 text-gray-800">
                        <span>
                          {pressureLogger.label} - {comparison.nodeLabel} ={" "}
                          {localizeDecimal(comparison.delta, {
                            decimals: 3,
                          })}
                        </span>
                        {showWarning && (
                          <WarningIcon
                            size="sm"
                            className="text-red-500 shrink-0"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </SectionWrapper>
        )}
        <SectionWrapper title="Pressure Graph" section="simulationResults">
          <div className="rounded border border-gray-200 bg-white p-3">
            {connectedNodes.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-x-3 gap-y-2">
                {connectedNodes.map((node) => {
                  const isChecked = selectedConnectedNodeIds.includes(node.id);
                  const hasSeries = Boolean(simulationSeriesByNodeId[node.id]);
                  const label = `Show simulated ${node.label}`;

                  return (
                    <label
                      key={node.id}
                      className="inline-flex items-center gap-2 text-xs text-gray-700"
                    >
                      <Checkbox
                        checked={isChecked}
                        aria-label={label}
                        disabled={!hasSeries}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelectedConnectedNodeIds((currentIds) =>
                            checked
                              ? currentIds.includes(node.id)
                                ? currentIds
                                : [...currentIds, node.id]
                              : currentIds.filter(
                                  (currentId) => currentId !== node.id,
                                ),
                          );
                        }}
                      />
                      <span>{node.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <div className="h-56">
              <PressureLoggerGraph
                loggerLabel={pressureLogger.label}
                loggerSeries={pressureHistoryPoints}
                simulationSeries={selectedSimulationSeries}
                isLoading={isLoadingSimulationSeries}
              />
            </div>
            <div className="mt-2 text-xs text-gray-500">
              {pressureHistoryPoints.length} logger points
            </div>
          </div>
        </SectionWrapper>
        {connectionDebug && (
          <SectionWrapper title="Logger Debug" section="modelAttributes">
            <details className="rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
              <summary className="cursor-pointer font-medium text-gray-800">
                Connection resolver
              </summary>
              <div className="mt-3 space-y-3">
                <DebugBlock
                  title="Logger"
                  rows={[
                    ["id", connectionDebug.logger.id],
                    ["label", connectionDebug.logger.label],
                    [
                      "coordinates",
                      formatDebugCoordinates(
                        connectionDebug.logger.coordinates,
                      ),
                    ],
                    [
                      "connection",
                      connectionDebug.logger.connectionJunctionId ?? "none",
                    ],
                  ]}
                />
                <DebugBlock
                  title="Resolved simulation nodes"
                  rows={
                    connectionDebug.connectedNodes.length > 0
                      ? connectionDebug.connectedNodes.map((node) => [
                          node.label,
                          `${node.assetType} #${node.id}`,
                        ])
                      : [["nodes", "none"]]
                  }
                />
                <DebugBlock
                  title="Anchor nodes"
                  rows={
                    connectionDebug.anchors.length > 0
                      ? connectionDebug.anchors.flatMap((anchor) => [
                          [
                            `${anchor.label || anchor.id}`,
                            `${anchor.type} #${anchor.id}`,
                          ],
                          ["reasons", anchor.reasons.join(", ")],
                          [
                            "coordinates",
                            formatDebugCoordinates(anchor.coordinates),
                          ],
                          ["visibility", String(anchor.visibility)],
                          ["pressureLoggerId", String(anchor.pressureLoggerId)],
                          [
                            "links",
                            anchor.connectedLinkIds.join(", ") || "none",
                          ],
                        ])
                      : [["anchors", "none"]]
                  }
                />
                <DebugBlock
                  title="Pipe endpoint matches"
                  rows={
                    connectionDebug.pipeMatches.length > 0
                      ? connectionDebug.pipeMatches.flatMap((pipe) => [
                          [pipe.label || `pipe ${pipe.id}`, `#${pipe.id}`],
                          [
                            "nodes",
                            `${pipe.startNodeLabel} #${pipe.startNodeId} -> ${pipe.endNodeLabel} #${pipe.endNodeId}`,
                          ],
                          [
                            "first vertex",
                            `${formatDebugCoordinates(pipe.firstVertex)} near=${pipe.firstVertexNearLogger}`,
                          ],
                          [
                            "last vertex",
                            `${formatDebugCoordinates(pipe.lastVertex)} near=${pipe.lastVertexNearLogger}`,
                          ],
                          [
                            "line distance",
                            pipe.lineDistanceMeters === null
                              ? "unknown"
                              : `${localizeDecimal(pipe.lineDistanceMeters, {
                                  decimals: 2,
                                })} m near=${pipe.lineNearLogger}`,
                          ],
                        ])
                      : [["pipes", "none"]]
                  }
                />
                <DebugBlock
                  title="Runtime gates"
                  rows={[
                    ["simulation status", simulation.status],
                    ["timestep index", currentTimestepIndex ?? "none"],
                    ["live pressure psi", livePressurePsi ?? "none"],
                    ["logger history points", pressureHistoryPoints.length],
                    ["connected nodes", connectedNodes.length],
                    [
                      "series loaded",
                      Object.keys(simulationSeriesByNodeId).join(", ") ||
                        "none",
                    ],
                    ["comparisons", connectedSimulationComparisons.length],
                  ]}
                />
              </div>
            </details>
          </SectionWrapper>
        )}
        <SectionWrapper title="Live Status" section="modelAttributes">
          <TextRow
            name="status"
            value={liveTelemetry?.status ?? translate("notAvailable")}
          />
          <TextRow
            name="pressure"
            value={liveTelemetry?.currentPressure ?? translate("notAvailable")}
          />
          <TextRow
            name="temp_or_status"
            value={liveTelemetry?.tempOrStatus ?? translate("notAvailable")}
          />
          <TextRow
            name="battery_v"
            value={liveTelemetry?.batteryVoltage ?? translate("notAvailable")}
          />
          <TextRow
            name="external_v"
            value={liveTelemetry?.externalVoltage ?? translate("notAvailable")}
          />
          <TextRow
            name="gsm_pct"
            value={liveTelemetry?.gsmPercent ?? translate("notAvailable")}
          />
          <TextRow
            name="raw"
            value={liveTelemetry?.raw ?? translate("notAvailable")}
          />
          <TextRow
            name="timestamp"
            value={liveTelemetry?.lastUpdated ?? translate("notAvailable")}
          />
        </SectionWrapper>
        <SectionWrapper
          title={translate("coordinates")}
          section="modelAttributes"
        >
          <TextRow name="longitude" value={coordinates.longitude} />
          <TextRow name="latitude" value={coordinates.latitude} />
        </SectionWrapper>
      </SectionList>
    </div>
  );
}

const DebugBlock = ({ title, rows }: { title: string; rows: unknown[][] }) => {
  return (
    <div>
      <div className="mb-1 font-medium text-gray-800">{title}</div>
      <div className="space-y-1">
        {rows.map(([name, value], index) => (
          <div
            key={`${title}-${String(name)}-${index}`}
            className="grid grid-cols-[92px_1fr] gap-2"
          >
            <span className="text-gray-500">{String(name)}</span>
            <span className="break-all font-mono text-gray-800">
              {String(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const formatDebugCoordinates = (coordinates: readonly number[]) =>
  coordinates
    .map((coordinate) => localizeDecimal(coordinate, { decimals: 6 }))
    .join(", ");

const formatGraphElapsedTime = (value: number) => {
  const totalSeconds = Math.max(0, Math.round(value));
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};

interface ConnectedNodeTimeSeries {
  values: Float32Array;
  intervalSeconds: number;
}

const CONNECTED_NODE_SERIES_COLORS = [
  colors.cyan700,
  colors.indigo500,
  colors.orange500,
  colors.green800,
  colors.amber500,
];

const LIVE_SIMULATION_DELTA_WARNING_PSI = 5;

const useConnectedNodeSimulationSeries = (
  connectedNodes: ConnectedPressureLoggerNode[],
  sourcePressureUnit: Unit,
) => {
  const simulation = useAtomValue(simulationDerivedAtom);
  const [simulationSeriesByNodeId, setSimulationSeriesByNodeId] = useState<
    Record<number, ConnectedNodeTimeSeries>
  >({});
  const [isLoadingSimulationSeries, setIsLoadingSimulationSeries] =
    useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const status = simulation.status;
  const epsResultsReader =
    "epsResultsReader" in simulation ? simulation.epsResultsReader : null;

  useEffect(() => {
    if (connectedNodes.length === 0) {
      setSimulationSeriesByNodeId({});
      setIsLoadingSimulationSeries(false);
      return;
    }

    if (status === "failure") {
      setSimulationSeriesByNodeId({});
      setIsLoadingSimulationSeries(false);
      return;
    }

    if ((status !== "success" && status !== "warning") || !epsResultsReader) {
      setSimulationSeriesByNodeId({});
      setIsLoadingSimulationSeries(false);
      return;
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    const fetchSimulationSeries = async () => {
      setIsLoadingSimulationSeries(true);

      try {
        const seriesEntries = await Promise.all(
          connectedNodes.map(async (node) => {
            const series = await getNodePressureTimeSeries(
              epsResultsReader,
              node,
            );
            if (!series) return null;

            return [
              node.id,
              {
                values: convertTimeSeriesToPsi(series, sourcePressureUnit),
                intervalSeconds: series.intervalSeconds,
              },
            ] as const;
          }),
        );

        if (abortControllerRef.current?.signal.aborted) return;

        setSimulationSeriesByNodeId(
          Object.fromEntries(
            seriesEntries.filter(
              (entry): entry is readonly [number, ConnectedNodeTimeSeries] =>
                Boolean(entry),
            ),
          ),
        );
      } catch (error) {
        if (abortControllerRef.current?.signal.aborted) return;
        captureError(error as Error);
        setSimulationSeriesByNodeId({});
      } finally {
        if (!abortControllerRef.current?.signal.aborted) {
          setIsLoadingSimulationSeries(false);
        }
      }
    };

    void fetchSimulationSeries();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [connectedNodes, epsResultsReader, sourcePressureUnit, status]);

  return { simulationSeriesByNodeId, isLoadingSimulationSeries };
};

const convertTimeSeriesToPsi = (
  series: TimeSeries,
  sourcePressureUnit: Unit,
): Float32Array => {
  if (sourcePressureUnit === "psi") return series.values;

  return Float32Array.from(series.values, (value) =>
    convertTo({ value, unit: sourcePressureUnit }, "psi"),
  );
};

const getNodePressureTimeSeries = (
  reader: EPSResultsReader,
  node: ConnectedPressureLoggerNode,
) => {
  switch (node.assetType) {
    case "junction":
      return reader.getTimeSeries(node.id, "junction", "pressure");
    case "tank":
      return reader.getTimeSeries(node.id, "tank", "pressure");
    case "reservoir":
      return reader.getTimeSeries(node.id, "reservoir", "pressure");
  }
};

interface PressureGraphSeries {
  name: string;
  color: string;
  points: { x: number; y: number }[];
  step?: "start" | "middle" | "end";
}

const PressureLoggerGraph = ({
  loggerLabel,
  loggerSeries,
  simulationSeries,
  isLoading,
}: {
  loggerLabel: string;
  loggerSeries: StyledPointValue[];
  simulationSeries: PressureGraphSeries[];
  isLoading: boolean;
}) => {
  const translate = useTranslate();
  const chartSeries = useMemo<PressureGraphSeries[]>(() => {
    const loggerData = loggerSeries.map((point) => ({
      x: point.x,
      y: point.y,
    }));

    return [
      {
        name: loggerLabel,
        color: colors.purple500,
        points: loggerData,
      },
      ...simulationSeries,
    ].filter((series) => series.points.length > 0);
  }, [loggerLabel, loggerSeries, simulationSeries]);

  const xValues = useMemo(
    () =>
      chartSeries.flatMap((series) => series.points.map((point) => point.x)),
    [chartSeries],
  );
  const option = useMemo<EChartsOption>(() => {
    return {
      animation: false,
      grid: {
        top: chartSeries.length > 1 ? 32 : 12,
        right: 12,
        bottom: 36,
        left: 48,
      },
      legend:
        chartSeries.length > 1
          ? {
              top: 0,
              right: 0,
              itemWidth: 16,
              itemHeight: 8,
              textStyle: {
                fontSize: 12,
                color: colors.gray600,
              },
            }
          : undefined,
      xAxis: {
        type: "value",
        min: xValues.length > 0 ? Math.min(...xValues) : 0,
        max: xValues.length > 0 ? Math.max(...xValues) : 1,
        name: "Time",
        nameLocation: "middle",
        nameGap: 24,
        nameTextStyle: {
          color: colors.gray500,
          fontSize: 14,
        },
        axisLine: { show: true, lineStyle: { color: colors.gray300 } },
        axisTick: { show: true, lineStyle: { color: colors.gray300 } },
        splitLine: {
          show: true,
          lineStyle: { color: colors.gray300, type: "dashed" },
        },
        axisLabel: {
          color: colors.gray500,
          fontSize: 12,
          formatter: (value: number) => formatGraphElapsedTime(value),
        },
      },
      yAxis: {
        type: "value",
        scale: true,
        name: "Pressure (psi)",
        nameLocation: "middle",
        nameGap: 40,
        nameTextStyle: {
          color: colors.gray500,
          fontSize: 14,
        },
        splitLine: {
          show: true,
          lineStyle: { color: colors.gray300, type: "dashed" },
        },
        axisLine: { show: true, lineStyle: { color: colors.gray300 } },
        axisTick: { show: true, lineStyle: { color: colors.gray300 } },
        axisLabel: {
          color: colors.gray500,
          fontSize: 12,
          formatter: (value: number) => localizeDecimal(value, { decimals: 2 }),
        },
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "white",
        borderColor: colors.gray300,
        textStyle: {
          color: colors.gray700,
          fontSize: 14,
        },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const timeLabel = formatGraphElapsedTime(params[0]?.axisValue ?? 0);
          const rows = params.map((param: any) => {
            const value = localizeDecimal(param.value?.[1] ?? 0, {
              decimals: 2,
            });
            const dot = `<span style="display:inline-block;width:8px;height:8px;background:${param.color};margin-right:4px;border-radius:50%;"></span>`;
            return `${dot}${param.seriesName}: ${value}`;
          });
          return `${timeLabel}<br/>${rows.join("<br/>")}`;
        },
      },
      series: chartSeries.map((series) => ({
        type: "line",
        name: series.name,
        data: series.points.map((point) => [point.x, point.y]),
        showSymbol: false,
        smooth: false,
        symbol: "none",
        step: series.step,
        lineStyle: {
          color: series.color,
          width: 2,
        },
        itemStyle: {
          color: series.color,
        },
      })),
    };
  }, [chartSeries, xValues]);

  if (chartSeries.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-xs">
        {translate("noDataAvailable")}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50">
          <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <ReactECharts
        option={option}
        style={{ height: "100%", width: "100%" }}
        opts={{ renderer: "svg" }}
        notMerge={true}
      />
    </div>
  );
};
