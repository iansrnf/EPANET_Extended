import bbox from "@turf/bbox";
import type { FeatureCollection } from "geojson";
import "mapbox-gl/dist/mapbox-gl.css";
import { LngLat, type LngLatBoundsLike } from "mapbox-gl";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { Button } from "src/components/elements";
import { EarlyAccessBadge } from "src/components/early-access-badge";
import { Input } from "src/components/elements";
import { VerticalField } from "src/components/form/fields";
import { Selector } from "src/components/form/selector";
import {
  WizardActions,
  WizardContainer,
  WizardContent,
  WizardHeader,
  type Step,
} from "src/components/wizard";
import { useTranslate } from "src/hooks/use-translate";
import { presets, Presets } from "src/lib/project-settings/quantities-spec";
import { HeadlossFormula } from "src/hydraulic-model";
import { headlossFormulasFullNames } from "src/hydraulic-model/asset-types/pipe";
import { DisconnectIcon, UploadIcon, CloseIcon } from "src/icons";
import { MapPreview } from "./network-projection/map-preview";
import { useMapPreview } from "./network-projection/use-map-preview";
import {
  buildApiNetworkPreview,
  collectPropertyNames,
} from "./model-builder-api-transform";
import { projectSettingsAtom } from "src/state/project-settings";
import { initializeHydraulicModel } from "src/hydraulic-model";
import { initializeModelFactories } from "src/hydraulic-model/factories";
import { LabelManager } from "src/hydraulic-model/label-manager";
import { ConsecutiveIdsGenerator } from "src/lib/id-generator";
import { defaultSimulationSettings } from "src/simulation/simulation-settings";
import { inpFileInfoAtom } from "src/state/file-system";
import { useStartNewProject } from "src/hooks/persistence/use-start-new-project";
import { convertTo } from "src/quantity";
import { useToggleNetworkReview } from "src/commands/toggle-network-review";
import { useElevations } from "src/map/elevations/use-elevations";
import { MapContext } from "src/map";
import { getExtent, isBBoxEmpty } from "src/lib/geometry";

type ImportedApiSource = {
  name: string;
  url: string;
  featureCount: number;
  geometryType: string;
  bbox: [number, number, number, number] | null;
  crsName: string | null;
  firstFeatureId: string | null;
  propertyNames: string[];
  previewGeoJson: FeatureCollection;
};

type ImportedApiEntry = {
  id: string;
  source: ImportedApiSource;
  assignment: ElementAssignment | null;
};

type UnitSystem = "us" | "metric";
type ElementAssignment = "pipes" | "pumps";

type PumpPreviewRow = {
  rowNumber: number;
  id: string;
  idDefault: boolean;
  power: string;
  powerDefault: boolean;
  status: string;
  statusDefault: boolean;
  elevation: string;
  elevationDefault: boolean;
};

type PumpDraft = {
  id: string;
  label: string;
  coordinates: [number, number];
  power: number;
  initialStatus: "on" | "off";
  elevation: number;
};

const buildPropertyOptions = (entries: ImportedApiEntry[]) => {
  const names = new Set<string>();
  for (const entry of entries) {
    for (const property of entry.source.propertyNames) {
      names.add(property);
    }
  }

  return Array.from(names)
    .sort((a, b) => a.localeCompare(b))
    .map((property) => ({
      value: property,
      label: property,
    }));
};

const US_FLOW_UNITS: { value: keyof Presets; label: string }[] = [
  { value: "CFS", label: "CFS (cu foot/sec)" },
  { value: "GPM", label: "GPM (gal/min)" },
  { value: "MGD", label: "MGD (Million gal/day)" },
  { value: "IMGD", label: "IMGD (Imperial MGD)" },
  { value: "AFD", label: "AFD (ac-foot/day)" },
];

const SI_FLOW_UNITS: { value: keyof Presets; label: string }[] = [
  { value: "LPS", label: "LPS (liters/sec)" },
  { value: "LPM", label: "LPM (liters/min)" },
  { value: "MLD", label: "MLD (megaliters/day)" },
  { value: "CMH", label: "CMH (m^3/hour)" },
  { value: "CMD", label: "CMD (m^3/day)" },
];

const HEADLOSS_FORMULA_OPTIONS: {
  value: HeadlossFormula;
  label: string;
}[] = [
  { value: "H-W", label: headlossFormulasFullNames[0] },
  { value: "D-W", label: headlossFormulasFullNames[1] },
  { value: "C-M", label: headlossFormulasFullNames[2] },
];

const STEP_COUNT = 4;

const parseApiSourceName = (urlValue: string) => {
  try {
    const url = new URL(urlValue);
    const typeName = url.searchParams.get("typeName");
    if (typeName) return typeName.split(":").pop() || typeName;

    const pathParts = url.pathname.split("/").filter(Boolean);
    return pathParts[pathParts.length - 1] || url.hostname;
  } catch {
    return "API Source";
  }
};

const deriveNameFromFeatureId = (featureId: unknown) => {
  if (typeof featureId !== "string" || featureId.length === 0) return null;
  const [prefix] = featureId.split(".");
  return prefix || featureId;
};

const parseGeoJsonResponse = async (
  response: Response,
  sourceUrl: string,
): Promise<ImportedApiSource> => {
  const data = (await response.json()) as GeoJSON.FeatureCollection & {
    totalFeatures?: number;
    crs?: {
      type?: string;
      properties?: {
        name?: string;
      };
    };
  };

  if (
    !data ||
    data.type !== "FeatureCollection" ||
    !Array.isArray(data.features)
  ) {
    throw new Error("API did not return a valid GeoJSON FeatureCollection.");
  }

  const featureCount = data.totalFeatures ?? data.features.length;
  const firstFeature = data.features.find((feature) => feature.geometry);
  const firstFeatureId =
    firstFeature && "id" in firstFeature ? String(firstFeature.id ?? "") : null;
  const geometryType = firstFeature?.geometry?.type ?? "Unknown geometry";
  const extent =
    data.features.length > 0
      ? (bbox(data) as [number, number, number, number])
      : null;
  const crsName = data.crs?.properties?.name ?? null;
  const sampleProperties = firstFeature?.properties
    ? collectPropertyNames(data)
    : [];

  return {
    name:
      deriveNameFromFeatureId(firstFeatureId) ?? parseApiSourceName(sourceUrl),
    url: sourceUrl,
    featureCount,
    geometryType,
    bbox: extent,
    crsName,
    firstFeatureId,
    propertyNames: sampleProperties,
    previewGeoJson: data,
  };
};

