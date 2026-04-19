import { SymbologySpec, LinkSymbology, NodeSymbology } from "src/map/symbology";
import { AssetsMap, Junction, Pipe, Pump } from "src/hydraulic-model";
import { Unit, convertTo } from "src/quantity";
import { Feature } from "src/types";
import { Asset, AssetId, Valve } from "src/hydraulic-model/asset-types";
import { colorFor } from "src/map/symbology/range-color-rule";
import { strokeColorFor } from "src/lib/color";
import { hexToArray } from "src/lib/color";
import { localizeDecimal } from "src/infra/i18n/numbers";
import {
  FormattingSpec,
  UnitsSpec,
  QuantityProperty,
  getDecimals,
} from "src/lib/project-settings/quantities-spec";
import {
  type ResultsReader,
  type PipeSimulation,
  type JunctionSimulation,
} from "src/simulation/results-reader";
import { isSimulationProperty } from "src/map/symbology/symbology-data-source";
import { assetLabelRule } from "src/map/symbology/labeling";
import { LabelRule } from "src/map/symbology/symbology-types";

export const buildFeatureId = (assetId: AssetId) => assetId;

export const buildOptimizedAssetsSource = (
  assets: AssetsMap,
  symbology: SymbologySpec,
  units: UnitsSpec,
  formatting: FormattingSpec,
  translateUnit: (unit: Unit) => string,
  simulationResults?: ResultsReader | null,
): Feature[] => {
  const strippedFeatures = [];
  const keepProperties: string[] = ["type", "isActive"];
  const maxAbsFlow = getMaxAbsFlow(simulationResults);

  for (const asset of assets.values()) {
    if (asset.feature.properties?.visibility === false) {
      continue;
    }
    const featureId = buildFeatureId(asset.id);
    const feature: Feature = {
      type: "Feature",
      id: featureId,
      properties: pick(asset.feature.properties, keepProperties),
      geometry: asset.feature.geometry,
    };

    const isLink =
      asset.type === "pipe" || asset.type === "pump" || asset.type === "valve";
    const labelRule = isLink
      ? symbology.link.labelRule
      : symbology.node.labelRule;
    appendLabel(
      asset,
      feature,
      labelRule,
      units,
      formatting,
      translateUnit,
      simulationResults,
    );

    switch (asset.type) {
      case "pipe":
        appendPipeProps(
          asset as Pipe,
          feature,
          symbology.link,
          units,
          formatting,
          translateUnit,
          symbology.link.defaults.color,
          simulationResults,
          maxAbsFlow,
        );
        break;
      case "junction":
        appendJunctionProps(
          asset as Junction,
          feature,
          symbology.node,
          units,
          formatting,
          translateUnit,
          simulationResults,
        );
        break;
      case "pump":
        appendPumpProps(asset as Pump, feature, simulationResults);
        break;
      case "valve":
        appendValveProps(asset as Valve, feature, simulationResults);
        break;
      case "tank":
      case "reservoir":
        break;
    }

    strippedFeatures.push(feature);
  }
  return strippedFeatures;
};

const appendPipeProps = (
  pipe: Pipe,
  feature: Feature,
  linkSymbology: LinkSymbology,
  units: UnitsSpec,
  formatting: FormattingSpec,
  translateUnit: (unit: Unit) => string,
  defaultColor: string,
  simulationResults?: ResultsReader | null,
  maxAbsFlow: number = 0,
) => {
  appendPipeStatus(pipe, feature, simulationResults);
  appendPipeSymbologyProps(
    pipe,
    feature,
    linkSymbology,
    units,
    formatting,
    translateUnit,
    defaultColor,
    simulationResults,
    maxAbsFlow,
  );
};

const appendJunctionProps = (
  junction: Junction,
  feature: Feature,
  nodeSymbology: NodeSymbology,
  units: UnitsSpec,
  formatting: FormattingSpec,
  translateUnit: (unit: Unit) => string,
  simulationResults?: ResultsReader | null,
) => {
  appendJunctionSymbologyProps(
    junction,
    feature,
    nodeSymbology,
    units,
    formatting,
    translateUnit,
    simulationResults,
  );
};

