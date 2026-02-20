import { useMemo, useCallback, useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import {
  Asset,
  Junction,
  Pipe,
  Pump,
  Reservoir,
  Tank,
  NodeAsset,
  HydraulicModel,
} from "src/hydraulic-model";
import {
  CustomerPoint,
  getActiveCustomerPoints,
} from "src/hydraulic-model/customer-points";
import { Valve } from "src/hydraulic-model/asset-types";
import { LoggerPoint } from "src/hydraulic-model/asset-types/logger-point";
import {
  DemandPatterns,
  JunctionDemand,
  calculateAverageDemand,
} from "src/hydraulic-model/demands";
import { Quantities } from "src/model-metadata/quantities-spec";
import { useTranslate } from "src/hooks/use-translate";
import { usePersistence } from "src/lib/persistence";
import { useUserTracking } from "src/infra/user-tracking";
import { stagingModelAtom } from "src/state/jotai";
import {
  changePumpDefinition,
  changeProperty,
  changeJunctionDemands,
  changeLabel,
} from "src/hydraulic-model/model-operations";
import { activateAssets } from "src/hydraulic-model/model-operations/activate-assets";
import { deactivateAssets } from "src/hydraulic-model/model-operations/deactivate-assets";
import { getLinkNodes } from "src/hydraulic-model/assets-map";
import {
  HeadlossFormula,
  PipeStatus,
  pipeStatuses,
} from "src/hydraulic-model/asset-types/pipe";
import { PumpStatus, pumpStatuses } from "src/hydraulic-model/asset-types/pump";
import {
  ValveKind,
  ValveStatus,
  valveKinds,
} from "src/hydraulic-model/asset-types/valve";
import {
  AssetEditorContent,
  QuantityRow,
  SelectRow,
  TextRow,
  SwitchRow,
  ConnectedCustomersRow,
} from "./ui-components";
import { Section } from "src/components/form/fields";
import { PumpDefinitionDetails } from "./pump-definition-details";
import { useQuickGraph } from "./quick-graph";
import { QuickGraphChart } from "./quick-graph/quick-graph-chart";
import { useMultipleJunctionTimeSeries } from "./quick-graph/use-time-series";
import { useAssetComparison } from "src/hooks/use-asset-comparison";
import { useSimulation } from "src/hooks/use-simulation";
import type {
  PipeSimulation,
  PumpSimulation,
  ValveSimulation,
} from "src/simulation/results-reader";
import { DemandsEditor } from "./demands-editor";
import { useFeatureFlag } from "src/hooks/use-feature-flags";
import { Unit, convertTo } from "src/quantity";
import {
  PumpDefinitionData,
  PumpDefinitionDetailsWithAllCurves,
} from "./pump-definition-details-all-curves";
import { colors } from "src/lib/constants";

type OnPropertyChange = (
  name: string,
  value: number | boolean,
  oldValue: number | boolean | null,
) => void;
type OnStatusChange<T> = (newStatus: T, oldStatus: T) => void;
type OnTypeChange<T> = (newType: T, oldType: T) => void;

const toPressureInUnit = (
  value: number | null,
  sourceUnit: Unit,
  targetUnit: Unit,
): number | null => {
  if (value === null) return null;
  if (sourceUnit === null || targetUnit === null || sourceUnit === targetUnit) {
    return value;
  }
  return convertTo({ value, unit: sourceUnit }, targetUnit);
};

const toElevationInPsi = (
  value: number | null,
  sourceUnit: Unit,
): number | null => {
  if (value === null) return null;
  if (sourceUnit === "m") return value * 1.42233433;
  if (sourceUnit === "ft") return value * 0.4333;
  if (sourceUnit === "psi") return value;
  return value;
};

const pipeStatusLabel = (sim: Pick<PipeSimulation, "status"> | null) => {
  if (!sim) return "notAvailable";
  return "pipe." + sim.status;
};

const pumpStatusLabel = (
  sim: {
    status: PumpSimulation["status"] | null;
    statusWarning: PumpSimulation["statusWarning"];
  } | null,
) => {
  if (!sim || sim.status === null) return "notAvailable";
  if (sim.statusWarning) {
    return `pump.${sim.status}.${sim.statusWarning}`;
  }
  return "pump." + sim.status;
};

export const valveStatusLabel = (
  sim: {
    status: ValveSimulation["status"] | null;
    statusWarning: ValveSimulation["statusWarning"];
  } | null,
) => {
  if (!sim || sim.status === null) return "notAvailable";
  if (sim.statusWarning) {
    return `valve.${sim.status}.${sim.statusWarning}`;
  }
  return "valve." + sim.status;
};

export function AssetPanel({
  asset,
  quantitiesMetadata,
  readonly = false,
}: {
  asset: Asset;
  quantitiesMetadata: Quantities;
  readonly?: boolean;
}) {
  const hydraulicModel = useAtomValue(stagingModelAtom);
  const rep = usePersistence();
  const transact = rep.useTransact();
  const userTracking = useUserTracking();
  const translate = useTranslate();

  const handlePropertyChange = useCallback(
    (
      property: string,
      value: number | boolean,
      oldValue: number | boolean | null,
    ) => {
      const moment = changeProperty(hydraulicModel, {
        assetIds: [asset.id],
        property,
        value,
      });
      transact(moment);
      userTracking.capture({
        name: "assetProperty.edited",
        type: asset.type,
        property,
        newValue: typeof value === "boolean" ? Number(value) : value,
        oldValue: typeof oldValue === "boolean" ? Number(oldValue) : oldValue,
      });
    },
    [hydraulicModel, asset.id, asset.type, transact, userTracking],
  );

  const handleActiveTopologyStatusChange = useCallback(
    (property: string, newValue: boolean, oldValue: boolean) => {
      const moment = newValue
        ? activateAssets(hydraulicModel, { assetIds: [asset.id] })
        : deactivateAssets(hydraulicModel, { assetIds: [asset.id] });
      transact(moment);
      userTracking.capture({
        name: "assetProperty.edited",
        type: asset.type,
        property: "isActive",
        newValue: Number(newValue),
        oldValue: Number(oldValue),
      });
    },
    [hydraulicModel, asset.id, asset.type, transact, userTracking],
  );

  const handleValveKindChange = useCallback(
    (newType: ValveKind, oldType: ValveKind) => {
      const moment = changeProperty(hydraulicModel, {
        assetIds: [asset.id],
        property: "kind",
        value: newType,
      });
      transact(moment);
      userTracking.capture({
        name: "assetDefinitionType.edited",
        type: asset.type,
        property: "kind",
        newType: newType,
        oldType: oldType,
      });
    },
    [hydraulicModel, asset.id, asset.type, transact, userTracking],
  );

  const handleStatusChange = useCallback(
    <T extends PumpStatus | ValveStatus | PipeStatus>(
      newStatus: T,
      oldStatus: T,
    ) => {
      const moment = changeProperty(hydraulicModel, {
        assetIds: [asset.id],
        property: "initialStatus",
        value: newStatus,
      });
      transact(moment);
      userTracking.capture({
        name: "assetStatus.edited",
        type: asset.type,
        property: "initialStatus",
        newStatus,
        oldStatus,
      });
    },
    [hydraulicModel, asset.id, asset.type, transact, userTracking],
  );

  const handleChangePumpDefinition = useCallback(
    (data: PumpDefinitionData) => {
      const moment = changePumpDefinition(hydraulicModel, {
        pumpId: asset.id,
        data,
      });
      transact(moment);
      userTracking.capture({
        name: "assetDefinitionType.edited",
        type: asset.type,
        property: "definitionType",
        newType: data.type,
      });
    },
    [asset.id, asset.type, hydraulicModel, transact, userTracking],
  );

  const handleDemandsChange = useCallback(
    (newDemands: JunctionDemand[]) => {
      const oldDemands = (asset as Junction).demands;
      const moment = changeJunctionDemands(hydraulicModel, {
        junctionId: asset.id,
        demands: newDemands,
      });
      transact(moment);
      userTracking.capture({
        name: "assetProperty.edited",
        type: asset.type,
        property: "demands",
        newValue: newDemands.length,
        oldValue: oldDemands.length,
      });
    },
    [asset, hydraulicModel, transact, userTracking],
  );

  const handleLabelChange = useCallback(
    (newLabel: string): string | undefined => {
      const oldLabel = asset.label;
      if (newLabel === oldLabel) return undefined;

      const isAvailable = hydraulicModel.labelManager.isLabelAvailable(
        newLabel,
        asset.type,
        asset.id,
      );
      if (!isAvailable) {
        return translate("labelDuplicate");
      }

      const moment = changeLabel(hydraulicModel, {
        assetId: asset.id,
        newLabel,
      });
      transact(moment);
      userTracking.capture({
        name: "assetProperty.edited",
        type: asset.type,
        property: "label",
        newValue: newLabel,
        oldValue: oldLabel,
      });
      return undefined;
    },
    [
      asset.id,
      asset.label,
      asset.type,
      hydraulicModel,
      transact,
      translate,
      userTracking,
    ],
  );

  switch (asset.type) {
    case "junction":
      return (
        <JunctionEditor
          junction={asset as Junction}
          quantitiesMetadata={quantitiesMetadata}
          onPropertyChange={handlePropertyChange}
          onDemandsChange={handleDemandsChange}
          onLabelChange={handleLabelChange}
          hydraulicModel={hydraulicModel}
          readonly={readonly}
        />
      );
    case "pipe": {
      const pipe = asset as Pipe;
      return (
        <PipeEditor
          pipe={pipe}
          {...getLinkNodes(hydraulicModel.assets, pipe)}
          headlossFormula={hydraulicModel.headlossFormula}
          quantitiesMetadata={quantitiesMetadata}
          onPropertyChange={handlePropertyChange}
          onStatusChange={handleStatusChange}
          onActiveTopologyStatusChange={handleActiveTopologyStatusChange}
          onLabelChange={handleLabelChange}
          hydraulicModel={hydraulicModel}
          readonly={readonly}
        />
      );
    }
    case "pump": {
      const pump = asset as Pump;
      return (
        <PumpEditor
          pump={pump}
          hydraulicModel={hydraulicModel}
          onPropertyChange={handlePropertyChange}
          onStatusChange={handleStatusChange}
          onActiveTopologyStatusChange={handleActiveTopologyStatusChange}
          onDefinitionChange={handleChangePumpDefinition}
          onLabelChange={handleLabelChange}
          quantitiesMetadata={quantitiesMetadata}
          {...getLinkNodes(hydraulicModel.assets, pump)}
          readonly={readonly}
        />
      );
    }
    case "valve": {
      const valve = asset as Valve;
      return (
        <ValveEditor
          valve={valve}
          onPropertyChange={handlePropertyChange}
          quantitiesMetadata={quantitiesMetadata}
          onStatusChange={handleStatusChange}
          onTypeChange={handleValveKindChange}
          onActiveTopologyStatusChange={handleActiveTopologyStatusChange}
          onLabelChange={handleLabelChange}
          {...getLinkNodes(hydraulicModel.assets, valve)}
          readonly={readonly}
        />
      );
    }
    case "reservoir":
      return (
        <ReservoirEditor
          reservoir={asset as Reservoir}
          quantitiesMetadata={quantitiesMetadata}
          onPropertyChange={handlePropertyChange}
          onLabelChange={handleLabelChange}
          readonly={readonly}
        />
      );
    case "tank":
      return (
        <TankEditor
          tank={asset as Tank}
          quantitiesMetadata={quantitiesMetadata}
          onPropertyChange={handlePropertyChange}
          onLabelChange={handleLabelChange}
          readonly={readonly}
        />
      );
    case "loggerPoint":
      return (
        <LoggerPointEditor
          loggerPoint={asset as LoggerPoint}
          hydraulicModel={hydraulicModel}
          quantitiesMetadata={quantitiesMetadata}
          onPropertyChange={handlePropertyChange}
          onLabelChange={handleLabelChange}
          readonly={readonly}
        />
      );
  }
}

const JunctionEditor = ({
  junction,
  quantitiesMetadata,
  onPropertyChange,
  onDemandsChange,
  onLabelChange,
  hydraulicModel,
  readonly = false,
}: {
  junction: Junction;
  quantitiesMetadata: Quantities;
  onPropertyChange: OnPropertyChange;
  onDemandsChange: (newDemands: JunctionDemand[]) => void;
  onLabelChange: (newLabel: string) => string | undefined;
  hydraulicModel: HydraulicModel;
  readonly?: boolean;
}) => {
  const translate = useTranslate();
  const { footer } = useQuickGraph(junction.label, junction.id, "junction");
  const { getComparison, getDirectDemandComparison, isNew } =
    useAssetComparison(junction);
  const simulation = useSimulation();
  const junctionSimulation = simulation?.getJunction(junction.id);

  const simPressure = junctionSimulation?.pressure ?? null;
  const elevationPsi = toElevationInPsi(
    junction.elevation,
    quantitiesMetadata.getUnit("elevation"),
  );
  const pressureUnit = quantitiesMetadata.getUnit("pressure");
  const pressureInMeters = toPressureInUnit(simPressure, pressureUnit, "mwc");
  const pressureInPsi = toPressureInUnit(simPressure, pressureUnit, "psi");
  const simHead = junctionSimulation?.head ?? null;
  const simDemand = junctionSimulation?.demand ?? null;

  const customerPoints = useMemo(() => {
    return getActiveCustomerPoints(
      hydraulicModel.customerPointsLookup,
      hydraulicModel.assets,
      junction.id,
    );
  }, [junction.id, hydraulicModel]);

  const customerCount = customerPoints.length;
  const totalDemand = useMemo(() => {
    return customerPoints.reduce(
      (sum, cp) =>
        sum +
        calculateAverageDemand(cp.demands, hydraulicModel.demands.patterns),
      0,
    );
  }, [customerPoints, hydraulicModel.demands.patterns]);

  const customerDemandPattern = useMemo(
    () =>
      getCustomerPointsPattern(customerPoints, hydraulicModel.demands.patterns),
    [customerPoints, hydraulicModel.demands.patterns],
  );

  return (
    <AssetEditorContent
      label={junction.label}
      type={translate("junction")}
      isNew={isNew}
      onLabelChange={onLabelChange}
      footer={footer}
      readOnly={readonly}
      key={junction.id}
    >
      <Section title={translate("activeTopology")}>
        <SwitchRow
          name="isActive"
          label={translate("isEnabled")}
          enabled={junction.isActive}
          comparison={getComparison("isActive", junction.isActive)}
          readOnly={readonly}
        />
      </Section>
      <Section title={translate("modelAttributes")}>
        <QuantityRow
          name="elevation"
          value={junction.elevation}
          unit={quantitiesMetadata.getUnit("elevation")}
          decimals={quantitiesMetadata.getDecimals("elevation")}
          comparison={getComparison("elevation", junction.elevation)}
          onChange={onPropertyChange}
          readOnly={readonly}
        />
        <QuantityRow
          name="elevation"
          value={elevationPsi}
          unit="psi"
          decimals={quantitiesMetadata.getDecimals("elevation")}
          readOnly={true}
        />
      </Section>
      <Section title={translate("demands")}>
        <DemandsEditor
          demands={junction.demands}
          patterns={hydraulicModel.demands.patterns}
          quantitiesMetadata={quantitiesMetadata}
          name="directDemand"
          onChange={onDemandsChange}
          demandComparator={getDirectDemandComparison}
          readOnly={readonly}
        />
        {customerCount > 0 && (
          <>
            <QuantityRow
              name="customerDemand"
              value={totalDemand}
              unit={quantitiesMetadata.getUnit("baseDemand")}
              decimals={quantitiesMetadata.getDecimals("baseDemand")}
              readOnly={true}
            />
            {!!customerDemandPattern && (
              <SelectRow
                name="customerPattern"
                selected={customerDemandPattern.value}
                options={[customerDemandPattern]}
                readOnly={true}
              />
            )}
            <ConnectedCustomersRow
              customerCount={customerCount}
              customerPoints={customerPoints}
              aggregateUnit={quantitiesMetadata.getUnit("customerDemand")}
              customerUnit={quantitiesMetadata.getUnit("customerDemandPerDay")}
              patterns={hydraulicModel.demands.patterns}
            />
          </>
        )}
      </Section>
      <Section title={translate("simulationResults")}>
        <QuantityRow
          name="pressure"
          value={pressureInMeters}
          unit="mwc"
          decimals={quantitiesMetadata.getDecimals("pressure")}
          readOnly={true}
        />
        <QuantityRow
          name="pressure"
          value={pressureInPsi}
          unit="psi"
          decimals={quantitiesMetadata.getDecimals("pressure")}
          readOnly={true}
        />
        <QuantityRow
          name="head"
          value={simHead}
          unit={quantitiesMetadata.getUnit("head")}
          decimals={quantitiesMetadata.getDecimals("head")}
          readOnly={true}
        />
        <QuantityRow
          name="actualDemand"
          value={simDemand}
          unit={quantitiesMetadata.getUnit("actualDemand")}
          decimals={quantitiesMetadata.getDecimals("actualDemand")}
          readOnly={true}
        />
      </Section>
    </AssetEditorContent>
  );
};

const PipeEditor = ({
  pipe,
  startNode,
  endNode,
  headlossFormula,
  quantitiesMetadata,
  onPropertyChange,
  onStatusChange,
  onActiveTopologyStatusChange,
  onLabelChange,
  hydraulicModel,
  readonly = false,
}: {
  pipe: Pipe;
  startNode: NodeAsset | null;
  endNode: NodeAsset | null;
  headlossFormula: HeadlossFormula;
  quantitiesMetadata: Quantities;
  onPropertyChange: OnPropertyChange;
  onStatusChange: OnStatusChange<PipeStatus>;
  onActiveTopologyStatusChange: (
    property: string,
    newValue: boolean,
    oldValue: boolean,
  ) => void;
  onLabelChange: (newLabel: string) => string | undefined;
  hydraulicModel: HydraulicModel;
  readonly?: boolean;
}) => {
  const translate = useTranslate();
  const { footer } = useQuickGraph(pipe.label, pipe.id, "pipe");
  const { getComparison, isNew } = useAssetComparison(pipe);
  const simulation = useSimulation();
  const pipeSimulation = simulation?.getPipe(pipe.id);

  const simFlow = pipeSimulation?.flow ?? null;
  const simVelocity = pipeSimulation?.velocity ?? null;
  const simUnitHeadloss = pipeSimulation?.unitHeadloss ?? null;
  const simHeadloss = pipeSimulation?.headloss ?? null;
  const simulationStatusText = translate(
    pipeStatusLabel(pipeSimulation ?? null),
  );

  const customerPoints = useMemo(() => {
    const connectedCustomerPoints =
      hydraulicModel.customerPointsLookup.getCustomerPoints(pipe.id);
    return Array.from(connectedCustomerPoints);
  }, [pipe.id, hydraulicModel]);

  const customerCount = customerPoints.length;
  const totalDemand = useMemo(() => {
    return customerPoints.reduce(
      (sum, cp) =>
        sum +
        calculateAverageDemand(cp.demands, hydraulicModel.demands.patterns),
      0,
    );
  }, [customerPoints, hydraulicModel.demands.patterns]);

  const customerDemandPattern = useMemo(
    () =>
      getCustomerPointsPattern(customerPoints, hydraulicModel.demands.patterns),
    [customerPoints, hydraulicModel.demands.patterns],
  );

  const pipeStatusOptions = useMemo(() => {
    return pipeStatuses.map((status) => ({
      label: translate(`pipe.${status}`),
      value: status,
    }));
  }, [translate]);

  const handleStatusChange = (
    name: string,
    newValue: PipeStatus,
    oldValue: PipeStatus,
  ) => {
    onStatusChange(newValue, oldValue);
  };

  return (
    <AssetEditorContent
      label={pipe.label}
      type={translate("pipe")}
      isNew={isNew}
      onLabelChange={onLabelChange}
      footer={footer}
      readOnly={readonly}
      key={pipe.id}
    >
      <Section title={translate("connections")}>
        <TextRow name="startNode" value={startNode ? startNode.label : ""} />
        <TextRow name="endNode" value={endNode ? endNode.label : ""} />
      </Section>
      <Section title={translate("activeTopology")}>
        <SwitchRow
          name="isActive"
          label={translate("isEnabled")}
          enabled={pipe.isActive}
          comparison={getComparison("isActive", pipe.isActive)}
          onChange={onActiveTopologyStatusChange}
          readOnly={readonly}
        />
      </Section>
      <Section title={translate("modelAttributes")}>
        <SelectRow
          name="initialStatus"
          selected={pipe.initialStatus}
          options={pipeStatusOptions}
          comparison={getComparison("initialStatus", pipe.initialStatus)}
          onChange={handleStatusChange}
          readOnly={readonly}
        />
        <QuantityRow
          name="diameter"
          value={pipe.diameter}
          positiveOnly={true}
          isNullable={false}
          unit={quantitiesMetadata.getUnit("diameter")}
          decimals={quantitiesMetadata.getDecimals("diameter")}
          comparison={getComparison("diameter", pipe.diameter)}
          onChange={onPropertyChange}
          readOnly={readonly}
        />
        <QuantityRow
          name="length"
          value={pipe.length}
          positiveOnly={true}
          isNullable={false}
          unit={quantitiesMetadata.getUnit("length")}
          decimals={quantitiesMetadata.getDecimals("length")}
          comparison={getComparison("length", pipe.length)}
          onChange={onPropertyChange}
          readOnly={readonly}
        />
        <QuantityRow
          name="roughness"
          value={pipe.roughness}
          positiveOnly={true}
          unit={quantitiesMetadata.getUnit("roughness")}
          decimals={quantitiesMetadata.getDecimals("roughness")}
          comparison={getComparison("roughness", pipe.roughness)}
          onChange={onPropertyChange}
          readOnly={readonly}
        />
        <QuantityRow
          name="minorLoss"
          value={pipe.minorLoss}
          positiveOnly={true}
          unit={quantitiesMetadata.getMinorLossUnit(headlossFormula)}
          decimals={quantitiesMetadata.getDecimals("minorLoss")}
          comparison={getComparison("minorLoss", pipe.minorLoss)}
          onChange={onPropertyChange}
          readOnly={readonly}
        />
      </Section>
      {customerCount > 0 && (
        <Section title={translate("demands")}>
          <QuantityRow
            name="customerDemand"
            value={totalDemand}
            unit={quantitiesMetadata.getUnit("baseDemand")}
            decimals={quantitiesMetadata.getDecimals("baseDemand")}
            readOnly={true}
          />
          {!!customerDemandPattern && (
            <SelectRow
              name="customerPattern"
              selected={customerDemandPattern.value}
              options={[customerDemandPattern]}
              readOnly={true}
            />
          )}
          <ConnectedCustomersRow
            customerCount={customerCount}
            customerPoints={customerPoints}
            aggregateUnit={quantitiesMetadata.getUnit("customerDemand")}
            customerUnit={quantitiesMetadata.getUnit("customerDemandPerDay")}
            patterns={hydraulicModel.demands.patterns}
          />
        </Section>
      )}
      <Section title={translate("simulationResults")}>
        <QuantityRow
          name="flow"
          value={simFlow}
          unit={quantitiesMetadata.getUnit("flow")}
          decimals={quantitiesMetadata.getDecimals("flow")}
          readOnly={true}
        />
        <QuantityRow
          name="velocity"
          value={simVelocity}
          unit={quantitiesMetadata.getUnit("velocity")}
          decimals={quantitiesMetadata.getDecimals("velocity")}
          readOnly={true}
        />
        <QuantityRow
          name="unitHeadloss"
          value={simUnitHeadloss}
          unit={quantitiesMetadata.getUnit("unitHeadloss")}
          decimals={quantitiesMetadata.getDecimals("unitHeadloss")}
          readOnly={true}
        />
        <QuantityRow
          name="headlossShort"
          value={simHeadloss}
          unit={quantitiesMetadata.getUnit("headloss")}
          decimals={quantitiesMetadata.getDecimals("headloss")}
          readOnly={true}
        />
        <TextRow name="actualStatus" value={simulationStatusText} />
      </Section>
    </AssetEditorContent>
  );
};

const ReservoirEditor = ({
  reservoir,
  quantitiesMetadata,
  onPropertyChange,
  onLabelChange,
  readonly = false,
}: {
  reservoir: Reservoir;
  quantitiesMetadata: Quantities;
  onPropertyChange: OnPropertyChange;
  onLabelChange: (newLabel: string) => string | undefined;
  readonly?: boolean;
}) => {
  const translate = useTranslate();
  const { footer } = useQuickGraph(reservoir.label, reservoir.id, "reservoir");
  const { getComparison, isNew } = useAssetComparison(reservoir);
  const elevationPsi = toElevationInPsi(
    reservoir.elevation,
    quantitiesMetadata.getUnit("elevation"),
  );

  return (
    <AssetEditorContent
      label={reservoir.label}
      type={translate("reservoir")}
      isNew={isNew}
      onLabelChange={onLabelChange}
      footer={footer}
      readOnly={readonly}
      key={reservoir.id}
    >
      <Section title={translate("activeTopology")}>
        <SwitchRow
          name="isActive"
          label={translate("isEnabled")}
          enabled={reservoir.isActive}
          comparison={getComparison("isActive", reservoir.isActive)}
          readOnly={readonly}
        />
      </Section>
      <Section title={translate("modelAttributes")}>
        <QuantityRow
          name="elevation"
          value={reservoir.elevation}
          unit={quantitiesMetadata.getUnit("elevation")}
          decimals={quantitiesMetadata.getDecimals("elevation")}
          comparison={getComparison("elevation", reservoir.elevation)}
          onChange={onPropertyChange}
          readOnly={readonly}
        />
        <QuantityRow
          name="elevation"
          value={elevationPsi}
          unit="psi"
          decimals={quantitiesMetadata.getDecimals("elevation")}
          readOnly={true}
        />
        <QuantityRow
          name="head"
          value={reservoir.head}
          unit={quantitiesMetadata.getUnit("head")}
          decimals={quantitiesMetadata.getDecimals("head")}
          comparison={getComparison("head", reservoir.head)}
          onChange={onPropertyChange}
          readOnly={readonly}
        />
      </Section>
    </AssetEditorContent>
  );
};

const TankEditor = ({
  tank,
  quantitiesMetadata,
  onPropertyChange,
  onLabelChange,
  readonly = false,
}: {
  tank: Tank;
  quantitiesMetadata: Quantities;
  onPropertyChange: OnPropertyChange;
  onLabelChange: (newLabel: string) => string | undefined;
  readonly?: boolean;
}) => {
  const translate = useTranslate();
  const { footer } = useQuickGraph(tank.label, tank.id, "tank");
  const { getComparison, isNew } = useAssetComparison(tank);
  const simulation = useSimulation();
  const tankSimulation = simulation?.getTank(tank.id);

  const simPressure = tankSimulation?.pressure ?? null;
  const elevationPsi = toElevationInPsi(
    tank.elevation,
    quantitiesMetadata.getUnit("elevation"),
  );
  const pressureUnit = quantitiesMetadata.getUnit("pressure");
  const pressureInMeters = toPressureInUnit(simPressure, pressureUnit, "mwc");
  const pressureInPsi = toPressureInUnit(simPressure, pressureUnit, "psi");
  const simHead = tankSimulation?.head ?? null;
  const simLevel = tankSimulation?.level ?? null;
  const simVolume = tankSimulation?.volume ?? null;

  return (
    <AssetEditorContent
      label={tank.label}
      type={translate("tank")}
      isNew={isNew}
      onLabelChange={onLabelChange}
      footer={footer}
      readOnly={readonly}
      key={tank.id}
    >
      <Section title={translate("activeTopology")}>
        <SwitchRow
          name="isActive"
          label={translate("isEnabled")}
          enabled={tank.isActive}
          comparison={getComparison("isActive", tank.isActive)}
          readOnly={readonly}
        />
      </Section>
      <Section title={translate("modelAttributes")}>
        <QuantityRow
          name="elevation"
          value={tank.elevation}
          unit={quantitiesMetadata.getUnit("elevation")}
          decimals={quantitiesMetadata.getDecimals("elevation")}
          comparison={getComparison("elevation", tank.elevation)}
          onChange={onPropertyChange}
          readOnly={readonly}
        />
        <QuantityRow
          name="elevation"
          value={elevationPsi}
          unit="psi"
          decimals={quantitiesMetadata.getDecimals("elevation")}
          readOnly={true}
        />
        <QuantityRow
          name="initialLevel"
          value={tank.initialLevel}
          unit={quantitiesMetadata.getUnit("initialLevel")}
          decimals={quantitiesMetadata.getDecimals("initialLevel")}
          comparison={getComparison("initialLevel", tank.initialLevel)}
          onChange={onPropertyChange}
          positiveOnly={true}
          readOnly={readonly}
        />
        <QuantityRow
          name="minLevel"
          value={tank.minLevel}
          unit={quantitiesMetadata.getUnit("minLevel")}
          decimals={quantitiesMetadata.getDecimals("minLevel")}
          comparison={getComparison("minLevel", tank.minLevel)}
          onChange={onPropertyChange}
          positiveOnly={true}
          readOnly={readonly}
        />
        <QuantityRow
          name="maxLevel"
          value={tank.maxLevel}
          unit={quantitiesMetadata.getUnit("maxLevel")}
          decimals={quantitiesMetadata.getDecimals("maxLevel")}
          comparison={getComparison("maxLevel", tank.maxLevel)}
          onChange={onPropertyChange}
          positiveOnly={true}
          readOnly={readonly}
        />
        <QuantityRow
          name="diameter"
          value={tank.diameter}
          unit={quantitiesMetadata.getUnit("tankDiameter")}
          decimals={quantitiesMetadata.getDecimals("diameter")}
          comparison={getComparison("diameter", tank.diameter)}
          onChange={onPropertyChange}
          positiveOnly={true}
          isNullable={false}
          readOnly={readonly}
        />
        <QuantityRow
          name="minVolume"
          value={tank.minVolume}
          unit={quantitiesMetadata.getUnit("minVolume")}
          decimals={quantitiesMetadata.getDecimals("minVolume")}
          comparison={getComparison("minVolume", tank.minVolume)}
          onChange={onPropertyChange}
          positiveOnly={true}
          readOnly={readonly}
        />
        <SwitchRow
          name="overflow"
          label={translate("canOverflow")}
          enabled={tank.overflow}
          comparison={getComparison("overflow", tank.overflow)}
          onChange={onPropertyChange}
          readOnly={readonly}
        />
      </Section>
      <Section title={translate("simulationResults")}>
        <QuantityRow
          name="pressure"
          value={pressureInMeters}
          unit="mwc"
          decimals={quantitiesMetadata.getDecimals("pressure")}
          readOnly={true}
        />
        <QuantityRow
          name="pressure"
          value={pressureInPsi}
          unit="psi"
          decimals={quantitiesMetadata.getDecimals("pressure")}
          readOnly={true}
        />
        <QuantityRow
          name="head"
          value={simHead}
          unit={quantitiesMetadata.getUnit("head")}
          decimals={quantitiesMetadata.getDecimals("head")}
          readOnly={true}
        />
        <QuantityRow
          name="level"
          value={simLevel}
          unit={quantitiesMetadata.getUnit("level")}
          decimals={quantitiesMetadata.getDecimals("level")}
          readOnly={true}
        />
        <QuantityRow
          name="volume"
          value={simVolume}
          unit={quantitiesMetadata.getUnit("volume")}
          decimals={quantitiesMetadata.getDecimals("volume")}
          readOnly={true}
        />
      </Section>
    </AssetEditorContent>
  );
};

const LoggerPointEditor = ({
  loggerPoint,
  hydraulicModel,
  quantitiesMetadata,
  onPropertyChange,
  onLabelChange,
  readonly = false,
}: {
  loggerPoint: LoggerPoint;
  hydraulicModel: HydraulicModel;
  quantitiesMetadata: Quantities;
  onPropertyChange: OnPropertyChange;
  onLabelChange: (newLabel: string) => string | undefined;
  readonly?: boolean;
}) => {
  const PSI_PER_METER = 1.42233433;
  const PSI_PER_KPA = 0.1450377377;
  const PSI_PER_BAR = 14.5037738;
  const PSI_PER_FOOT = 0.4333;
  const translate = useTranslate();
  const simulation = useSimulation();
  const { getComparison, isNew } = useAssetComparison(loggerPoint);
  const connectedJunctions = useMemo(
    () => getConnectedJunctionsForLogger(hydraulicModel, loggerPoint.id),
    [hydraulicModel, loggerPoint.id],
  );
  const primaryConnectedJunction = connectedJunctions[0] ?? null;
  const junctionSimulation = primaryConnectedJunction
    ? simulation?.getJunction(primaryConnectedJunction.id)
    : null;
  const { footer } = useQuickGraph(
    loggerPoint.label,
    primaryConnectedJunction?.id ?? loggerPoint.id,
    "junction",
  );
  const [wsUrl, setWsUrl] = useState("wss://logger-api.gscwd.app/stream");
  const [wsDeviceId, setWsDeviceId] = useState(loggerPoint.deviceId || "");
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [combineWithConnectedNode, setCombineWithConnectedNode] =
    useState(false);
  const [selectedConnectedJunctions, setSelectedConnectedJunctions] = useState<
    Record<number, boolean>
  >({});
  const [liveSeries, setLiveSeries] = useState<number[]>([]);
  const [liveSampleCount, setLiveSampleCount] = useState(0);
  const [liveData, setLiveData] = useState<{
    deviceId?: string;
    status?: string;
    timestamp?: string;
    pressure?: number;
    flow?: number;
    level?: number;
    temperature?: number;
    batteryV?: number;
    externalV?: number;
    gsmPct?: number;
  }>({});
  const wsRef = useRef<WebSocket | null>(null);
  const graphLength = 120;
  const loggerFieldsReadOnly = readonly || (liveEnabled && liveConnected);
  const connectedJunctionIds = useMemo(
    () => connectedJunctions.map((junction) => junction.id),
    [connectedJunctions],
  );
  const {
    dataByAssetId: connectedNodeSeriesByAssetId,
    isLoading: isConnectedNodeSeriesLoading,
  } = useMultipleJunctionTimeSeries({
    assetIds: connectedJunctionIds,
    property: "pressure",
    enabled: connectedJunctions.length > 0 && combineWithConnectedNode,
  });
  useEffect(() => {
    setSelectedConnectedJunctions((previous) => {
      const next: Record<number, boolean> = {};
      for (const junction of connectedJunctions) {
        next[junction.id] = previous[junction.id] ?? true;
      }
      return next;
    });
  }, [connectedJunctions]);
  const wsUrlWithDeviceId = useMemo(() => {
    const deviceId = wsDeviceId.trim();
    if (!deviceId) return wsUrl;
    try {
      const parsed = new URL(wsUrl);
      parsed.searchParams.set("deviceId", deviceId);
      return parsed.toString();
    } catch {
      const sep = wsUrl.includes("?") ? "&" : "?";
      return `${wsUrl}${sep}deviceId=${encodeURIComponent(deviceId)}`;
    }
  }, [wsDeviceId, wsUrl]);

  useEffect(() => {
    if (!liveEnabled) {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
      setLiveConnected(false);
      return;
    }

    try {
      const ws = new WebSocket(wsUrlWithDeviceId);
      wsRef.current = ws;
      setLiveError(null);

      ws.onopen = () => {
        setLiveConnected(true);
      };

      ws.onclose = () => {
        setLiveConnected(false);
      };

      ws.onerror = () => {
        setLiveConnected(false);
        setLiveError("Connection error");
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (wsDeviceId && msg?.deviceId !== wsDeviceId) return;

          const pressureValue =
            typeof msg?.pressure_psi === "number"
              ? msg.pressure_psi
              : typeof msg?.pressurePsi === "number"
                ? msg.pressurePsi
                : typeof msg?.pressure === "number"
                  ? msg.pressure * PSI_PER_METER
                  : typeof msg?.pressure_ft === "number"
                    ? msg.pressure_ft * PSI_PER_FOOT
                    : typeof msg?.pressure_bar === "number"
                      ? msg.pressure_bar * PSI_PER_BAR
                      : typeof msg?.pressure_kpa === "number"
                        ? msg.pressure_kpa * PSI_PER_KPA
                        : null;

          const flowValue =
            typeof msg?.flow === "number" ? msg.flow : undefined;
          const levelValue =
            typeof msg?.level === "number" ? msg.level : undefined;
          const temperatureValue =
            typeof msg?.temperature === "number"
              ? msg.temperature
              : typeof msg?.temp_or_status === "number"
                ? msg.temp_or_status
                : undefined;
          const batteryVValue =
            typeof msg?.batteryV === "number"
              ? msg.batteryV
              : typeof msg?.battery_v === "number"
                ? msg.battery_v
                : undefined;
          const externalVValue =
            typeof msg?.externalV === "number"
              ? msg.externalV
              : typeof msg?.external_v === "number"
                ? msg.external_v
                : undefined;
          const gsmPctValue =
            typeof msg?.gsmPct === "number"
              ? msg.gsmPct
              : typeof msg?.gsm_pct === "number"
                ? msg.gsm_pct
                : undefined;

          setLiveData((prev) => ({
            ...prev,
            deviceId:
              typeof msg?.deviceId === "string" ? msg.deviceId : prev.deviceId,
            status: typeof msg?.status === "string" ? msg.status : prev.status,
            timestamp:
              typeof msg?.timestamp === "string"
                ? msg.timestamp
                : prev.timestamp,
            pressure:
              typeof pressureValue === "number" ? pressureValue : prev.pressure,
            flow: typeof flowValue === "number" ? flowValue : prev.flow,
            level: typeof levelValue === "number" ? levelValue : prev.level,
            temperature:
              typeof temperatureValue === "number"
                ? temperatureValue
                : prev.temperature,
            batteryV:
              typeof batteryVValue === "number" ? batteryVValue : prev.batteryV,
            externalV:
              typeof externalVValue === "number"
                ? externalVValue
                : prev.externalV,
            gsmPct: typeof gsmPctValue === "number" ? gsmPctValue : prev.gsmPct,
          }));

          const value = pressureValue;
          if (typeof value !== "number" || !Number.isFinite(value)) return;

          setLiveSeries((prev) => {
            const next = [...prev, value];
            if (next.length > graphLength) next.shift();
            return next;
          });
          setLiveSampleCount((prev) => prev + 1);
        } catch {}
      };
    } catch {
      setLiveConnected(false);
      setLiveError("Invalid WebSocket URL");
    }

    return () => {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
      setLiveConnected(false);
    };
  }, [liveEnabled, wsDeviceId, wsUrlWithDeviceId]);

  const liveValues = useMemo(() => {
    const padded = Array(graphLength).fill(null) as (number | null)[];
    for (let i = 0; i < liveSeries.length && i < graphLength; i++) {
      padded[i] = liveSeries[i];
    }
    return padded;
  }, [liveSeries]);
  const liveCurrentIntervalIndex = Math.max(
    0,
    Math.min(liveSeries.length - 1, graphLength - 1),
  );

  const connectedNodeOverlaySeries = useMemo(() => {
    if (!combineWithConnectedNode || connectedJunctions.length === 0) {
      return null;
    }

    const windowStartSecond = Math.max(0, liveSampleCount - graphLength);
    const overlayColors = [
      colors.blue500,
      colors.cyan700,
      colors.indigo500,
      colors.purple500,
      colors.green800,
      colors.orange500,
    ];

    return connectedJunctions
      .filter((junction) => selectedConnectedJunctions[junction.id] !== false)
      .map((junction, index) => {
        const series = connectedNodeSeriesByAssetId[junction.id];
        if (!series) return null;

        const simulationValues = Array.from(series.values).map(
          (value): number => {
            const converted = toPressureInUnit(
              value,
              quantitiesMetadata.getUnit("pressure"),
              "psi",
            );
            return converted ?? Number.NaN;
          },
        );

        const simulationIntervalSeconds = Math.max(
          series.intervalSeconds || 1,
          1,
        );
        const resampled: (number | null)[] = Array(graphLength).fill(
          Number.NaN,
        );

        // Re-sample simulation series (often hourly) onto logger chart timeline (seconds).
        for (let secondIndex = 0; secondIndex < graphLength; secondIndex++) {
          const absoluteSecond = windowStartSecond + secondIndex;
          const simulationStepIndex = Math.floor(
            absoluteSecond / simulationIntervalSeconds,
          );
          if (simulationStepIndex < simulationValues.length) {
            resampled[secondIndex] = simulationValues[simulationStepIndex];
          }
        }

        return {
          label: `${junction.label} simulation`,
          values: resampled,
          color: overlayColors[index % overlayColors.length],
        };
      })
      .filter(
        (
          series,
        ): series is {
          label: string;
          values: (number | null)[];
          color: string;
        } => series !== null,
      );
  }, [
    combineWithConnectedNode,
    connectedJunctions,
    connectedNodeSeriesByAssetId,
    graphLength,
    liveSampleCount,
    quantitiesMetadata,
    selectedConnectedJunctions,
  ]);

  const loggerPressurePsi =
    liveData.pressure ??
    (typeof loggerPoint.pressure === "number"
      ? loggerPoint.pressure * PSI_PER_METER
      : loggerPoint.pressure);
  const loggerPressureM = toPressureInUnit(loggerPressurePsi, "psi", "mwc");
  const loggerElevationPsi = toElevationInPsi(
    loggerPoint.elevation,
    quantitiesMetadata.getUnit("elevation"),
  );
  const simulatedPressure = junctionSimulation?.pressure ?? null;
  const simulatedPressureM = toPressureInUnit(
    simulatedPressure,
    quantitiesMetadata.getUnit("pressure"),
    "mwc",
  );
  const simulatedPressurePsi = toPressureInUnit(
    simulatedPressure,
    quantitiesMetadata.getUnit("pressure"),
    "psi",
  );
  const simulatedHead = junctionSimulation?.head ?? null;
  const simulatedDemand = junctionSimulation?.demand ?? null;

  return (
    <AssetEditorContent
      label={loggerPoint.label}
      type="Logger Point"
      isNew={isNew}
      onLabelChange={onLabelChange}
      footer={primaryConnectedJunction ? footer : undefined}
      readOnly={loggerFieldsReadOnly}
      key={loggerPoint.id}
    >
      <Section title={translate("connections")}>
        <TextRow
          name="junction"
          value={
            connectedJunctions.length > 0
              ? connectedJunctions.map((junction) => junction.label).join(", ")
              : "Not connected"
          }
        />
      </Section>
      <Section title="Live Logger">
        <div className="px-2 py-2 text-sm">
          <div className="flex items-center gap-2 mb-2">
            <input
              className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              placeholder="wss://logger-api.gscwd.app/stream"
              disabled={readonly || liveConnected}
            />
          </div>
          <div className="flex items-center gap-2 mb-2">
            <input
              className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={wsDeviceId}
              onChange={(e) => setWsDeviceId(e.target.value)}
              placeholder="pi-sim-001"
              disabled={readonly || liveConnected}
            />
            <button
              className="rounded-md border border-gray-300 px-3 py-1 text-sm"
              disabled={readonly}
              onClick={() => {
                if (liveConnected) {
                  setLiveEnabled(false);
                  setLiveConnected(false);
                } else {
                  setLiveEnabled(true);
                }
              }}
            >
              {liveConnected ? "Disconnect" : "Connect"}
            </button>
          </div>
          <div className="mb-2 text-xs text-gray-500">{wsUrlWithDeviceId}</div>
          <div className="mb-2 text-xs text-gray-500">
            Status:{" "}
            {liveConnected
              ? "Connected"
              : liveEnabled
                ? "Connecting..."
                : "Disconnected"}
            {liveError ? ` (${liveError})` : ""}
          </div>
          <label className="mb-2 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={combineWithConnectedNode}
              onChange={(e) => setCombineWithConnectedNode(e.target.checked)}
              disabled={connectedJunctions.length === 0}
            />
            Combine graph with connected node simulation
          </label>
          {combineWithConnectedNode && connectedJunctions.length > 0 && (
            <div className="mb-2 grid grid-cols-2 gap-1 text-xs text-gray-600 dark:text-gray-300">
              {connectedJunctions.map((junction) => (
                <label key={junction.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedConnectedJunctions[junction.id] !== false}
                    onChange={(e) =>
                      setSelectedConnectedJunctions((prev) => ({
                        ...prev,
                        [junction.id]: e.target.checked,
                      }))
                    }
                  />
                  {junction.label}
                </label>
              ))}
            </div>
          )}
          {combineWithConnectedNode && isConnectedNodeSeriesLoading && (
            <div className="mb-2 text-xs text-gray-500">
              Loading connected node simulation series...
            </div>
          )}
          <div className="h-36">
            <QuickGraphChart
              values={Array(graphLength).fill(Number.NaN)}
              mainValues={null}
              mainLabel={null}
              intervalsCount={graphLength}
              intervalSeconds={1}
              decimals={quantitiesMetadata.getDecimals("pressure") ?? 0}
              currentIntervalIndex={liveCurrentIntervalIndex}
              onIntevalClick={() => {}}
              scenarioName={null}
              liveValues={liveValues}
              liveLabel="Live pressure"
              liveColor="rgb(239, 68, 68)"
              extraSeries={connectedNodeOverlaySeries}
            />
          </div>
        </div>
      </Section>
      <Section title={translate("activeTopology")}>
        <SwitchRow
          name="isActive"
          label={translate("isEnabled")}
          enabled={loggerPoint.isActive}
          comparison={getComparison("isActive", loggerPoint.isActive)}
          onChange={onPropertyChange}
          readOnly={loggerFieldsReadOnly}
        />
      </Section>
      <Section title={translate("modelAttributes")}>
        <QuantityRow
          name="elevation"
          value={loggerPoint.elevation}
          unit={quantitiesMetadata.getUnit("elevation")}
          decimals={quantitiesMetadata.getDecimals("elevation")}
          comparison={getComparison("elevation", loggerPoint.elevation)}
          onChange={onPropertyChange}
          readOnly={loggerFieldsReadOnly}
        />
        <QuantityRow
          name="elevation"
          value={loggerElevationPsi}
          unit="psi"
          decimals={quantitiesMetadata.getDecimals("elevation")}
          readOnly={true}
        />
        <TextRow
          name="deviceId"
          value={liveData.deviceId ?? loggerPoint.deviceId ?? ""}
        />
        <TextRow
          name="status"
          value={liveData.status ?? loggerPoint.status ?? ""}
        />
        <TextRow
          name="timestamp"
          value={liveData.timestamp ?? loggerPoint.timestamp ?? ""}
        />
        <QuantityRow
          name="pressure"
          value={loggerPressureM}
          unit="mwc"
          decimals={quantitiesMetadata.getDecimals("pressure")}
          onChange={onPropertyChange}
          readOnly={loggerFieldsReadOnly}
        />
        <QuantityRow
          name="pressure"
          value={loggerPressurePsi}
          unit="psi"
          decimals={quantitiesMetadata.getDecimals("pressure")}
          onChange={onPropertyChange}
          readOnly={loggerFieldsReadOnly}
        />
        <QuantityRow
          name="flow"
          value={liveData.flow ?? loggerPoint.flow}
          unit={quantitiesMetadata.getUnit("flow")}
          decimals={quantitiesMetadata.getDecimals("flow")}
          onChange={onPropertyChange}
          readOnly={loggerFieldsReadOnly}
        />
        <QuantityRow
          name="level"
          value={liveData.level ?? loggerPoint.level}
          unit={quantitiesMetadata.getUnit("level")}
          decimals={quantitiesMetadata.getDecimals("level")}
          onChange={onPropertyChange}
          readOnly={loggerFieldsReadOnly}
        />
        <TextRow
          name="temperature"
          value={`${liveData.temperature ?? loggerPoint.temperature ?? ""}`}
        />
        <TextRow
          name="batteryV"
          value={`${liveData.batteryV ?? loggerPoint.batteryV ?? ""}`}
        />
        <TextRow
          name="externalV"
          value={`${liveData.externalV ?? loggerPoint.externalV ?? ""}`}
        />
        <TextRow
          name="gsmPct"
          value={`${liveData.gsmPct ?? loggerPoint.gsmPct ?? ""}`}
        />
      </Section>
      {primaryConnectedJunction && (
        <Section title={translate("simulationResults")}>
          <QuantityRow
            name="pressure"
            value={simulatedPressureM}
            unit="mwc"
            decimals={quantitiesMetadata.getDecimals("pressure")}
            readOnly={true}
          />
          <QuantityRow
            name="pressure"
            value={simulatedPressurePsi}
            unit="psi"
            decimals={quantitiesMetadata.getDecimals("pressure")}
            readOnly={true}
          />
          <QuantityRow
            name="head"
            value={simulatedHead}
            unit={quantitiesMetadata.getUnit("head")}
            decimals={quantitiesMetadata.getDecimals("head")}
            readOnly={true}
          />
          <QuantityRow
            name="actualDemand"
            value={simulatedDemand}
            unit={quantitiesMetadata.getUnit("actualDemand")}
            decimals={quantitiesMetadata.getDecimals("actualDemand")}
            readOnly={true}
          />
        </Section>
      )}
    </AssetEditorContent>
  );
};

