import bbox from "@turf/bbox";
import type { FeatureCollection } from "geojson";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useMemo, useState } from "react";
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
import { Presets } from "src/lib/project-settings/quantities-spec";
import { HeadlossFormula } from "src/hydraulic-model";
import { headlossFormulasFullNames } from "src/hydraulic-model/asset-types/pipe";
import { DisconnectIcon, UploadIcon, CloseIcon } from "src/icons";
import { MapPreview } from "./network-projection/map-preview";
import { useMapPreview } from "./network-projection/use-map-preview";

type ImportedApiSource = {
  name: string;
  url: string;
  featureCount: number;
  geometryType: string;
  bbox: [number, number, number, number] | null;
  crsName: string | null;
  firstFeatureId: string | null;
  sampleProperties: string[];
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

  if (!data || data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    throw new Error("API did not return a valid GeoJSON FeatureCollection.");
  }

  const featureCount = data.totalFeatures ?? data.features.length;
  const firstFeature = data.features.find((feature) => feature.geometry);
  const firstFeatureId =
    firstFeature && "id" in firstFeature ? String(firstFeature.id ?? "") : null;
  const geometryType = firstFeature?.geometry?.type ?? "Unknown geometry";
  const extent =
    data.features.length > 0 ? (bbox(data) as [number, number, number, number]) : null;
  const crsName = data.crs?.properties?.name ?? null;
  const sampleProperties = firstFeature?.properties
    ? Object.keys(firstFeature.properties).slice(0, 5)
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
    sampleProperties,
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

export const ModelBuilderApiDialog = ({
  onClose,
}: {
  onClose: () => void;
}) => {
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
  const { fitToBbox, fitToNetwork, setHandle } = useMapPreview();
  const assignedElementCount = apiSource && apiAssignment ? 1 : 0;

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
            }
          : undefined
      }
      nextAction={
        currentStep < STEP_COUNT
          ? {
              onClick: () =>
                setCurrentStep((step) => Math.min(STEP_COUNT, step + 1)),
              disabled: currentStep === 2 && (!apiSource || !apiAssignment),
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
                    {translate("importFromGISApiWizard.tutorial.stepDescription")}
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
                onClick={() => window.open("https://help.epanetjs.com", "_blank")}
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
                  name={translate("importFromGISApiWizard.dataAssignment.apiUrl")}
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
                          {translate("importFromGISApiWizard.dataAssignment.features")}
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
                        }}
                        aria-label={translate("delete")}
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">
                    {translate("importFromGISApiWizard.dataAssignment.noApiAssigned")}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-7">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-2xl font-semibold text-gray-900">
                  {translate("importFromGISApiWizard.dataAssignment.previewTitle")}
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
                          {apiSource.name} ({apiSource.featureCount.toLocaleString()})
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
          <PlaceholderStep
            title={translate("importFromGISApiWizard.steps.attributeMapping")}
          />
        ) : (
          <PlaceholderStep
            title={translate("importFromGISApiWizard.steps.modelBuild")}
          />
        )}
      </WizardContent>
    </WizardContainer>
  );
};