const appendPumpProps = (
  pump: Pump,
  feature: Feature,
  simulationResults?: ResultsReader | null,
) => {
  appendPumpStatus(pump, feature, simulationResults);
};

const appendValveProps = (
  valve: Valve,
  feature: Feature,
  simulationResults?: ResultsReader | null,
) => {
  appendValveStatus(valve, feature, simulationResults);
};

export const appendPipeStatus = (
  pipe: Pipe,
  feature: Feature,
  simulationResults?: ResultsReader | null,
) => {
  const pipeSimulation = simulationResults?.getPipe(pipe.id);
  const status = pipeSimulation?.status ?? null;
  feature.properties!.status = status ? status : pipe.initialStatus;
};

export const appendPumpStatus = (
  pump: Pump,
  feature: Feature,
  simulationResults?: ResultsReader | null,
) => {
  const pumpSimulation = simulationResults?.getPump(pump.id);
  const status = pumpSimulation?.status ?? null;
  feature.properties!.status = status ? status : pump.initialStatus;
};

export const appendValveStatus = (
  valve: Valve,
  feature: Feature,
  simulationResults?: ResultsReader | null,
) => {
  const valveSimulation = simulationResults?.getValve(valve.id);
  const status = valveSimulation?.status ?? null;
  feature.properties!.status = status ? status : valve.initialStatus;
};

export const appendPipeArrowProps = (
  pipe: Pipe,
  feature: Feature,
  units: UnitsSpec,
  defaultColor: string,
  simulationResults?: ResultsReader | null,
  maxAbsFlow: number = 0,
) => {
  const pipeSimulation = simulationResults?.getPipe(pipe.id);
  const status = pipeSimulation?.status ?? null;
  const flow = pipeSimulation?.flow ?? null;
  const absFlow = flow === null ? 0 : Math.abs(flow);
  const isReverse = flow !== null && flow < 0;
  const isOpen = (status ?? pipe.initialStatus) === "open";
  const hasFlowPulse = isOpen && flow !== null && absFlow > 0;
  const pulseStrength =
    maxAbsFlow > 0 ? Math.min(1, Math.max(0.2, absFlow / maxAbsFlow)) : 0;
  const pulseColor = (feature.properties?.color as string) ?? defaultColor;
  const [pulseColorR, pulseColorG, pulseColorB] = hexToArray(pulseColor);

  feature.properties!.length = convertTo(
    { value: pipe.length, unit: units.length },
    "m",
  );
  feature.properties!.hasArrow = isOpen && flow !== null;
  feature.properties!.rotation = isReverse ? -180 : 0;
  feature.properties!.hasFlowPulse = hasFlowPulse;
  feature.properties!.flowDirection = isReverse ? -1 : 1;
  feature.properties!.pulseStrength = hasFlowPulse ? pulseStrength : 0;
  feature.properties!.pulseColorR = pulseColorR;
  feature.properties!.pulseColorG = pulseColorG;
  feature.properties!.pulseColorB = pulseColorB;
};

const appendPipeSymbologyProps = (
  pipe: Pipe,
  feature: Feature,
  linkSymbology: LinkSymbology,
  units: UnitsSpec,
  formatting: FormattingSpec,
  translateUnit: (unit: Unit) => string,
  defaultColor: string,
  simulationResults?: ResultsReader | null,
  maxAbsFlow: number = 0,
) => {
  if (linkSymbology.colorRule) {
    const property = linkSymbology.colorRule.property;

    let value: number | null;
    if (isSimulationProperty(property)) {
      const pipeSimulation = simulationResults?.getPipe(pipe.id);
      value = pipeSimulation
        ? (pipeSimulation[property as keyof PipeSimulation] as number)
        : null;
    } else {
      value = pipe[property as keyof Pipe] as number | null;
    }
    const numericValue = value !== null ? value : 0;

    feature.properties!.color = colorFor(linkSymbology.colorRule, numericValue);
  }

  feature.properties!.color =
    (feature.properties!.color as string | undefined) ??
    linkSymbology.defaults.color;

  appendPipeArrowProps(
    pipe,
    feature,
    units,
    defaultColor,
    simulationResults,
    maxAbsFlow,
  );
};

