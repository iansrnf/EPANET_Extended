import { useAtomValue } from "jotai";
import { Tooltip } from "@epanet-js/ui-kit";
import { useTranslate } from "src/hooks/use-translate";
import {
  CircleIcon,
  ErrorIcon,
  OutdatedSimulationIcon,
  StopSimulationIcon,
  SuccessIcon,
  WarningIcon,
} from "src/icons";
import {
  simulationDerivedAtom,
  simulationSettingsDerivedAtom,
  stagingModelDerivedAtom,
} from "src/state/derived-branch-state";

export const SimulationStatusText = () => {
  const { Icon, colorClass, text } = useSimulationStatus();

  return (
    <span
      className={`inline-flex items-center gap-2 text-size-base ${colorClass}`}
    >
      <Icon aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
};

export const SimulationStatusBadge = () => {
  const { Icon, colorClass, text, shortText } = useSimulationStatus();

  return (
    <Tooltip
      content={text}
      side="top"
      sideOffset={8}
      zIndex={50}
      className="map-overlay-theme map-overlay-surface map-overlay-tooltip pointer-events-none"
    >
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        tabIndex={0}
        className={`inline-flex h-6 min-w-0 max-w-20 shrink-0 items-center gap-1 rounded-sm text-size-small font-medium focus-visible:outline-2 focus-visible:outline-accent ${colorClass}`}
      >
        <Icon size="sm" aria-hidden="true" />
        <span aria-hidden="true" className="truncate">
          {shortText}
        </span>
        <span className="sr-only">{text}</span>
      </span>
    </Tooltip>
  );
};

const useSimulationStatus = () => {
  const translate = useTranslate();
  const simulation = useAtomValue(simulationDerivedAtom);
  const hydraulicModel = useAtomValue(stagingModelDerivedAtom);
  const simulationSettings = useAtomValue(simulationSettingsDerivedAtom);
  const status =
    (simulation.status === "success" ||
      simulation.status === "failure" ||
      simulation.status === "warning") &&
    (hydraulicModel.version !== simulation.modelVersion ||
      simulationSettings.version !== simulation.settingsVersion)
      ? "outdated"
      : simulation.status;
  const definition = simulationStatusDefinitions[status];

  return {
    Icon: definition.Icon,
    colorClass: definition.colorClass,
    text: translate(definition.messageKey),
    shortText: translate(definition.shortMessageKey),
  };
};

const simulationStatusDefinitions = {
  idle: {
    Icon: CircleIcon,
    colorClass: "text-subtle",
    messageKey: "simulationReadyToRun",
    shortMessageKey: "simulationStatus.ready",
  },
  running: {
    Icon: CircleIcon,
    colorClass: "text-subtle",
    messageKey: "simulationRunning",
    shortMessageKey: "simulationStatus.running",
  },
  success: {
    Icon: SuccessIcon,
    colorClass: "text-success",
    messageKey: "simulationSuccess",
    shortMessageKey: "simulationStatus.success",
  },
  failure: {
    Icon: ErrorIcon,
    colorClass: "text-error",
    messageKey: "simulationFailure",
    shortMessageKey: "simulationStatus.failure",
  },
  warning: {
    Icon: WarningIcon,
    colorClass: "text-warning",
    messageKey: "simulationWarning",
    shortMessageKey: "simulationStatus.warning",
  },
  stopped: {
    Icon: StopSimulationIcon,
    colorClass: "text-info",
    messageKey: "simulationStopped",
    shortMessageKey: "simulationStatus.stopped",
  },
  outdated: {
    Icon: OutdatedSimulationIcon,
    colorClass: "text-warning",
    messageKey: "simulationOutdated",
    shortMessageKey: "simulationStatus.outdated",
  },
};