const ValveEditor = ({
  valve,
  startNode,
  endNode,
  quantitiesMetadata,
  onPropertyChange,
  onStatusChange,
  onTypeChange,
  onActiveTopologyStatusChange,
  onLabelChange,
  readonly = false,
}: {
  valve: Valve;
  startNode: NodeAsset | null;
  endNode: NodeAsset | null;
  quantitiesMetadata: Quantities;
  onStatusChange: OnStatusChange<ValveStatus>;
  onPropertyChange: OnPropertyChange;
  onTypeChange: OnTypeChange<ValveKind>;
  onActiveTopologyStatusChange: (
    property: string,
    newValue: boolean,
    oldValue: boolean,
  ) => void;
  onLabelChange: (newLabel: string) => string | undefined;
  readonly?: boolean;
}) => {
  const translate = useTranslate();
  const { footer } = useQuickGraph(valve.label, valve.id, "valve");
  const { getComparison, isNew } = useAssetComparison(valve);
  const simulation = useSimulation();
  const valveSimulation = simulation?.getValve(valve.id);

  const simFlow = valveSimulation?.flow ?? null;
  const simVelocity = valveSimulation?.velocity ?? null;
  const simHeadloss = valveSimulation?.headloss ?? null;
  const statusText = translate(valveStatusLabel(valveSimulation ?? null));

  const statusOptions = useMemo(() => {
    return [
      { label: translate("valve.active"), value: "active" },
      { label: translate("valve.open"), value: "open" },
      { label: translate("valve.closed"), value: "closed" },
    ] as { label: string; value: ValveStatus }[];
  }, [translate]);

  const kindOptions = useMemo(() => {
    return valveKinds.map((kind) => {
      return {
        label: kind.toUpperCase(),
        description: translate(`valve.${kind}.detailed`),
        value: kind,
      };
    });
  }, [translate]);

  const handleKindChange = (
    name: string,
    newValue: ValveKind,
    oldValue: ValveKind,
  ) => {
    onTypeChange(newValue, oldValue);
  };

  const handleStatusChange = (
    name: string,
    newValue: ValveStatus,
    oldValue: ValveStatus,
  ) => {
    onStatusChange(newValue, oldValue);
  };

  const getSettingUnit = () => {
    if (valve.kind === "tcv") return null;
    if (["psv", "prv", "pbv"].includes(valve.kind))
      return quantitiesMetadata.getUnit("pressure");
    if (valve.kind === "fcv") return quantitiesMetadata.getUnit("flow");
    return null;
  };

  return (
    <AssetEditorContent
      label={valve.label}
      type={translate("valve")}
      isNew={isNew}
      onLabelChange={onLabelChange}
      footer={footer}
      readOnly={readonly}
      key={valve.id}
    >
      <Section title={translate("connections")}>
        <TextRow name="startNode" value={startNode ? startNode.label : ""} />
        <TextRow name="endNode" value={endNode ? endNode.label : ""} />
      </Section>
      <Section title={translate("activeTopology")}>
        <SwitchRow
          name="isActive"
          label={translate("isEnabled")}
          enabled={valve.isActive}
          comparison={getComparison("isActive", valve.isActive)}
          onChange={onActiveTopologyStatusChange}
          readOnly={readonly}
        />
      </Section>
      <Section title={translate("modelAttributes")}>
        <SelectRow
          name="valveType"
          selected={valve.kind}
          options={kindOptions}
          comparison={getComparison("kind", valve.kind)}
          onChange={handleKindChange}
          readOnly={readonly}
        />
        <QuantityRow
          name="setting"
          value={valve.setting}
          unit={getSettingUnit()}
          comparison={getComparison("setting", valve.setting)}
          onChange={onPropertyChange}
          readOnly={readonly}
        />
        <SelectRow
          name="initialStatus"
          selected={valve.initialStatus}
          options={statusOptions}
          comparison={getComparison("initialStatus", valve.initialStatus)}
          onChange={handleStatusChange}
          readOnly={readonly}
        />
        <QuantityRow
          name="diameter"
          value={valve.diameter}
          positiveOnly={true}
          unit={quantitiesMetadata.getUnit("diameter")}
          decimals={quantitiesMetadata.getDecimals("diameter")}
          comparison={getComparison("diameter", valve.diameter)}
          onChange={onPropertyChange}
          readOnly={readonly}
        />
        <QuantityRow
          name="minorLoss"
          value={valve.minorLoss}
          positiveOnly={true}
          unit={quantitiesMetadata.getUnit("minorLoss")}
          decimals={quantitiesMetadata.getDecimals("minorLoss")}
          comparison={getComparison("minorLoss", valve.minorLoss)}
          onChange={onPropertyChange}
          readOnly={readonly}
        />
      </Section>
      <Section title={translate("simulationResults")}>
        <QuantityRow
          name="flow"
          value={simFlow}
          unit={quantitiesMetadata.getUnit("flow")}
          decimals={quantitiesMetadata.getDecimals("flow")}
          readOnly={true}
        />
        <QuantityRow
          name="velocity"
          value={simVelocity}
          unit={quantitiesMetadata.getUnit("velocity")}
          decimals={quantitiesMetadata.getDecimals("velocity")}
          readOnly={true}
        />
        <QuantityRow
          name="headlossShort"
          value={simHeadloss}
          unit={quantitiesMetadata.getUnit("headloss")}
          decimals={quantitiesMetadata.getDecimals("headloss")}
          readOnly={true}
        />
        <TextRow name="status" value={statusText} />
      </Section>
    </AssetEditorContent>
  );
};