// Maps symbology property names to simulation property names
const getJunctionSimProperty = (property: string): keyof JunctionSimulation => {
  if (property === "actualDemand") return "demand";
  return property as keyof JunctionSimulation;
};

const appendJunctionSymbologyProps = (
  junction: Junction,
  feature: Feature,
  nodeSymbology: NodeSymbology,
  units: UnitsSpec,
  formatting: FormattingSpec,
  translateUnit: (unit: Unit) => string,
  simulationResults?: ResultsReader | null,
) => {
  if (!nodeSymbology.colorRule) {
    feature.properties!.color = nodeSymbology.defaults.color;
    feature.properties!.strokeColor = strokeColorFor(
      nodeSymbology.defaults.color,
    );
    return;
  }

  const property = nodeSymbology.colorRule.property;

  let value: number | null;
  if (isSimulationProperty(property)) {
    const junctionSimulation = simulationResults?.getJunction(junction.id);
    const simProperty = getJunctionSimProperty(property);
    value = junctionSimulation
      ? (junctionSimulation[simProperty] as number)
      : null;
  } else {
    value = junction[property as keyof Junction] as number | null;
  }
  const numericValue = value !== null ? value : 0;

  const fillColor = colorFor(nodeSymbology.colorRule, numericValue);
  const strokeColor = strokeColorFor(fillColor);

  feature.properties!.color = fillColor;
  feature.properties!.strokeColor = strokeColor;
};

const appendLabel = (
  asset: Asset,
  feature: Feature,
  labelRule: LabelRule | null,
  units: UnitsSpec,
  formatting: FormattingSpec,
  translateUnit: (unit: Unit) => string,
  simulationResults?: ResultsReader | null,
) => {
  if (!labelRule) return;

  if (labelRule === assetLabelRule) {
    feature.properties!.label = asset.label;
    return;
  }

  const property = labelRule;
  let value: number | null = null;

  if (isSimulationProperty(property)) {
    if (asset.type === "pipe") {
      const sim = simulationResults?.getPipe(asset.id);
      value = sim ? (sim[property as keyof PipeSimulation] as number) : null;
    } else if (asset.type === "junction") {
      const simProperty = getJunctionSimProperty(property);
      const sim = simulationResults?.getJunction(asset.id);
      value = sim ? (sim[simProperty] as number) : null;
    }
  } else {
    value =
      (asset as unknown as Record<string, number | null>)[property] ?? null;
  }

  const numericValue = value !== null ? value : 0;
  const unit = units[property as QuantityProperty];
  const localizedNumber = localizeDecimal(numericValue, {
    decimals: getDecimals(formatting, property as QuantityProperty),
  });
  const unitText = unit ? translateUnit(unit) : "";
  feature.properties!.label = `${localizedNumber} ${unitText}`;
};

function pick(
  properties: Feature["properties"],
  propertyNames: readonly string[],
) {
  // Bail if properties is null.
  if (!properties) return properties;

  // Shortcut if there are no properties to pull.
  if (propertyNames.length === 0) return null;

  let ret: null | Feature["properties"] = null;

  for (const name of propertyNames) {
    if (name in properties) {
      if (ret === null) {
        ret = {};
      }
      ret[name] = properties[name];
    }
  }

  return ret;
}

const getMaxAbsFlow = (simulationResults?: ResultsReader | null): number => {
  if (!simulationResults) return 0;

  return simulationResults
    .getAllValues("flow")
    .reduce((max, flow) => Math.max(max, Math.abs(flow)), 0);
};
