import bbox from "@turf/bbox";
import type { FeatureCollection } from "geojson";
import "mapbox-gl/dist/mapbox-gl.css";
import { LngLat } from "mapbox-gl";
import { useEffect, useMemo, useState } from "react";
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
import { usePersistence } from "src/lib/persistence";
import { initializeHydraulicModel } from "src/hydraulic-model";
import { initializeModelFactories } from "src/hydraulic-model/factories";
import { LabelManager } from "src/hydraulic-model/label-manager";
import { ConsecutiveIdsGenerator } from "src/lib/id-generator";
import { defaultSimulationSettings } from "src/simulation/simulation-settings";
import { fileInfoAtom } from "src/state/file-system";
import { convertTo } from "src/quantity";
import { useToggleNetworkReview } from "src/commands/toggle-network-review";
import { useElevations } from "src/map/elevations/use-elevations";

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

type UnitSystem = "us" | "metric";
type ElementAssignment = "pipes";

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
  const [apiSource, setApiSource] = useState<ImportedApiSource | null>(null);
  const [apiAssignment, setApiAssignment] = useState<ElementAssignment | null>(
    null,
  );
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
  const [junctionElevationField, setJunctionElevationField] = useState<
    string | null
  >(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const { fitToBbox, fitToNetwork, setHandle } = useMapPreview();
  const currentProjectSettings = useAtomValue(projectSettingsAtom);
  const setFileInfo = useSetAtom(fileInfoAtom);
  const rep = usePersistence();
  const transactImport = rep.useTransactImport();
  const toggleNetworkReview = useToggleNetworkReview();
  const assignedElementCount = apiSource && apiAssignment ? 1 : 0;
  const selectedSpec = useMemo(() => presets[flowUnit], [flowUnit]);
  const { fetchElevation } = useElevations(selectedSpec.units.elevation);

  const propertyOptions = useMemo(
    () =>
      (apiSource?.propertyNames ?? []).map((property) => ({
        value: property,
        label: property,
      })),
    [apiSource],
  );

  const pipeFeatures = useMemo(
    () =>
      apiSource && apiAssignment === "pipes"
        ? apiSource.previewGeoJson.features.filter(isPipeGeometryFeature)
        : null,
    [apiAssignment, apiSource],
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

  const networkDraft = useMemo(
    () =>
      apiSource && apiAssignment === "pipes"
        ? buildApiNetworkPreview(apiSource.previewGeoJson, {
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
          })
        : null,
    [
      apiAssignment,
      apiSource,
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
    if (!apiSource || !apiAssignment) return;

    if (apiSource.bbox) {
      fitToBbox(apiSource.bbox);
      return;
    }

    if (apiSource.previewGeoJson.features.length > 0) {
      fitToNetwork(apiSource.previewGeoJson);
    }
  }, [apiAssignment, apiSource, fitToBbox, fitToNetwork]);

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
                (currentStep === 2 && (!apiSource || !apiAssignment)) ||
                (currentStep === 3 &&
                  (!pipeFeatures || pipeFeatures.length === 0)),
            }
          : undefined
      }
      finishAction={
        currentStep === STEP_COUNT
          ? {
              onClick: () => {
                void handleBuildModel();
              },
              disabled: !networkDraft || networkDraft.pipes.length === 0,
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
      setApiSource(parsedSource);
      setApiAssignment(null);
      setPipeLabelField(null);
      setPipeDiameterField(null);
      setPipeRoughnessField(null);
      setPipeMinorLossField(null);
      setPipeStatusField(null);
      setJunctionElevationField(null);
    } catch (error) {
      setApiSource(null);
      setApiAssignment(null);
      setApiError(
        error instanceof Error
          ? error.message
          : translate("importFromGISApiWizard.dataAssignment.loadFailed"),
      );
    } finally {
      setApiLoading(false);
    }
  };

  const handleBuildModel = async () => {
    if (!networkDraft || !apiSource) return;

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
      const junctionDrafts = junctionElevationField
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

      for (const junctionDraft of junctionDrafts) {
        const junction = factories.assetFactory.createJunction({
          label: junctionDraft.label,
          coordinates: junctionDraft.coordinates,
          elevation: junctionDraft.elevation,
          emitterCoefficient: junctionDraft.emitterCoefficient,
        });

        hydraulicModel.assets.set(junction.id, junction);
        junctionIdByDraftId.set(junctionDraft.id, junction.id);
      }

      for (const pipeDraft of networkDraft.pipes) {
        const startNodeId = junctionIdByDraftId.get(pipeDraft.startJunctionId);
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
        hydraulicModel.topology.addLink(pipe.id, startNodeId, endNodeId);
      }

      transactImport(
        hydraulicModel,
        factories,
        idGenerator,
        {
          ...currentProjectSettings,
          units: spec.units,
          defaults: spec.defaults,
          headlossFormula,
          formatting: {
            decimals: spec.decimals,
            defaultDecimals: 3,
          },
        },
        apiSource.name,
        defaultSimulationSettings,
        {
          autoElevations: currentProjectSettings.projection.type !== "xy-grid",
        },
      );

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

      <WizardContent minHeight="540px">
        {currentStep === 1 ? (
          <div className="flex-1 grid gap-6 xl:grid-cols-[1fr_0.95fr] pb-4">
            <section className="rounded-2xl border border-gray-200 bg-white p-7">
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

            <section className="rounded-2xl border border-gray-200 bg-white p-7">
              <h2 className="text-2xl font-semibold text-gray-900">
                {translate("importFromGISApiWizard.tutorial.title")}
              </h2>

              <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-8 min-h-[320px] flex items-center justify-center text-center">
                <div>
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-purple-100 text-purple-700 text-xl font-semibold">
                    1
                  </div>
                  <p className="mt-4 text-base font-medium text-gray-900">
                    {translate("importFromGISApiWizard.tutorial.stepTitle")}
                  </p>
                  <p className="mt-2 text-sm text-gray-600">
                    {translate(
                      "importFromGISApiWizard.tutorial.stepDescription",
                    )}
                  </p>
                </div>
              </div>

              <p className="mt-6 text-lg leading-8 text-gray-700">
                {translate("importFromGISApiWizard.tutorial.description")}
              </p>

              <Button
                variant="quiet"
                size="sm"
                className="mt-4 px-0 text-purple-600 hover:text-purple-700"
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

              <div className="mt-6">
                <div className="text-xl text-gray-900">
                  {translate(
                    apiAssignment
                      ? "importFromGISApiWizard.dataAssignment.assignedApis"
                      : "importFromGISApiWizard.dataAssignment.unassignedApis",
                    apiSource ? 1 : 0,
                  )}
                </div>

                {apiSource ? (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                    <div className="flex items-start justify-between gap-4 min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3">
                          <span className="h-4 w-4 rounded-full bg-blue-500 shrink-0" />
                          <h3 className="truncate text-2xl font-semibold text-gray-900">
                            {apiSource.name}
                          </h3>
                        </div>
                        <p className="mt-3 break-words text-base text-slate-600">
                          {apiSource.geometryType} • {apiSource.featureCount}{" "}
                          {translate(
                            "importFromGISApiWizard.dataAssignment.features",
                          )}
                        </p>
                        <div className="mt-4 max-w-[300px]">
                          <Selector
                            selected={apiAssignment}
                            onChange={(value) => setApiAssignment(value)}
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
                            ]}
                            ariaLabel={translate(
                              "importFromGISApiWizard.dataAssignment.assignLabel",
                            )}
                            styleOptions={{ textSize: "text-sm", paddingY: 3 }}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        className="text-slate-500 hover:text-slate-700"
                        onClick={() => {
                          setApiSource(null);
                          setApiAssignment(null);
                          setApiError(null);
                          setJunctionElevationField(null);
                        }}
                        aria-label={translate("delete")}
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">
                    {translate(
                      "importFromGISApiWizard.dataAssignment.noApiAssigned",
                    )}
                  </div>
                )}
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
                {apiSource && apiAssignment ? (
                  <div className="flex h-full flex-col p-8">
                    <div className="h-[420px] overflow-hidden rounded-2xl border border-white/70 bg-white shadow-sm">
                      <MapPreview
                        geoJSON={apiSource.previewGeoJson}
                        showBasemap
                        isLoading={apiLoading}
                        setHandle={setHandle}
                      />
                    </div>

                    <div className="mt-4 rounded-2xl border border-gray-200 bg-white px-5 py-4">
                      <div className="flex items-center gap-3 text-lg text-slate-700">
                        <span className="h-3 w-3 rounded-full bg-blue-500" />
                        <span>
                          {apiSource.name} (
                          {apiSource.featureCount.toLocaleString()})
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

              {!apiSource || apiAssignment !== "pipes" ? (
                <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">
                  Load a GIS API source in Step 2 and assign it to pipes before
                  mapping attributes.
                </div>
              ) : (
                <div className="mt-8">
                  <p className="text-lg leading-8 text-slate-600">
                    Map the properties from your GIS data to EPANET attributes.
                    Connectivity will be derived automatically, and junction
                    elevations can either be mapped from your GIS API data or
                    generated automatically from the configured terrain data.
                  </p>

                  <div className="mt-8 rounded-2xl bg-slate-100 p-3">
                    <div className="inline-flex rounded-xl bg-white px-8 py-3 text-lg font-semibold text-slate-800 shadow-sm">
                      Pipes ({pipeFeatures?.length ?? 0})
                    </div>
                  </div>

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
                          options={propertyOptions}
                          placeholder="Select property..."
                          onChange={setPipeLabelField}
                        />
                        <MappingSelector
                          label="Diameter"
                          value={pipeDiameterField}
                          options={propertyOptions}
                          placeholder="Select property..."
                          onChange={setPipeDiameterField}
                        />
                        <MappingSelector
                          label="Roughness"
                          value={pipeRoughnessField}
                          options={propertyOptions}
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
                          options={propertyOptions}
                          placeholder="Select property..."
                          onChange={setPipeMinorLossField}
                        />
                        <MappingSelector
                          label="Status"
                          value={pipeStatusField}
                          options={propertyOptions}
                          placeholder="Select property..."
                          onChange={setPipeStatusField}
                        />
                      </div>
                    </div>
                  </div>

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
                          options={propertyOptions}
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

                  <div className="mt-10">
                    <h3 className="text-2xl font-semibold text-slate-900">
                      Pipe Data Preview
                    </h3>
                    <PipeDataPreviewTable
                      rows={pipePreviewRows}
                      totalCount={pipeFeatures?.length ?? 0}
                    />
                  </div>

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
              {!networkDraft ? (
                <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">
                  Complete the data assignment and attribute mapping first.
                </div>
              ) : (
                <div className="mt-8 space-y-6">
                  <p className="text-lg leading-8 text-slate-600">
                    We&apos;ll build a new EPANET model from your GIS pipes and
                    derive junctions from the line endpoints. Missing mapped
                    values will fall back to defaults automatically.
                  </p>

                  <div className="grid gap-4 md:grid-cols-3">
                    <BuildSummaryCard
                      label="Source"
                      value={apiSource?.name ?? "GIS API"}
                    />
                    <BuildSummaryCard
                      label="Pipes"
                      value={String(networkDraft.pipes.length)}
                    />
                    <BuildSummaryCard
                      label="Junctions"
                      value={String(networkDraft.junctions.length)}
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
