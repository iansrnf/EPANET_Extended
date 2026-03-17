import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { Maybe } from "purify-ts/Maybe";
import { ZoomToIcon } from "src/icons";
import { BBox } from "src/types";
import { useZoomTo } from "src/hooks/use-zoom-to";
import { selectionAtom } from "src/state/selection";
import { stagingModelAtom } from "src/state/hydraulic-model";
import { useTranslate } from "src/hooks/use-translate";
import { ActionButton } from "src/components/panels/asset-panel/actions/action-button";
import { SectionList } from "src/components/form/fields";
import {
  SectionWrapper,
  TextRow,
} from "src/components/panels/asset-panel/ui-components";
import { loggerTelemetryAtom } from "src/state/logger-telemetry";
import { LineGraph, StyledPointValue } from "src/components/graphs";
import { localizeDecimal } from "src/infra/i18n/numbers";
import { colors } from "src/lib/constants";

export function PressureLoggerPanel() {
  const selection = useAtomValue(selectionAtom);
  const hydraulicModel = useAtomValue(stagingModelAtom);
  const loggerTelemetry = useAtomValue(loggerTelemetryAtom);
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
    return {
      status: reading?.status ?? translate("notAvailable"),
      currentPressure: reading
        ? `${reading.psi.toFixed(2)} psi`
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
  }, [loggerTelemetry.readingsByDeviceId, pressureLogger, translate]);

  const pressureHistory = useMemo(() => {
    if (!pressureLogger) return [];
    return loggerTelemetry.pressureHistoryByDeviceId[pressureLogger.label] ?? [];
  }, [loggerTelemetry.pressureHistoryByDeviceId, pressureLogger]);

  const pressureHistoryPoints = useMemo<StyledPointValue[]>(() => {
    if (!pressureLogger || pressureHistory.length === 0) return [];

    const sampleCount =
      loggerTelemetry.pressureSampleCountByDeviceId[pressureLogger.label] ??
      pressureHistory.length;
    const startingMinute = Math.max(sampleCount - pressureHistory.length, 0);

    return pressureHistory.map((reading, index) => ({
      x: startingMinute + index,
      y: reading.psi,
      itemStyle: { color: colors.purple500 },
    }));
  }, [
    loggerTelemetry.pressureSampleCountByDeviceId,
    pressureHistory,
    pressureLogger,
  ]);

  if (!pressureLogger || !coordinates) return null;

  return (
    <div className="flex flex-col flex-grow overflow-hidden">
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
      <SectionList gap={3} padding={4}>
        <SectionWrapper title="Pressure Graph" section="simulationResults">
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="h-56">
              <LineGraph
                points={pressureHistoryPoints}
                linePoints={pressureHistoryPoints}
                showPoints={false}
                tooltipTrigger="axis"
                xAxisLabel="Time"
                yAxisLabel="Pressure (psi)"
                xAxisMin={0}
                xAxisValueFormatter={formatGraphMinute}
                yAxisValueFormatter={(value) =>
                  localizeDecimal(value, { decimals: 2 })
                }
              />
            </div>
            <div className="mt-2 text-xs text-gray-500">
              {pressureHistoryPoints.length} / 500 points
            </div>
          </div>
        </SectionWrapper>
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

const formatGraphMinute = (value: number) => {
  const totalMinutes = Math.max(0, Math.round(value));
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (totalMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
};