const PumpEditor = ({
  pump,
  hydraulicModel,
  startNode,
  endNode,
  onStatusChange,
  onPropertyChange,
  onActiveTopologyStatusChange,
  onDefinitionChange,
  onLabelChange,
  quantitiesMetadata,
  readonly = false,
}: {
  pump: Pump;
  hydraulicModel: HydraulicModel;
  startNode: NodeAsset | null;
  endNode: NodeAsset | null;
  onPropertyChange: OnPropertyChange;
  onStatusChange: OnStatusChange<PumpStatus>;
  onActiveTopologyStatusChange: (
    property: string,
    newValue: boolean,
    oldValue: boolean,
  ) => void;
  onDefinitionChange: (data: PumpDefinitionData) => void;
  onLabelChange: (newLabel: string) => string | undefined;
  quantitiesMetadata: Quantities;
  readonly?: boolean;
}) => {
  const translate = useTranslate();
  const { footer } = useQuickGraph(pump.label, pump.id, "pump");
  const { getComparison, getPumpCurveComparison, isNew } =
    useAssetComparison(pump);
  const simulation = useSimulation();
  const pumpSimulation = simulation?.getPump(pump.id);

  const simFlow = pumpSimulation?.flow ?? null;
  const simHead = pumpSimulation ? -pumpSimulation.headloss : null;
  const statusText = translate(pumpStatusLabel(pumpSimulation ?? null));
  const isPumpCurvesEnabled = useFeatureFlag("FLAG_PUMP_CURVES");

  const statusOptions = useMemo(() => {
    return pumpStatuses.map((status) => ({
      label: translate(`pump.${status}`),
      value: status,
    }));
  }, [translate]);

  const handleStatusChange = (
    name: string,
    newValue: PumpStatus,
    oldValue: PumpStatus,
  ) => {
    onStatusChange(newValue, oldValue);
  };

  return (
    <AssetEditorContent
      label={pump.label}
      type={translate("pump")}
      isNew={isNew}
      onLabelChange={onLabelChange}
      footer={footer}
      readOnly={readonly}
      key={pump.id}
    >
      <Section title={translate("connections")}>
        <TextRow name="startNode" value={startNode ? startNode.label : ""} />
        <TextRow name="endNode" value={endNode ? endNode.label : ""} />
      </Section>
      <Section title={translate("activeTopology")}>
        <SwitchRow
          name="isActive"
          label={translate("isEnabled")}
          enabled={pump.isActive}
          comparison={getComparison("isActive", pump.isActive)}
          onChange={onActiveTopologyStatusChange}
          readOnly={readonly}
        />
      </Section>
      <Section title={translate("modelAttributes")}>
        {isPumpCurvesEnabled ? (
          <PumpDefinitionDetailsWithAllCurves
            pump={pump}
            curves={hydraulicModel.curves}
            quantities={quantitiesMetadata}
            onChange={onDefinitionChange}
            readonly={readonly}
            getComparison={getComparison}
            getPumpCurveComparison={getPumpCurveComparison}
          />
        ) : (
          <PumpDefinitionDetails
            pump={pump}
            quantities={quantitiesMetadata}
            onChange={onDefinitionChange}
            readonly={readonly}
            getComparison={getComparison}
          />
        )}
        <QuantityRow
          name="speed"
          value={pump.speed}
          unit={quantitiesMetadata.getUnit("speed")}
          decimals={quantitiesMetadata.getDecimals("speed")}
          comparison={getComparison("speed", pump.speed)}
          onChange={onPropertyChange}
          readOnly={readonly}
        />
        <SelectRow
          name="initialStatus"
          selected={pump.initialStatus}
          options={statusOptions}
          comparison={getComparison("initialStatus", pump.initialStatus)}
          onChange={handleStatusChange}
          readOnly={readonly}
        />
      </Section>
      <Section title={translate("simulationResults")}>
        <QuantityRow
          name="flow"
          value={simFlow}
          unit={quantitiesMetadata.getUnit("flow")}
          decimals={quantitiesMetadata.getDecimals("flow")}
          readOnly={true}
        />
        <QuantityRow
          name="pumpHead"
          value={simHead}
          unit={quantitiesMetadata.getUnit("headloss")}
          decimals={quantitiesMetadata.getDecimals("headloss")}
          readOnly={true}
        />
        <TextRow name="status" value={statusText} />
      </Section>
    </AssetEditorContent>
  );
};