const PlaceholderStep = ({ title }: { title: string }) => {
  const translate = useTranslate();

  return (
    <div className="flex-1 grid place-items-center">
      <div className="max-w-md w-full rounded-2xl border border-gray-200 bg-white p-8 text-center">
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        <p className="mt-3 text-sm text-gray-600">
          {translate("importFromGISApiWizard.comingSoon")}
        </p>
      </div>
    </div>
  );
};

const PIPE_DEFAULTS = {
  diameter: "100",
  roughness: "100",
  minorLoss: "0",
  status: "Open",
} as const;

const JUNCTION_DEFAULTS = {
  elevation: "0",
} as const;

export const ModelBuilderApiDialog = ({ onClose }: { onClose: () => void }) => {
  const translate = useTranslate();
  const [currentStep, setCurrentStep] = useState(1);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("us");
  const [flowUnit, setFlowUnit] = useState<keyof Presets>("GPM");
  const [headlossFormula, setHeadlossFormula] =
    useState<HeadlossFormula>("H-W");
  const [apiUrl, setApiUrl] = useState("");
  const [apiEntries, setApiEntries] = useState<ImportedApiEntry[]>([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [pipeLabelField, setPipeLabelField] = useState<string | null>(null);
  const [pipeDiameterField, setPipeDiameterField] = useState<string | null>(
    null,
  );
  const [pipeRoughnessField, setPipeRoughnessField] = useState<string | null>(
    null,
  );
  const [pipeMinorLossField, setPipeMinorLossField] = useState<string | null>(
    null,
  );
  const [pipeStatusField, setPipeStatusField] = useState<string | null>(null);
  const [pumpLabelField, setPumpLabelField] = useState<string | null>(null);
  const [pumpPowerField, setPumpPowerField] = useState<string | null>(null);
  const [pumpStatusField, setPumpStatusField] = useState<string | null>(null);
  const [junctionElevationField, setJunctionElevationField] = useState<
    string | null
  >(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const { fitToBbox, fitToNetwork, setHandle } = useMapPreview();
  const map = useContext(MapContext);
  const currentProjectSettings = useAtomValue(projectSettingsAtom);
  const setFileInfo = useSetAtom(inpFileInfoAtom);
  const { startNewProject } = useStartNewProject();
  const toggleNetworkReview = useToggleNetworkReview();
  const assignedSources = useMemo(
    () => apiEntries.filter((entry) => entry.assignment !== null),
    [apiEntries],
  );
  const assignedPipeSources = useMemo(
    () => apiEntries.filter((entry) => entry.assignment === "pipes"),
    [apiEntries],
  );
  const assignedPumpSources = useMemo(
    () => apiEntries.filter((entry) => entry.assignment === "pumps"),
    [apiEntries],
  );
  const unassignedSources = useMemo(
    () => apiEntries.filter((entry) => entry.assignment === null),
    [apiEntries],
  );
  const assignedElementCount = assignedSources.length;
  const selectedSpec = useMemo(() => presets[flowUnit], [flowUnit]);
  const { fetchElevation } = useElevations(selectedSpec.units.elevation);

  const pipePropertyOptions = useMemo(
    () => buildPropertyOptions(assignedPipeSources),
    [assignedPipeSources],
  );
  const pumpPropertyOptions = useMemo(
    () => buildPropertyOptions(assignedPumpSources),
    [assignedPumpSources],
  );
  const junctionPropertyOptions = useMemo(
    () => buildPropertyOptions(assignedSources),
    [assignedSources],
  );

  const assignedPreviewGeoJson = useMemo<FeatureCollection | null>(() => {
    if (assignedSources.length === 0) return null;

    return {
      type: "FeatureCollection",
      features: assignedSources.flatMap(
        (entry) => entry.source.previewGeoJson.features,
      ),
    };
  }, [assignedSources]);

  const pipeFeatures = useMemo(
    () =>
      assignedPreviewGeoJson
        ? assignedPreviewGeoJson.features.filter(isPipeGeometryFeature)
        : null,
    [assignedPreviewGeoJson],
  );
  const pumpFeatures = useMemo(
    () =>
      assignedPreviewGeoJson
        ? assignedPreviewGeoJson.features.filter(isPumpGeometryFeature)
        : null,
    [assignedPreviewGeoJson],
  );

  const pipePreviewRows = useMemo(
    () =>
      (pipeFeatures ?? []).slice(0, 100).map((feature, index) => {
        const idValue = getMappedTextValue(feature.properties, pipeLabelField);
        const diameterValue = getMappedTextValue(
          feature.properties,
          pipeDiameterField,
        );
        const roughnessValue = getMappedTextValue(
          feature.properties,
          pipeRoughnessField,
        );
        const minorLossValue = getMappedTextValue(
          feature.properties,
          pipeMinorLossField,
        );
        const statusValue = getMappedTextValue(
          feature.properties,
          pipeStatusField,
        );

        return {
          rowNumber: index + 1,
          id: idValue ?? String(feature.id ?? index + 1),
          idDefault: !idValue,
          diameter: diameterValue ?? PIPE_DEFAULTS.diameter,
          diameterDefault: !diameterValue,
          roughness: roughnessValue ?? PIPE_DEFAULTS.roughness,
          roughnessDefault: !roughnessValue,
          minorLoss: minorLossValue ?? PIPE_DEFAULTS.minorLoss,
          minorLossDefault: !minorLossValue,
          status: statusValue ?? PIPE_DEFAULTS.status,
          statusDefault: !statusValue,
        };
      }),
    [
      pipeDiameterField,
      pipeFeatures,
      pipeLabelField,
      pipeMinorLossField,
      pipeRoughnessField,
      pipeStatusField,
    ],
  );

  const pumpPreviewRows = useMemo<PumpPreviewRow[]>(
    () =>
      (pumpFeatures ?? []).slice(0, 100).map((feature, index) => {
        const idValue = getMappedTextValue(feature.properties, pumpLabelField);
        const powerValue = getMappedNumericValue(
          feature.properties,
          pumpPowerField,
        );
        const statusValue = getMappedTextValue(
          feature.properties,
          pumpStatusField,
        );
        const elevationValue = getMappedNumericValue(
          feature.properties,
          junctionElevationField,
        );

        return {
          rowNumber: index + 1,
          id: idValue ?? String(feature.id ?? index + 1),
          idDefault: !idValue,
          power: String(powerValue ?? selectedSpec.defaults.pump.power ?? 20),
          powerDefault: powerValue == null,
          status: normalizePumpStatus(statusValue) === "off" ? "Off" : "On",
          statusDefault: !statusValue,
          elevation: String(
            elevationValue ?? Number(JUNCTION_DEFAULTS.elevation),
          ),
          elevationDefault: elevationValue == null,
        };
      }),
    [
      junctionElevationField,
      pumpFeatures,
      pumpLabelField,
      pumpPowerField,
      pumpStatusField,
      selectedSpec.defaults.pump.power,
    ],
  );

  const networkDraft = useMemo(
    () =>
      assignedPipeSources.length > 0
        ? buildApiNetworkPreview(
            {
              type: "FeatureCollection",
              features: assignedPipeSources.flatMap(
                (entry) => entry.source.previewGeoJson.features,
              ),
            },
            {
              pipe: {
                labelField: pipeLabelField,
                diameterField: pipeDiameterField,
                defaultDiameter: Number(PIPE_DEFAULTS.diameter),
                roughnessField: pipeRoughnessField,
                defaultRoughness: Number(PIPE_DEFAULTS.roughness),
                minorLossField: pipeMinorLossField,
                defaultMinorLoss: Number(PIPE_DEFAULTS.minorLoss),
                statusField: pipeStatusField,
                defaultStatus: "open",
                lengthMode: "geometry",
                lengthField: null,
                defaultLength: 0,
              },
              junction: {
                labelField: null,
                elevationField: junctionElevationField,
                defaultElevation: Number(JUNCTION_DEFAULTS.elevation),
                emitterCoefficientField: null,
                defaultEmitterCoefficient: 0,
              },
            },
          )
        : null,
    [
      assignedPipeSources,
      junctionElevationField,
      pipeDiameterField,
      pipeLabelField,
      pipeMinorLossField,
      pipeRoughnessField,
      pipeStatusField,
    ],
  );

  const junctionPreviewRows = useMemo(
    () =>
      (networkDraft?.junctions ?? []).slice(0, 100).map((junction, index) => ({
        rowNumber: index + 1,
        id: junction.label,
        elevation: String(junction.elevation),
        elevationDefault: !junctionElevationField,
      })),
    [junctionElevationField, networkDraft],
  );

  const pumpDrafts = useMemo<PumpDraft[]>(
    () =>
      (pumpFeatures ?? [])
        .map((feature, index) => {
          const coordinates = getPointCoordinates(feature);
          if (!coordinates) return null;

          const labelValue = getMappedTextValue(
            feature.properties,
            pumpLabelField,
          );
          const powerValue = getMappedNumericValue(
            feature.properties,
            pumpPowerField,
          );
          const statusValue = getMappedTextValue(
            feature.properties,
            pumpStatusField,
          );
          const elevationValue = getMappedNumericValue(
            feature.properties,
            junctionElevationField,
          );

          return {
            id: String(feature.id ?? `pump-${index + 1}`),
            label: labelValue ?? String(feature.id ?? `pump-${index + 1}`),
            coordinates,
            power: powerValue ?? selectedSpec.defaults.pump.power ?? 20,
            initialStatus: normalizePumpStatus(statusValue),
            elevation: elevationValue ?? Number(JUNCTION_DEFAULTS.elevation),
          };
        })
        .filter((draft): draft is PumpDraft => draft !== null),
    [
      junctionElevationField,
      pumpFeatures,
      pumpLabelField,
      pumpPowerField,
      pumpStatusField,
      selectedSpec.defaults.pump.power,
    ],
  );

  const steps: Step[] = [
    {
      number: 1,
      label: translate("importFromGISApiWizard.steps.modelSettings"),
      ariaLabel: "Step 1: Model Settings",
    },
    {
      number: 2,
      label: translate("importFromGISApiWizard.steps.dataAssignment"),
      ariaLabel: "Step 2: Data Assignment",
    },
    {
      number: 3,
      label: translate("importFromGISApiWizard.steps.attributeMapping"),
      ariaLabel: "Step 3: Attribute Mapping",
    },
    {
      number: 4,
      label: translate("importFromGISApiWizard.steps.modelBuild"),
      ariaLabel: "Step 4: Model Build",
    },
  ];

  const flowUnitOptions = useMemo(
    () => (unitSystem === "us" ? US_FLOW_UNITS : SI_FLOW_UNITS),
    [unitSystem],
  );

  const handleUnitSystemChange = (nextSystem: UnitSystem) => {
    setUnitSystem(nextSystem);
    setFlowUnit(nextSystem === "us" ? "GPM" : "LPS");
  };

  useEffect(() => {
    if (!assignedPreviewGeoJson) return;

    const latestAssignedBbox =
      assignedSources[assignedSources.length - 1]?.source.bbox;
    if (latestAssignedBbox) {
      fitToBbox(latestAssignedBbox);
      return;
    }

    if (assignedPreviewGeoJson.features.length > 0) {
      fitToNetwork(assignedPreviewGeoJson);
    }
  }, [assignedPreviewGeoJson, assignedSources, fitToBbox, fitToNetwork]);

  const footer = (
    <WizardActions
      backAction={
        currentStep > 1
          ? {
              onClick: () => setCurrentStep((step) => Math.max(1, step - 1)),
              disabled: isBuilding,
            }
          : undefined
      }
      nextAction={
        currentStep < STEP_COUNT
          ? {
              onClick: () =>
                setCurrentStep((step) => Math.min(STEP_COUNT, step + 1)),
              disabled:
                (currentStep === 2 && assignedSources.length === 0) ||
                (currentStep === 3 &&
                  networkDraft == null &&
                  pumpDrafts.length === 0),
            }
          : undefined
      }
      finishAction={
        currentStep === STEP_COUNT
          ? {
              onClick: () => {
                void handleBuildModel();
              },
              disabled:
                (networkDraft?.pipes.length ?? 0) + pumpDrafts.length === 0,
              loading: isBuilding,
              label: "Build Model",
            }
          : undefined
      }
    />
  );

  const handleLoadApi = async () => {
    if (!apiUrl.trim()) {
      setApiError(translate("importFromGISApiWizard.dataAssignment.emptyUrl"));
      return;
    }

    try {
      setApiLoading(true);
      setApiError(null);

      const response = await fetch("/api/gis-proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: apiUrl }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          errorText || `Request failed with status ${response.status}.`,
        );
      }

      const parsedSource = await parseGeoJsonResponse(response, apiUrl);
      setApiEntries((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${prev.length}`,
          source: parsedSource,
          assignment: null,
        },
      ]);
      setApiUrl("");
      setPipeLabelField(null);
      setPipeDiameterField(null);
      setPipeRoughnessField(null);
      setPipeMinorLossField(null);
      setPipeStatusField(null);
      setPumpLabelField(null);
      setPumpPowerField(null);
      setPumpStatusField(null);
      setJunctionElevationField(null);
    } catch (error) {
      setApiError(
        error instanceof Error
          ? error.message
          : translate("importFromGISApiWizard.dataAssignment.loadFailed"),
      );
    } finally {
      setApiLoading(false);
    }
  };

  const handleAssignmentChange = useCallback(
    (entryId: string, assignment: ElementAssignment | null) => {
      setApiEntries((prev) =>
        prev.map((entry) =>
          entry.id === entryId ? { ...entry, assignment } : entry,
        ),
      );
    },
    [],
  );

  const handleDeleteEntry = useCallback((entryId: string) => {
    setApiEntries((prev) => prev.filter((entry) => entry.id !== entryId));
  }, []);

  const handleBuildModel = async () => {
    if (!networkDraft && pumpDrafts.length === 0) return;
    if (assignedSources.length === 0) return;

    try {
      setIsBuilding(true);

      const spec = selectedSpec;
      const idGenerator = new ConsecutiveIdsGenerator();
      const labelManager = new LabelManager();
      const hydraulicModel = initializeHydraulicModel({
        idGenerator,
        labelManager,
      });
      const factories = initializeModelFactories({
        idGenerator,
        labelManager,
        defaults: spec.defaults,
      });

      const junctionIdByDraftId = new Map<string, number>();
      const resolvedPipeJunctionDrafts =
        networkDraft == null
          ? []
          : junctionElevationField
            ? networkDraft.junctions
            : await Promise.all(
                networkDraft.junctions.map(async (junctionDraft) => ({
                  ...junctionDraft,
                  elevation: await fetchElevation(
                    new LngLat(
                      junctionDraft.coordinates[0],
                      junctionDraft.coordinates[1],
                    ),
                  ),
                })),
              );

      for (const junctionDraft of resolvedPipeJunctionDrafts) {
        const junction = factories.assetFactory.createJunction({
          label: junctionDraft.label,
          coordinates: junctionDraft.coordinates,
          elevation: junctionDraft.elevation,
          emitterCoefficient: junctionDraft.emitterCoefficient,
        });

        hydraulicModel.assets.set(junction.id, junction);
        hydraulicModel.assetIndex.addNode(junction.id);
        junctionIdByDraftId.set(junctionDraft.id, junction.id);
      }

      if (networkDraft) {
        for (const pipeDraft of networkDraft.pipes) {
          const startNodeId = junctionIdByDraftId.get(
            pipeDraft.startJunctionId,
          );
          const endNodeId = junctionIdByDraftId.get(pipeDraft.endJunctionId);

          if (startNodeId == null || endNodeId == null) continue;

          const pipe = factories.assetFactory.createPipe({
            label: pipeDraft.label,
            coordinates: pipeDraft.coordinates,
            connections: [startNodeId, endNodeId],
            diameter: pipeDraft.diameter,
            roughness: pipeDraft.roughness,
            minorLoss: pipeDraft.minorLoss,
            initialStatus: pipeDraft.initialStatus,
            length: convertTo(
              { value: pipeDraft.length, unit: "m" },
              spec.units.length,
            ),
          });

          hydraulicModel.assets.set(pipe.id, pipe);
          hydraulicModel.assetIndex.addLink(pipe.id);
          hydraulicModel.topology.addLink(pipe.id, startNodeId, endNodeId);
        }
      }

      const resolvedPumpDrafts = junctionElevationField
        ? pumpDrafts
        : await Promise.all(
            pumpDrafts.map(async (pumpDraft) => ({
              ...pumpDraft,
              elevation: await fetchElevation(
                new LngLat(pumpDraft.coordinates[0], pumpDraft.coordinates[1]),
              ),
            })),
          );

      for (const pumpDraft of resolvedPumpDrafts) {
        const suctionJunction = factories.assetFactory.createJunction({
          label: `${pumpDraft.label}-SUCTION`,
          coordinates: pumpDraft.coordinates,
          elevation: pumpDraft.elevation,
        });
        const dischargeJunction = factories.assetFactory.createJunction({
          label: `${pumpDraft.label}-DISCHARGE`,
          coordinates: pumpDraft.coordinates,
          elevation: pumpDraft.elevation,
        });
        const pump = factories.assetFactory.createPump({
          label: pumpDraft.label,
          coordinates: [pumpDraft.coordinates, pumpDraft.coordinates],
          connections: [suctionJunction.id, dischargeJunction.id],
          definitionType: "power",
          power: pumpDraft.power,
          initialStatus: pumpDraft.initialStatus,
        });

        hydraulicModel.assets.set(suctionJunction.id, suctionJunction);
        hydraulicModel.assets.set(dischargeJunction.id, dischargeJunction);
        hydraulicModel.assets.set(pump.id, pump);
        hydraulicModel.assetIndex.addNode(suctionJunction.id);
        hydraulicModel.assetIndex.addNode(dischargeJunction.id);
        hydraulicModel.assetIndex.addLink(pump.id);
        hydraulicModel.topology.addLink(
          pump.id,
          suctionJunction.id,
          dischargeJunction.id,
        );
      }

      await startNewProject({
        hydraulicModel,
        factories,
        projectSettings: {
          ...currentProjectSettings,
          units: spec.units,
          defaults: spec.defaults,
          headlossFormula,
          formatting: {
            decimals: spec.decimals,
            defaultDecimals: 3,
          },
        },
        simulationSettings: defaultSimulationSettings,
        autoElevations: currentProjectSettings.projection.type !== "xy-grid",
      });

      const importedFeatures: FeatureCollection = {
        type: "FeatureCollection",
        features: [...hydraulicModel.assets.values()].map(
          (asset) => asset.feature,
        ),
      };
      const nextExtent = getExtent(importedFeatures).extract();
      if (nextExtent) {
        map?.map.fitBounds(nextExtent as LngLatBoundsLike, {
          padding: 100,
          duration: 0,
          maxZoom: isBBoxEmpty(nextExtent) ? 18 : Infinity,
        });
      }

      setFileInfo(null);
      toggleNetworkReview({ source: "auto", state: true });
      onClose();
    } finally {
      setIsBuilding(false);
    }
  };

  return (
    <WizardContainer footer={footer}>
      <WizardHeader
        title={translate("importFromGISApi")}
        steps={steps}
        currentStep={currentStep}
        onClose={onClose}
        badge={<EarlyAccessBadge />}
      />

      <WizardContent minHeight="680px">
        {currentStep === 1 ? (
          <div className="flex-1 grid gap-8 lg:grid-cols-[1fr_1fr] pb-6">
            <section className="rounded-3xl border border-gray-200 bg-white p-8 md:p-10">
              <h2 className="text-2xl font-semibold text-gray-900">
                {translate("importFromGISApiWizard.modelSettings.title")}
              </h2>

              <div className="mt-10 flex flex-col gap-8">
                <VerticalField
                  name={translate(
                    "importFromGISApiWizard.modelSettings.unitSystem",
                  )}
                >
                  <Selector
                    selected={unitSystem}
                    onChange={(value) => handleUnitSystemChange(value)}
                    options={[
                      {
                        value: "us",
                        label: translate(
                          "importFromGISApiWizard.modelSettings.unitSystemUs",
                        ),
                      },
                      {
                        value: "metric",
                        label: translate(
                          "importFromGISApiWizard.modelSettings.unitSystemMetric",
                        ),
                      },
                    ]}
                    ariaLabel={translate(
                      "importFromGISApiWizard.modelSettings.unitSystem",
                    )}
                    styleOptions={{ textSize: "text-sm", paddingY: 3 }}
                  />
                </VerticalField>

                <VerticalField
                  name={translate(
                    "importFromGISApiWizard.modelSettings.flowUnits",
                  )}
                >
                  <Selector
                    selected={flowUnit}
                    onChange={(value) => setFlowUnit(value)}
                    options={flowUnitOptions}
                    ariaLabel={translate(
                      "importFromGISApiWizard.modelSettings.flowUnits",
                    )}
                    styleOptions={{ textSize: "text-sm", paddingY: 3 }}
                  />
                </VerticalField>

                <VerticalField
                  name={translate(
                    "importFromGISApiWizard.modelSettings.headlossFormula",
                  )}
                >
                  <Selector
                    selected={headlossFormula}
                    onChange={(value) => setHeadlossFormula(value)}
                    options={HEADLOSS_FORMULA_OPTIONS}
                    ariaLabel={translate(
                      "importFromGISApiWizard.modelSettings.headlossFormula",
                    )}
                    styleOptions={{ textSize: "text-sm", paddingY: 3 }}
                  />
                </VerticalField>
              </div>
            </section>

            <section className="rounded-3xl border border-gray-200 bg-white p-8 md:p-10">
              <h2 className="text-2xl font-semibold text-gray-900">
                {translate("importFromGISApiWizard.tutorial.title")}
              </h2>

              <div className="mt-8 rounded-3xl border border-gray-200 bg-gray-50 p-8 min-h-[420px] flex items-center justify-center text-center">
                <div>
                  <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-purple-100 text-purple-700 text-3xl font-semibold">
                    1
                  </div>
                  <p className="mt-6 text-3xl font-semibold text-gray-900 leading-tight">
                    {translate("importFromGISApiWizard.tutorial.stepTitle")}
                  </p>
                  <p className="mt-4 text-xl text-gray-600 max-w-md leading-9">
                    {translate(
                      "importFromGISApiWizard.tutorial.stepDescription",
                    )}
                  </p>
                </div>
              </div>

              <p className="mt-8 text-xl leading-9 text-gray-700">
                {translate("importFromGISApiWizard.tutorial.description")}
              </p>

              <Button
                variant="quiet"
                size="sm"
                className="mt-5 px-0 text-xl text-purple-600 hover:text-purple-700"
                onClick={() =>
                  window.open("https://help.epanetjs.com", "_blank")
                }
              >
                {translate("importFromGISApiWizard.tutorial.link")}
              </Button>
            </section>
          </div>
        ) : currentStep === 2 ? (
          <div className="flex-1 grid gap-6 xl:grid-cols-[0.95fr_1.9fr] pb-4">
            <section className="rounded-2xl border border-gray-200 bg-white p-7">
              <h2 className="text-2xl font-semibold text-gray-900">
                {translate("importFromGISApiWizard.dataAssignment.title")}
              </h2>

              <div className="mt-8">
                <VerticalField
                  name={translate(
                    "importFromGISApiWizard.dataAssignment.apiUrl",
                  )}
                >
                  <div className="flex flex-col gap-3">
                    <Input
                      type="url"
                      value={apiUrl}
                      onChange={(event) => setApiUrl(event.target.value)}
                      placeholder={translate(
                        "importFromGISApiWizard.dataAssignment.apiUrlPlaceholder",
                      )}
                      className="h-11"
                    />
                    <Button
                      variant="primary"
                      className="w-full min-w-0 justify-center whitespace-normal break-words text-center h-auto py-3"
                      onClick={() => void handleLoadApi()}
                      disabled={apiLoading}
                    >
                      <UploadIcon />
                      {apiLoading
                        ? translate("loading")
                        : translate(
                            "importFromGISApiWizard.dataAssignment.loadApiButton",
                          )}
                    </Button>
                  </div>
                </VerticalField>
              </div>

              {apiError ? (
                <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {apiError}
                </div>
              ) : null}

              <div className="mt-6 space-y-6">
                <div>
                  <div className="text-xl text-gray-900">
                    {translate(
                      "importFromGISApiWizard.dataAssignment.unassignedApis",
                      unassignedSources.length,
                    )}
                  </div>

                  {unassignedSources.length > 0 ? (
                    <div className="mt-4 space-y-4">
                      {unassignedSources.map((entry) => (
                        <div
                          key={entry.id}
                          className="rounded-2xl border border-gray-200 bg-white p-5"
                        >
                          <div className="flex items-start justify-between gap-4 min-w-0">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-3">
                                <span className="h-4 w-4 rounded-full bg-blue-500 shrink-0" />
                                <h3 className="truncate text-2xl font-semibold text-gray-900">
                                  {entry.source.name}
                                </h3>
                              </div>
                              <p className="mt-3 break-words text-base text-slate-600">
                                {entry.source.geometryType} •{" "}
                                {entry.source.featureCount}{" "}
                                {translate(
                                  "importFromGISApiWizard.dataAssignment.features",
                                )}
                              </p>
                              <div className="mt-4 max-w-[300px]">
                                <Selector
                                  selected={entry.assignment}
                                  onChange={(value) =>
                                    handleAssignmentChange(entry.id, value)
                                  }
                                  nullable
                                  placeholder={translate(
                                    "importFromGISApiWizard.dataAssignment.assignPlaceholder",
                                  )}
                                  options={[
                                    {
                                      value: "pipes",
                                      label: translate(
                                        "importFromGISApiWizard.dataAssignment.assignmentPipes",
                                      ),
                                    },
                                    {
                                      value: "pumps",
                                      label: "Pumps",
                                    },
                                  ]}
                                  ariaLabel={translate(
                                    "importFromGISApiWizard.dataAssignment.assignLabel",
                                  )}
                                  styleOptions={{
                                    textSize: "text-sm",
                                    paddingY: 3,
                                  }}
                                />
                              </div>
                            </div>
                            <button
                              type="button"
                              className="text-slate-500 hover:text-slate-700"
                              onClick={() => handleDeleteEntry(entry.id)}
                              aria-label={translate("delete")}
                            >
                              <CloseIcon />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">
                      {translate(
                        "importFromGISApiWizard.dataAssignment.noApiAssigned",
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xl text-gray-900">
                    {translate(
                      "importFromGISApiWizard.dataAssignment.assignedApis",
                      assignedSources.length,
                    )}
                  </div>

                  {assignedSources.length > 0 ? (
                    <div className="mt-4 space-y-4">
                      {assignedSources.map((entry) => (
                        <div
                          key={entry.id}
                          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"
                        >
                          <div className="flex items-start justify-between gap-4 min-w-0">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-3">
                                <span className="h-4 w-4 rounded-full bg-blue-500 shrink-0" />
                                <h3 className="truncate text-2xl font-semibold text-gray-900">
                                  {entry.source.name}
                                </h3>
                              </div>
                              <p className="mt-3 break-words text-base text-slate-600">
                                {entry.source.geometryType} •{" "}
                                {entry.source.featureCount}{" "}
                                {translate(
                                  "importFromGISApiWizard.dataAssignment.features",
                                )}
                              </p>
                              <div className="mt-4 max-w-[300px]">
                                <Selector
                                  selected={entry.assignment}
                                  onChange={(value) =>
                                    handleAssignmentChange(entry.id, value)
                                  }
                                  nullable
                                  placeholder={translate(
                                    "importFromGISApiWizard.dataAssignment.assignPlaceholder",
                                  )}
                                  options={[
                                    {
                                      value: "pipes",
                                      label: translate(
                                        "importFromGISApiWizard.dataAssignment.assignmentPipes",
                                      ),
                                    },
                                    {
                                      value: "pumps",
                                      label: "Pumps",
                                    },
                                  ]}
                                  ariaLabel={translate(
                                    "importFromGISApiWizard.dataAssignment.assignLabel",
                                  )}
                                  styleOptions={{
                                    textSize: "text-sm",
                                    paddingY: 3,
                                  }}
                                />
                              </div>
                            </div>
                            <button
                              type="button"
                              className="text-slate-500 hover:text-slate-700"
                              onClick={() => handleDeleteEntry(entry.id)}
                              aria-label={translate("delete")}
                            >
                              <CloseIcon />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-7">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-2xl font-semibold text-gray-900">
                  {translate(
                    "importFromGISApiWizard.dataAssignment.previewTitle",
                  )}
                </h2>
                <div className="text-base text-slate-600">
                  {translate(
                    "importFromGISApiWizard.dataAssignment.elementsAssigned",
                    assignedElementCount,
                  )}
                </div>
              </div>

              <div className="mt-8 rounded-2xl border border-gray-200 bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] min-h-[380px] overflow-hidden">
                {assignedPreviewGeoJson ? (
                  <div className="flex h-full flex-col p-8">
                    <div className="h-[420px] overflow-hidden rounded-2xl border border-white/70 bg-white shadow-sm">
                      <MapPreview
                        geoJSON={assignedPreviewGeoJson}
                        showBasemap
                        isLoading={apiLoading}
                        setHandle={setHandle}
                      />
                    </div>

                    <div className="mt-4 rounded-2xl border border-gray-200 bg-white px-5 py-4">
                      <div className="flex items-center gap-3 text-lg text-slate-700">
                        <span className="h-3 w-3 rounded-full bg-blue-500" />
                        <span>
                          {assignedSources.length === 1
                            ? assignedSources[0].source.name
                            : `${assignedSources.length} assigned API sources`}{" "}
                          (
                          {assignedSources
                            .reduce(
                              (total, entry) =>
                                total + entry.source.featureCount,
                              0,
                            )
                            .toLocaleString()}
                          )
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center p-8 text-center">
                    <div>
                      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-slate-100 text-slate-500">
                        <DisconnectIcon />
                      </div>
                      <p className="mt-4 text-lg font-medium text-gray-900">
                        {translate(
                          "importFromGISApiWizard.dataAssignment.previewEmptyTitle",
                        )}
                      </p>
                      <p className="mt-2 text-sm text-slate-600">
                        {translate(
                          "importFromGISApiWizard.dataAssignment.previewEmptyDescription",
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : currentStep === 3 ? (
          <div className="flex-1 pb-4">
            <section className="rounded-3xl border border-gray-200 bg-white p-7 md:p-8">
              <h2 className="text-2xl font-semibold text-gray-900">
                Map Attributes
              </h2>

              {assignedSources.length === 0 ? (
                <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">
                  Load one or more GIS API sources in Step 2 and assign them to
                  pipes or pumps before mapping attributes.
                </div>
              ) : (
                <div className="mt-8">
                  <p className="text-lg leading-8 text-slate-600">
                    Map the properties from your GIS data to EPANET attributes.
                    Connectivity will be derived automatically, and junction
                    elevations can either be mapped from your GIS API data or
                    generated automatically from the configured terrain data.
                  </p>

                  <div className="mt-8 flex flex-wrap gap-3 rounded-2xl bg-slate-100 p-3">
                    {pipeFeatures && pipeFeatures.length > 0 ? (
                      <div className="inline-flex rounded-xl bg-white px-8 py-3 text-lg font-semibold text-slate-800 shadow-sm">
                        Pipes ({pipeFeatures.length})
                      </div>
                    ) : null}
                    {pumpFeatures && pumpFeatures.length > 0 ? (
                      <div className="inline-flex rounded-xl bg-white px-8 py-3 text-lg font-semibold text-slate-800 shadow-sm">
                        Pumps ({pumpFeatures.length})
                      </div>
                    ) : null}
                  </div>

                  {pipeFeatures && pipeFeatures.length > 0 ? (
                    <div className="mt-8">
                      <h3 className="text-2xl font-semibold text-slate-900">
                        Pipes Attribute Mapping
                      </h3>

                      <div className="mt-8 grid gap-5 md:grid-cols-2 md:gap-x-8">
                        <div className="space-y-4">
                          <div className="text-lg font-medium text-slate-700">
                            Recommended Attributes
                          </div>
                          <MappingSelector
                            label="Id"
                            value={pipeLabelField}
                            options={pipePropertyOptions}
                            placeholder="Select property..."
                            onChange={setPipeLabelField}
                          />
                          <MappingSelector
                            label="Diameter"
                            value={pipeDiameterField}
                            options={pipePropertyOptions}
                            placeholder="Select property..."
                            onChange={setPipeDiameterField}
                          />
                          <MappingSelector
                            label="Roughness"
                            value={pipeRoughnessField}
                            options={pipePropertyOptions}
                            placeholder="Select property..."
                            onChange={setPipeRoughnessField}
                          />
                        </div>

                        <div className="space-y-4">
                          <div className="text-lg font-medium text-slate-700">
                            Optional Attributes
                          </div>
                          <MappingSelector
                            label="MinorLoss"
                            value={pipeMinorLossField}
                            options={pipePropertyOptions}
                            placeholder="Select property..."
                            onChange={setPipeMinorLossField}
                          />
                          <MappingSelector
                            label="Status"
                            value={pipeStatusField}
                            options={pipePropertyOptions}
                            placeholder="Select property..."
                            onChange={setPipeStatusField}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {pumpFeatures && pumpFeatures.length > 0 ? (
                    <div className="mt-10">
                      <h3 className="text-2xl font-semibold text-slate-900">
                        Pumps Attribute Mapping
                      </h3>

                      <div className="mt-8 grid gap-5 md:grid-cols-2 md:gap-x-8">
                        <div className="space-y-4">
                          <div className="text-lg font-medium text-slate-700">
                            Recommended Attributes
                          </div>
                          <MappingSelector
                            label="Id"
                            value={pumpLabelField}
                            options={pumpPropertyOptions}
                            placeholder="Select property..."
                            onChange={setPumpLabelField}
                          />
                          <MappingSelector
                            label="Power"
                            value={pumpPowerField}
                            options={pumpPropertyOptions}
                            placeholder="Select property..."
                            onChange={setPumpPowerField}
                          />
                        </div>

                        <div className="space-y-4">
                          <div className="text-lg font-medium text-slate-700">
                            Optional Attributes
                          </div>
                          <MappingSelector
                            label="Status"
                            value={pumpStatusField}
                            options={pumpPropertyOptions}
                            placeholder="Select property..."
                            onChange={setPumpStatusField}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-10">
                    <h3 className="text-2xl font-semibold text-slate-900">
                      Junctions Attribute Mapping
                    </h3>

                    <div className="mt-8 grid gap-5 md:grid-cols-2 md:gap-x-8">
                      <div className="space-y-4">
                        <div className="text-lg font-medium text-slate-700">
                          Recommended Attributes
                        </div>
                        <MappingSelector
                          label="Elevation"
                          value={junctionElevationField}
                          options={junctionPropertyOptions}
                          placeholder="Select property..."
                          onChange={setJunctionElevationField}
                        />
                      </div>

                      <div className="space-y-4">
                        <div className="text-lg font-medium text-slate-700">
                          Defaults
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
                          Junction elevations default to{" "}
                          <span className="font-semibold text-slate-900">
                            {JUNCTION_DEFAULTS.elevation}
                          </span>{" "}
                          when no GIS field is selected or a value is missing.
                        </div>
                      </div>
                    </div>
                  </div>

                  {pipeFeatures && pipeFeatures.length > 0 ? (
                    <div className="mt-10">
                      <h3 className="text-2xl font-semibold text-slate-900">
                        Pipe Data Preview
                      </h3>
                      <PipeDataPreviewTable
                        rows={pipePreviewRows}
                        totalCount={pipeFeatures.length}
                      />
                    </div>
                  ) : null}

                  {pumpFeatures && pumpFeatures.length > 0 ? (
                    <div className="mt-10">
                      <h3 className="text-2xl font-semibold text-slate-900">
                        Pump Data Preview
                      </h3>
                      <PumpDataPreviewTable
                        rows={pumpPreviewRows}
                        totalCount={pumpFeatures.length}
                      />
                    </div>
                  ) : null}

                  <div className="mt-10">
                    <h3 className="text-2xl font-semibold text-slate-900">
                      Junction Data Preview
                    </h3>
                    <JunctionDataPreviewTable
                      rows={junctionPreviewRows}
                      totalCount={networkDraft?.junctions.length ?? 0}
                    />
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : currentStep === 4 ? (
          <div className="flex-1 pb-4">
            <section className="rounded-3xl border border-gray-200 bg-white p-7 md:p-8">
              <h2 className="text-2xl font-semibold text-gray-900">
                Build Model
              </h2>
              {assignedSources.length === 0 ||
              ((networkDraft?.pipes.length ?? 0) === 0 &&
                pumpDrafts.length === 0) ? (
                <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">
                  Complete the data assignment and attribute mapping first.
                </div>
              ) : (
                <div className="mt-8 space-y-6">
                  <p className="text-lg leading-8 text-slate-600">
                    We&apos;ll build a new EPANET model from your assigned GIS
                    APIs. Line layers become pipes with derived junctions, and
                    point layers assigned as pumps become pump assets with
                    supporting junctions. Missing mapped values will fall back
                    to defaults automatically.
                  </p>

                  <div className="grid gap-4 md:grid-cols-3">
                    <BuildSummaryCard
                      label="Source"
                      value={
                        assignedSources.length === 1
                          ? assignedSources[0].source.name
                          : `${assignedSources.length} GIS API sources`
                      }
                    />
                    <BuildSummaryCard
                      label="Pipes"
                      value={String(networkDraft?.pipes.length ?? 0)}
                    />
                    <BuildSummaryCard
                      label="Pumps"
                      value={String(pumpDrafts.length)}
                    />
                    <BuildSummaryCard
                      label="Junctions"
                      value={String(
                        (networkDraft?.junctions.length ?? 0) +
                          pumpDrafts.length * 2,
                      )}
                    />
                    <BuildSummaryCard
                      label="Elevation"
                      value={
                        junctionElevationField
                          ? `Mapped from ${junctionElevationField}`
                          : "Auto-generated from terrain"
                      }
                    />
                    <BuildSummaryCard label="Flow Units" value={flowUnit} />
                    <BuildSummaryCard
                      label="Headloss Formula"
                      value={headlossFormula}
                    />
                    <BuildSummaryCard
                      label="Network Review"
                      value="Opens after build"
                    />
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : (
          <PlaceholderStep
            title={translate("importFromGISApiWizard.steps.modelBuild")}
          />
        )}
      </WizardContent>
    </WizardContainer>
  );
};

const BuildSummaryCard = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
};

const MappingSelector = ({
  label,
  value,
  options,
  placeholder,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  placeholder: string;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) => {
  return (
    <VerticalField name={label}>
      <Selector
        selected={value}
        onChange={(selected) => onChange(selected)}
        nullable
        placeholder={placeholder}
        options={options}
        ariaLabel={label}
        disabled={disabled}
        styleOptions={{ textSize: "text-sm", paddingY: 3 }}
      />
    </VerticalField>
  );
};

const PipeDataPreviewTable = ({
  rows,
  totalCount,
}: {
  rows: {
    rowNumber: number;
    id: string;
    idDefault: boolean;
    diameter: string;
    diameterDefault: boolean;
    roughness: string;
    roughnessDefault: boolean;
    minorLoss: string;
    minorLossDefault: boolean;
    status: string;
    statusDefault: boolean;
  }[];
  totalCount: number;
}) => {
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
      <div className="max-h-[480px] overflow-auto">
        <table className="min-w-full text-sm text-slate-700">
          <thead className="sticky top-0 bg-slate-50 text-slate-500">
            <tr>
              <th className="w-16 px-5 py-4 text-left font-semibold">#</th>
              <th className="px-5 py-4 text-left font-semibold uppercase tracking-wide">
                ID <span className="text-red-400">*</span>
              </th>
              <th className="px-5 py-4 text-left font-semibold uppercase tracking-wide">
                Diameter (in) <span className="text-red-400">*</span>
              </th>
              <th className="px-5 py-4 text-left font-semibold uppercase tracking-wide">
                Roughness <span className="text-red-400">*</span>
              </th>
              <th className="px-5 py-4 text-left font-semibold uppercase tracking-wide">
                MinorLoss
              </th>
              <th className="px-5 py-4 text-left font-semibold uppercase tracking-wide">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rowNumber} className="border-t border-slate-200">
                <td className="px-5 py-4">{row.rowNumber}</td>
                <PreviewValueCell value={row.id} isDefault={row.idDefault} />
                <PreviewValueCell
                  value={row.diameter}
                  isDefault={row.diameterDefault}
                />
                <PreviewValueCell
                  value={row.roughness}
                  isDefault={row.roughnessDefault}
                />
                <PreviewValueCell
                  value={row.minorLoss}
                  isDefault={row.minorLossDefault}
                />
                <PreviewValueCell
                  value={row.status}
                  isDefault={row.statusDefault}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-500">
        <p>
          Showing first {rows.length} of {totalCount} features
        </p>
        <p className="mt-1">
          Legend: Normal text = mapped data,{" "}
          <span className="italic">italic text = default values</span>
        </p>
      </div>
    </div>
  );
};

const JunctionDataPreviewTable = ({
  rows,
  totalCount,
}: {
  rows: {
    rowNumber: number;
    id: string;
    elevation: string;
    elevationDefault: boolean;
  }[];
  totalCount: number;
}) => {
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
      <div className="max-h-[420px] overflow-auto">
        <table className="min-w-full text-sm text-slate-700">
          <thead className="sticky top-0 bg-slate-50 text-slate-500">
            <tr>
              <th className="w-16 px-5 py-4 text-left font-semibold">#</th>
              <th className="px-5 py-4 text-left font-semibold uppercase tracking-wide">
                Junction
              </th>
              <th className="px-5 py-4 text-left font-semibold uppercase tracking-wide">
                Elevation
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rowNumber} className="border-t border-slate-200">
                <td className="px-5 py-4">{row.rowNumber}</td>
                <PreviewValueCell value={row.id} isDefault={false} />
                <PreviewValueCell
                  value={row.elevation}
                  isDefault={row.elevationDefault}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-500">
        <p>
          Showing first {rows.length} of {totalCount} junctions
        </p>
        <p className="mt-1">
          Legend: Normal text = mapped data,{" "}
          <span className="italic">italic text = default values</span>
        </p>
      </div>
    </div>
  );
};

const PumpDataPreviewTable = ({
  rows,
  totalCount,
}: {
  rows: PumpPreviewRow[];
  totalCount: number;
}) => {
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
      <div className="max-h-[420px] overflow-auto">
        <table className="min-w-full text-sm text-slate-700">
          <thead className="sticky top-0 bg-slate-50 text-slate-500">
            <tr>
              <th className="w-16 px-5 py-4 text-left font-semibold">#</th>
              <th className="px-5 py-4 text-left font-semibold uppercase tracking-wide">
                ID <span className="text-red-400">*</span>
              </th>
              <th className="px-5 py-4 text-left font-semibold uppercase tracking-wide">
                Power
              </th>
              <th className="px-5 py-4 text-left font-semibold uppercase tracking-wide">
                Status
              </th>
              <th className="px-5 py-4 text-left font-semibold uppercase tracking-wide">
                Elevation
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rowNumber} className="border-t border-slate-200">
                <td className="px-5 py-4">{row.rowNumber}</td>
                <PreviewValueCell value={row.id} isDefault={row.idDefault} />
                <PreviewValueCell
                  value={row.power}
                  isDefault={row.powerDefault}
                />
                <PreviewValueCell
                  value={row.status}
                  isDefault={row.statusDefault}
                />
                <PreviewValueCell
                  value={row.elevation}
                  isDefault={row.elevationDefault}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-500">
        <p>
          Showing first {rows.length} of {totalCount} pump features
        </p>
        <p className="mt-1">
          Legend: Normal text = mapped data,{" "}
          <span className="italic">italic text = default values</span>
        </p>
      </div>
    </div>
  );
};

const PreviewValueCell = ({
  value,
  isDefault,
}: {
  value: string;
  isDefault: boolean;
}) => {
  return (
    <td
      className={
        isDefault
          ? "px-5 py-4 italic text-slate-400"
          : "px-5 py-4 text-slate-700"
      }
    >
      {value}
    </td>
  );
};

function isPipeGeometryFeature(feature: FeatureCollection["features"][number]) {
  return (
    feature.geometry?.type === "LineString" ||
    feature.geometry?.type === "MultiLineString"
  );
}

function isPumpGeometryFeature(feature: FeatureCollection["features"][number]) {
  return feature.geometry?.type === "Point";
}

function getPointCoordinates(
  feature: FeatureCollection["features"][number],
): [number, number] | null {
  if (feature.geometry?.type !== "Point") return null;

  const [lng, lat] = feature.geometry.coordinates;
  if (typeof lng !== "number" || typeof lat !== "number") return null;

  return [lng, lat];
}

function getMappedTextValue(
  properties: FeatureCollection["features"][number]["properties"],
  field: string | null,
): string | null {
  if (!field) return null;

  const rawValue = properties?.[field];
  if (typeof rawValue === "string" && rawValue.trim().length > 0) {
    return rawValue.trim();
  }

  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return String(rawValue);
  }

  return null;
}

function getMappedNumericValue(
  properties: FeatureCollection["features"][number]["properties"],
  field: string | null,
): number | null {
  if (!field) return null;

  const rawValue = properties?.[field];
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return rawValue;
  }

  if (typeof rawValue === "string" && rawValue.trim().length > 0) {
    const parsed = Number(rawValue);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function normalizePumpStatus(value: string | null): "on" | "off" {
  if (!value) return "on";

  const normalized = value.trim().toLowerCase();
  if (["off", "closed", "0", "false", "inactive"].includes(normalized)) {
    return "off";
  }

  return "on";
}
