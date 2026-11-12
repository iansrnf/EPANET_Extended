import { useEffect, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import type { EPSResultsReader, TimeSeries } from "@epanet-js/simulation";
import {
  buildLoggerPressureComparison,
  type LoggerPressureComparison,
} from "src/lib/logger-comparison";
import {
  readLoggerNodePressureSeries,
  type LoggerComparisonNodeType,
} from "src/lib/logger-comparison/reader";
import type { LoggerHistoryInterval } from "src/lib/logger-history";
import type { LoggerPressureSample } from "src/lib/logger-stream";
import {
  simulationDerivedAtom,
  simulationSettingsDerivedAtom,
  stagingModelDerivedAtom,
} from "src/state/derived-branch-state";
import { loggersAtom } from "src/state/loggers";

type LoadedPressureSeries = {
  reader: EPSResultsReader;
  assetId: number;
  assetType: LoggerComparisonNodeType;
  series: TimeSeries | null;
};

export function useLoggerPressureComparison(
  loggerId: string,
  history: readonly LoggerPressureSample[],
  interval?: LoggerHistoryInterval | null,
): LoggerPressureComparison {
  const loggers = useAtomValue(loggersAtom);
  const model = useAtomValue(stagingModelDerivedAtom);
  const settings = useAtomValue(simulationSettingsDerivedAtom);
  const simulation = useAtomValue(simulationDerivedAtom);
  const logger = loggers.find((item) => item.id === loggerId);
  const asset = logger?.connection
    ? model.assets.get(logger.connection.assetId)
    : undefined;
  const nodeType =
    asset?.type === "junction" ||
    asset?.type === "tank" ||
    asset?.type === "reservoir"
      ? asset.type
      : null;
  const nodeId = nodeType ? asset?.id : undefined;
  const isFinished =
    simulation.status === "success" || simulation.status === "warning";
  const isCurrent =
    "modelVersion" in simulation &&
    simulation.modelVersion === model.version &&
    simulation.settingsVersion === settings.version;
  const reader =
    isFinished && isCurrent && "epsResultsReader" in simulation
      ? simulation.epsResultsReader
      : undefined;
  const [loaded, setLoaded] = useState<LoadedPressureSeries | null>(null);

  useEffect(() => {
    if (!reader || nodeId === undefined || !nodeType) return;
    let isActive = true;
    void readLoggerNodePressureSeries(reader, nodeId, nodeType).then(
      (series) => {
        if (isActive)
          setLoaded({ reader, assetId: nodeId, assetType: nodeType, series });
      },
      () => {
        if (isActive)
          setLoaded({
            reader,
            assetId: nodeId,
            assetType: nodeType,
            series: null,
          });
      },
    );
    return () => {
      isActive = false;
    };
  }, [reader, nodeId, nodeType]);

  return useMemo<LoggerPressureComparison>(() => {
    const base = {
      samples: [],
      nodeLabel: asset?.label,
      loggerCount: history.length,
      simulationCount: 0,
      pairedCount: 0,
    };
    if (!logger?.connection || !asset)
      return { ...base, status: "notConnected" };
    if (!nodeType) return { ...base, status: "nodeRequired" };
    if (simulation.status === "running") return { ...base, status: "loading" };
    if (isFinished && !isCurrent) return { ...base, status: "staleSimulation" };
    if (!reader) return { ...base, status: "noSimulation" };
    if (
      !loaded ||
      loaded.reader !== reader ||
      loaded.assetId !== nodeId ||
      loaded.assetType !== nodeType
    )
      return { ...base, status: "loading" };
    if (!loaded.series) return { ...base, status: "error" };

    return buildLoggerPressureComparison(history, loaded.series, {
      pressureUnit:
        reader.pressureUnits === "m"
          ? "mwc"
          : reader.pressureUnits === "ft"
            ? "fwc"
            : reader.pressureUnits,
      nodeLabel: asset.label,
      durationSeconds: settings.timing.duration,
      samplingIntervalSeconds:
        interval === "minute" ? 60 : interval === "hourly" ? 3600 : undefined,
    });
  }, [
    asset,
    history,
    interval,
    isCurrent,
    isFinished,
    loaded,
    logger?.connection,
    nodeId,
    nodeType,
    reader,
    settings.timing.duration,
    simulation.status,
  ]);
}