function getCustomerPointsPattern(
  customerPoints: CustomerPoint[],
  patterns: DemandPatterns,
) {
  if (!customerPoints.length) return;
  const firstCustomerPointWithDemand = customerPoints.find(
    (customerPoint) => customerPoint.demands?.[0],
  );
  if (!firstCustomerPointWithDemand) return;
  const patternId = firstCustomerPointWithDemand.demands[0].patternId;
  if (!patternId) return;
  const pattern = patterns.get(patternId);
  if (!pattern) return;
  return {
    value: patternId,
    label: pattern.label,
  };
}

function getConnectedJunctionsForLogger(
  hydraulicModel: HydraulicModel,
  loggerPointId: number,
): Junction[] {
  const connected = new Map<number, Junction>();
  for (const asset of hydraulicModel.assets.values()) {
    if (!asset.isLink) continue;
    const [startNodeId, endNodeId] = asset.connections;
    if (startNodeId !== loggerPointId && endNodeId !== loggerPointId) continue;

    const otherNodeId = startNodeId === loggerPointId ? endNodeId : startNodeId;
    const otherNode = hydraulicModel.assets.get(otherNodeId);
    if (otherNode && otherNode.isNode && otherNode.type === "junction") {
      connected.set(otherNode.id, otherNode as Junction);
    }
  }
  return Array.from(connected.values());
}
