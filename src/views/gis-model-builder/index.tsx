import { useCallback, useEffect, useRef, useState } from "react";
import { parseGisSource } from "@epanet-js/gis-importers";
import type { SourceFile } from "@epanet-js/converters";
import type { Proj4Projection } from "@epanet-js/projections";
import type {
  GisBuildMetadata,
  GisBuildProgress,
  GisBuildResult,
} from "src/lib/model-builder/build-types";
import type {
  NetworkBuildOptions,
  NetworkLayer,
} from "src/lib/model-builder/network";
import {
  expandGisFiles,
  groupGisFiles,
} from "src/lib/model-builder/source-files";
import { useProjections } from "src/hooks/use-projections";
import { Button } from "src/components/elements";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CloseIcon,
  DownloadIcon,
  GlobeIcon,
  UploadIcon,
} from "src/icons";
import {
  defaultsForRole,
  downloadText,
  featuresForLayer,
  inferredMapping,
  initialSettings,
  layerAttributes,
  layersForSource,
  newBuilderId,
  parseBuildRecipe,
  restoreSourceLayers,
  saveBuildRecipe,
  sourceUnitsFor,
  valueAsText,
  type BuilderLayer,
  type BuilderSettings,
  type BuilderSource,
  type SavedBuildSettings,
} from "./data";
import { ModelSettings } from "./settings";
import { DataSources } from "./sources";
import { LayerAssignment, LayerList } from "./assignment";
import { AttributeMapping, SourceTable } from "./mapping";
import { BuildReview } from "./build-review";
import { MappedPreview } from "./mapped-preview";
import type { AssignmentPartition } from "./assignment-rules-data";

export type {
  GisBuildMetadata,
  GisBuildProgress,
  GisBuildResult,
} from "src/lib/model-builder/build-types";

type Props = {
  onClose: () => void;
  onBuild: (
    layers: NetworkLayer[],
    options: NetworkBuildOptions,
    metadata: GisBuildMetadata,
    onProgress?: (progress: GisBuildProgress) => void,
  ) => Promise<GisBuildResult>;
  onOpenModel: () => void | Promise<void>;
  onStepChange?: (step: string) => void;
};

const steps = [
  { id: "modelSettings", title: "Model settings" },
  { id: "dataSources", title: "Data sources" },
  { id: "layerAssignment", title: "Layer assignment" },
  { id: "attributeMapping", title: "Attribute mapping" },
  { id: "modelBuild", title: "Model build" },
];
const recentKey = "epanet-js.native-gis-build-settings.v1";

export const GisModelBuilder = ({
  onClose,
  onBuild,
  onOpenModel,
  onStepChange,
}: Props) => {
  const [settings, setSettings] = useState<BuilderSettings>(initialSettings);
  const [sources, setSources] = useState<BuilderSource[]>([]);
  const [layers, setLayers] = useState<BuilderLayer[]>([]);
  const [step, setStep] = useState(0);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<GisBuildProgress>({
    stage: "Preparing model",
    progress: 0,
  });
  const [result, setResult] = useState<GisBuildResult | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [previewMode, setPreviewMode] = useState<"imported" | "source">(
    "imported",
  );
  const [allowUnplaced, setAllowUnplaced] = useState(false);
  const [recipe, setRecipe] = useState<SavedBuildSettings | null>(null);
  const [recent, setRecent] = useState<SavedBuildSettings[]>(readRecent);
  const settingsInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const {
    projections,
    projectionsArray,
    loading: projectionsLoading,
    error: projectionsError,
  } = useProjections();
  const selectedLayer =
    layers.find(({ id }) => id === selectedLayerId) ?? layers[0];
  const readySources = sources.filter(({ status }) => status === "ready");
  const missingSources =
    recipe?.sourceNames.filter(
      (name) =>
        !sources.some(
          (source) => source.name.toLowerCase() === name.toLowerCase(),
        ),
    ) ?? [];
  const hasNetwork = layers.some(
    (layer) =>
      layer.enabled &&
      layer.role !== "customerPoint" &&
      layer.role !== "zone" &&
      featuresForLayer(layer).length > 0,
  );
  const sourcesReady =
    readySources.length > 0 &&
    ((readySources.length === sources.length && missingSources.length === 0) ||
      allowUnplaced);
  const canVisit = (index: number) =>
    index <= 1 || (index === 2 ? sourcesReady : sourcesReady && hasNetwork);
  const canContinue =
    step === 0
      ? true
      : step === 1
        ? sourcesReady
        : step === 2 || step === 3
          ? hasNetwork
          : true;

  const invalidate = useCallback(() => {
    setResult(null);
    setError(null);
    setAcknowledged(false);
  }, []);

  const remember = (
    nextSettings = settings,
    nextLayers = layers,
    nextSources = sources,
  ) => {
    const recipeSettings = {
      ...nextSettings,
      name: nextSettings.name.trim() || "Untitled GIS model",
    };
    const nextRecipe = saveBuildRecipe(recipeSettings, nextLayers, nextSources);
    const updated = [
      nextRecipe,
      ...recent.filter((value) => value.settings.name !== recipeSettings.name),
    ].slice(0, 6);
    setRecent(updated);
    try {
      window.localStorage.setItem(recentKey, JSON.stringify(updated));
    } catch {
      return;
    }
  };

  const goTo = (next: number) => {
    if (building || reading) return;
    remember();
    setStep(next);
    setError(null);
    onStepChange?.(steps[next].id);
  };

  const changeSettings = (next: BuilderSettings) => {
    invalidate();
    setSettings(next);
  };

  const changeLayer = (next: BuilderLayer) => {
    invalidate();
    setLayers((current) =>
      current.map((layer) => (layer.id === next.id ? next : layer)),
    );
  };

  const addFiles = async (incoming: SourceFile[]) => {
    if (reading || incoming.length === 0) return;
    setReading(true);
    setAllowUnplaced(false);
    setError(null);
    invalidate();
    try {
      const expanded = await expandGisFiles(incoming);
      const byName = new Map(
        sources
          .flatMap(({ files }) => files)
          .map((file) => [file.name.toLowerCase(), file]),
      );
      for (const file of expanded) byName.set(file.name.toLowerCase(), file);
      const groups = groupGisFiles([...byName.values()]);
      if (groups.length === 0)
        throw new Error(
          "No supported GIS files were found. Add GeoJSON, GeoJSONL, Shapefile, DXF, CSV or a ZIP containing those files.",
        );
      const nextSources: BuilderSource[] = [];
      const nextLayers: BuilderLayer[] = [];
      for (const group of groups) {
        const previous = sources.find(
          ({ name }) => name.toLowerCase() === group.name.toLowerCase(),
        );
        const savedSource = recipe?.sourceSettings?.find(
          ({ name }) => name.toLowerCase() === group.name.toLowerCase(),
        );
        const parsed = await readSource(
          group,
          projections ?? fallbackProjections,
          {
            id: previous?.id,
            epsg: previous?.epsg ?? savedSource?.epsg,
            coordinateAttributes:
              previous?.coordinateAttributes ??
              savedSource?.coordinateAttributes,
          },
        );
        nextSources.push(parsed);
        if (parsed.status !== "ready") continue;
        const existing = previous
          ? layers.filter(({ sourceId }) => sourceId === previous.id)
          : [];
        if (existing.length > 0) {
          for (const layer of existing) {
            const geometry = parsed.groups.find(
              (group) => group.geometry === layer.geometry,
            );
            if (geometry)
              nextLayers.push({
                ...layer,
                features: geometry.features,
                sourceName: parsed.name,
              });
          }
        } else
          nextLayers.push(
            ...(recipe
              ? restoreSourceLayers(parsed, recipe)
              : layersForSource(parsed, settings)),
          );
      }
      setSources(nextSources);
      setLayers(nextLayers);
      const needsAttention = nextSources.find(
        ({ status }) => status !== "ready",
      );
      setSelectedSourceId(
        needsAttention?.id ?? nextSources[nextSources.length - 1]?.id ?? null,
      );
      setSelectedLayerId(nextLayers[0]?.id ?? null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setReading(false);
    }
  };

  const reprojectSource = async (source: BuilderSource) => {
    setReading(true);
    invalidate();
    try {
      const parsed = await readSource(
        { name: source.name, files: source.files },
        projections ?? fallbackProjections,
        source,
      );
      setSources((current) =>
        current.map((value) => (value.id === source.id ? parsed : value)),
      );
      const existing = layers.filter(({ sourceId }) => sourceId === source.id);
      const assigned =
        parsed.status === "ready"
          ? existing.length > 0
            ? existing.flatMap((layer) => {
                const group = parsed.groups.find(
                  ({ geometry }) => geometry === layer.geometry,
                );
                return group ? [{ ...layer, features: group.features }] : [];
              })
            : recipe
              ? restoreSourceLayers(parsed, recipe)
              : layersForSource(parsed, settings)
          : [];
      setLayers((current) => [
        ...current.filter(({ sourceId }) => sourceId !== source.id),
        ...assigned,
      ]);
      if (assigned.length) setSelectedLayerId(assigned[0].id);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setReading(false);
    }
  };

  const removeSource = (id: string) => {
    invalidate();
    const source = sources.find((item) => item.id === id);
    setSources((current) => current.filter((item) => item.id !== id));
    setLayers((current) => current.filter((layer) => layer.sourceId !== id));
    setSelectedSourceId(null);
    if (source && recipe)
      setRecipe({
        ...recipe,
        sourceNames: recipe.sourceNames.filter(
          (name) => name.toLowerCase() !== source.name.toLowerCase(),
        ),
      });
  };

  const applyAssignmentRules = (
    layer: BuilderLayer,
    rules: AssignmentPartition["rules"],
    fallbackRole: BuilderLayer["role"] | null,
  ) => {
    const groupId = layer.partition?.groupId ?? newBuilderId();
    const siblings = layers.filter(
      (value) => value.partition?.groupId === groupId,
    );
    const configured = (
      role: BuilderLayer["role"],
      name: string,
      index: number | "fallback",
    ): BuilderLayer => {
      const previous = siblings.find(
        (value) => value.name === name && value.role === role,
      );
      const base = previous ?? layer;
      return {
        ...base,
        id: previous?.id ?? newBuilderId(),
        role,
        name,
        mapping:
          previous?.mapping ??
          (layer.role === role
            ? layer.mapping
            : inferredMapping(role, layerAttributes(layer, sources))),
        defaults:
          previous?.defaults ??
          (layer.role === role
            ? layer.defaults
            : defaultsForRole(role, settings)),
        rules: previous?.rules ?? (layer.role === role ? layer.rules : []),
        features: layer.features,
        partition: { rules, fallbackRole, index, groupId },
      };
    };
    const assigned = rules.flatMap((rule, index) =>
      rule.role
        ? [
            configured(
              rule.role,
              rule.name || `${layer.sourceName} · rule ${index + 1}`,
              index,
            ),
          ]
        : [],
    );
    if (fallbackRole)
      assigned.push(
        configured(
          fallbackRole,
          `${layer.sourceName} · remaining records`,
          "fallback",
        ),
      );
    invalidate();
    setLayers((current) => [
      ...current.filter(
        (value) =>
          value.id !== layer.id && value.partition?.groupId !== groupId,
      ),
      ...assigned,
    ]);
    setSelectedLayerId(assigned[0]?.id ?? null);
  };

  const loadRecipe = async (saved: SavedBuildSettings) => {
    invalidate();
    setSettings(saved.settings);
    setRecipe(saved);
    setAllowUnplaced(false);
    setStep(1);
    onStepChange?.(steps[1].id);
    setReading(true);
    try {
      const restoredSources: BuilderSource[] = [];
      for (const source of sources) {
        const savedSource = saved.sourceSettings?.find(
          ({ name }) => name.toLowerCase() === source.name.toLowerCase(),
        );
        restoredSources.push(
          await readSource(
            { name: source.name, files: source.files },
            projections ?? fallbackProjections,
            {
              id: source.id,
              epsg: savedSource?.epsg,
              coordinateAttributes: savedSource?.coordinateAttributes,
            },
          ),
        );
      }
      const restored = restoredSources
        .filter(({ status }) => status === "ready")
        .flatMap((source) => restoreSourceLayers(source, saved));
      setSources(restoredSources);
      setLayers(restored);
      setSelectedSourceId(
        restoredSources.find(({ status }) => status !== "ready")?.id ??
          restoredSources[0]?.id ??
          null,
      );
      setSelectedLayerId(restored[0]?.id ?? null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setReading(false);
    }
  };

  const saveSettingsFile = () => {
    remember();
    downloadText(
      `${settings.name.replace(/[^a-z0-9_-]/gi, "-") || "model"}-build-settings.json`,
      JSON.stringify(
        saveBuildRecipe(
          { ...settings, name: settings.name.trim() || "Untitled GIS model" },
          layers,
          sources,
        ),
        null,
        2,
      ),
    );
  };

  const build = async () => {
    if (building || !hasNetwork) return;
    const active = layers.filter(({ enabled }) => enabled);
    if (
      active.some((layer) =>
        Object.values(layer.mapping ?? {}).every((value) => !value),
      ) &&
      !acknowledged
    )
      return;
    remember();
    setResult(null);
    setError(null);
    setBuilding(true);
    setProgress({ stage: "Preparing model", progress: 0 });
    const abortController = new AbortController();
    controller.current = abortController;
    try {
      const report = await onBuild(
        active.map((layer) => ({
          ...layer,
          features: featuresForLayer(layer),
          filters: [],
        })),
        {
          units: sourceUnitsFor(settings),
          headlossFormula: settings.headlossFormula,
          snapTolerance: settings.snapTolerance,
          splitAtIntersections: settings.splitAtIntersections,
          splitAtVertices: settings.splitAtVertices,
          removeDuplicatePipes: settings.removeDuplicatePipes,
          keepLargestComponent: settings.keepLargestComponent,
          junctionDefaults:
            settings.junctionElevation === undefined
              ? undefined
              : { elevation: settings.junctionElevation },
          labelPrefixes: settings.labelPrefixes,
        },
        {
          name: settings.name.trim() || "Untitled GIS model",
          flowUnit: settings.flowUnit,
          unitSystem: settings.unitSystem,
          fetchElevations: settings.fetchElevations,
          signal: abortController.signal,
        },
        (value) => {
          if (!abortController.signal.aborted)
            setProgress({
              ...value,
              progress: Math.max(0, Math.min(100, value.progress * 100)),
            });
        },
      );
      if (!abortController.signal.aborted) {
        setResult(report);
        setProgress({ stage: "Complete", progress: 100 });
      } else
        setError(
          "Build canceled. Your files and mappings are ready to try again.",
        );
    } catch (cause) {
      setError(
        abortController.signal.aborted
          ? "Build canceled. Your files and mappings are ready to try again."
          : messageOf(cause),
      );
    } finally {
      controller.current = null;
      setBuilding(false);
    }
  };

  const openModel = async () => {
    setOpening(true);
    try {
      await onOpenModel();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-base text-default">
      <header className="flex min-h-12 shrink-0 items-center gap-3 border-b px-4">
        <Button
          variant="quiet"
          size="sm"
          aria-label="Close model builder"
          disabled={building || reading || opening}
          onClick={() => {
            remember();
            onClose();
          }}
        >
          <CloseIcon size="sm" />
        </Button>
        <GlobeIcon size="sm" />
        <h1 className="text-sm font-semibold">Model builder</h1>
        <span className="hidden min-w-0 truncate border-l pl-3 text-sm text-subtle sm:block">
          {settings.name || "Untitled model"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="quiet"
            size="sm"
            disabled={building || reading}
            onClick={saveSettingsFile}
            aria-label="Save build settings"
          >
            <DownloadIcon size="sm" />
            <span className="hidden xl:inline">Save settings</span>
          </Button>
          <Button
            variant="quiet"
            size="sm"
            disabled={building || reading}
            onClick={() => settingsInput.current?.click()}
            aria-label="Load build settings"
          >
            <UploadIcon size="sm" />
            <span className="hidden xl:inline">Load settings</span>
          </Button>
          <a
            className="ml-2 text-xs text-accent underline"
            href="https://help.epanetjs.com/workflows/build-a-model/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Read the guide
          </a>
        </div>
      </header>
      <nav
        className="flex shrink-0 overflow-x-auto border-b bg-panel px-3"
        aria-label="Model builder steps"
      >
        {steps.map(({ id, title }, index) => (
          <button
            type="button"
            key={id}
            disabled={building || reading || !canVisit(index)}
            aria-current={step === index ? "step" : undefined}
            className={`flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${step === index ? "border-accent font-medium text-accent" : "border-transparent text-subtle hover:bg-base-hover"}`}
            onClick={() => goTo(index)}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full border text-xs ${step === index ? "border-accent" : ""}`}
            >
              {index + 1}
            </span>
            {title}
          </button>
        ))}
      </nav>
      {error && step !== 4 && (
        <div
          className="flex items-start gap-3 border-b bg-error-subtle px-5 py-3 text-sm text-error"
          role="alert"
        >
          <p className="flex-1">{error}</p>
          <Button
            variant="quiet"
            size="sm"
            aria-label="Dismiss builder error"
            onClick={() => setError(null)}
          >
            <CloseIcon size="sm" />
          </Button>
        </div>
      )}
      {missingSources.length > 0 && step > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b bg-warning-subtle px-5 py-3 text-sm text-warning">
          <p className="min-w-0 flex-1">
            Saved settings are waiting for: {missingSources.join(", ")}. Add the
            original files to restore their assignments.
          </p>
          <Button size="sm" onClick={() => setRecipe(null)}>
            Use current files only
          </Button>
        </div>
      )}
      {step === 1 &&
        readySources.length > 0 &&
        (readySources.length < sources.length || missingSources.length > 0) && (
          <label className="flex items-start gap-3 border-b bg-warning-subtle px-5 py-3 text-sm text-warning">
            <input
              type="checkbox"
              className="mt-1 accent-accent"
              checked={allowUnplaced}
              onChange={(event) => setAllowUnplaced(event.target.checked)}
            />
            <span>
              Continue with the {readySources.length} ready source
              {readySources.length === 1 ? "" : "s"} and leave unplaced or
              missing files out of this build.
            </span>
          </label>
        )}
      <main className="flex min-h-0 flex-1 flex-col overflow-auto lg:overflow-hidden">
        {step === 0 && (
          <ModelSettings
            settings={settings}
            onChange={changeSettings}
            recent={recent}
            onLoad={(saved) => void loadRecipe(saved)}
            onNew={() => {
              remember();
              setSettings(initialSettings());
              setSources([]);
              setLayers([]);
              setRecipe(null);
              setSelectedLayerId(null);
              setSelectedSourceId(null);
              invalidate();
            }}
            onSaveFile={saveSettingsFile}
            onLoadFile={() => settingsInput.current?.click()}
          />
        )}
        {step === 1 && (
          <DataSources
            sources={sources}
            layers={layers}
            selectedId={selectedSourceId}
            onSelect={setSelectedSourceId}
            onFiles={addFiles}
            onRemove={removeSource}
            onReproject={reprojectSource}
            reading={reading}
            projectionCatalog={projectionsArray}
            projectionsLoading={projectionsLoading}
            projectionsError={projectionsError}
          />
        )}
        {step === 2 && (
          <LayerAssignment
            sources={sources}
            layers={layers}
            selectedId={selectedLayerId}
            onSelect={setSelectedLayerId}
            onChange={changeLayer}
            onApplyRules={applyAssignmentRules}
            onAddGroup={(source, geometry) => {
              const additions = layersForSource(source, settings)
                .filter((layer) => layer.geometry === geometry)
                .map((layer) => ({ ...layer, id: newBuilderId() }));
              invalidate();
              setLayers((current) => [...current, ...additions]);
              setSelectedLayerId(additions[0]?.id ?? null);
            }}
            onRemove={(id) => {
              invalidate();
              setLayers((current) =>
                current.filter((layer) => layer.id !== id),
              );
            }}
            onDuplicate={(layer) => {
              invalidate();
              const copy = {
                ...layer,
                id: newBuilderId(),
                name: `${layer.name} · filtered`,
                filters: [...(layer.filters ?? [])],
              };
              setLayers((current) => [...current, copy]);
              setSelectedLayerId(copy.id);
            }}
            onRoleChange={(layer, role) =>
              changeLayer({
                ...layer,
                role,
                mapping: inferredMapping(role, layerAttributes(layer, sources)),
                defaults: defaultsForRole(role, settings),
                rules: [],
              })
            }
            onSplit={(layer, attribute) => {
              const values = [
                ...new Map(
                  featuresForLayer(layer).map((feature) => {
                    const value: unknown = feature.properties?.[attribute];
                    return [valueAsText(value), value];
                  }),
                ).entries(),
              ];
              if (values.length > 20) return;
              const split = values.map(([text, value]) => ({
                ...layer,
                id: newBuilderId(),
                name: `${layer.name} · ${text || "empty"}`,
                filters: [
                  ...(layer.filters ?? []),
                  value == null || text.trim() === ""
                    ? { attribute, operator: "isEmpty" as const }
                    : {
                        attribute,
                        operator: "equals" as const,
                        value:
                          typeof value === "number" ||
                          typeof value === "boolean"
                            ? value
                            : text,
                      },
                ],
              }));
              invalidate();
              setLayers((current) => [
                ...current.filter(({ id }) => id !== layer.id),
                ...split,
              ]);
              setSelectedLayerId(split[0]?.id ?? null);
            }}
          />
        )}
        {step === 3 && (
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <LayerList
              sources={sources}
              layers={layers}
              selectedId={selectedLayer?.id ?? null}
              onSelect={setSelectedLayerId}
              onChange={changeLayer}
            />
            {selectedLayer ? (
              <>
                <div className="w-full shrink-0 overflow-y-auto border-b lg:w-[25rem] lg:border-b-0 lg:border-r">
                  <AttributeMapping
                    key={selectedLayer.id}
                    layer={selectedLayer}
                    attributes={layerAttributes(selectedLayer, sources)}
                    prefix={settings.labelPrefixes[selectedLayer.role] ?? ""}
                    onPrefixChange={(value) =>
                      changeSettings({
                        ...settings,
                        labelPrefixes: {
                          ...settings.labelPrefixes,
                          [selectedLayer.role]: value,
                        },
                      })
                    }
                    onChange={changeLayer}
                  />
                </div>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <div
                    className="flex shrink-0 gap-1 border-b px-3 py-2"
                    role="group"
                    aria-label="Data preview"
                  >
                    <Button
                      size="sm"
                      variant={previewMode === "imported" ? "default" : "quiet"}
                      aria-pressed={previewMode === "imported"}
                      onClick={() => setPreviewMode("imported")}
                    >
                      Imported preview
                    </Button>
                    <Button
                      size="sm"
                      variant={previewMode === "source" ? "default" : "quiet"}
                      aria-pressed={previewMode === "source"}
                      onClick={() => setPreviewMode("source")}
                    >
                      Source data
                    </Button>
                  </div>
                  {previewMode === "imported" ? (
                    <MappedPreview
                      layer={selectedLayer}
                      settings={settings}
                      sources={sources}
                    />
                  ) : (
                    <SourceTable
                      features={featuresForLayer(selectedLayer)}
                      attributes={layerAttributes(selectedLayer, sources)}
                    />
                  )}
                </div>
              </>
            ) : (
              <p className="m-auto p-8 text-sm text-subtle">
                Assign source geometry to a model layer first.
              </p>
            )}
          </div>
        )}
        {step === 4 && (
          <BuildReview
            settings={settings}
            sources={sources}
            layers={layers}
            building={building}
            opening={opening}
            progress={progress}
            result={result}
            error={error}
            onBuild={() => void build()}
            onCancel={() => controller.current?.abort()}
            onOpenModel={() => void openModel()}
            acknowledged={acknowledged}
            onAcknowledge={setAcknowledged}
          />
        )}
      </main>
      <footer className="flex min-h-14 shrink-0 items-center gap-3 border-t bg-base px-4 py-2">
        {step > 0 && (
          <Button
            disabled={building || reading || opening}
            onClick={() => goTo(step - 1)}
          >
            <ArrowLeftIcon size="sm" />
            {steps[step - 1].title}
          </Button>
        )}
        <span className="ml-auto text-xs text-subtle">
          {reading
            ? "Reading files…"
            : projectionsLoading && step === 1
              ? "Loading coordinate systems…"
              : `Step ${step + 1} of ${steps.length}`}
        </span>
        {step < 4 && (
          <Button
            variant="primary"
            disabled={!canContinue || reading || building}
            onClick={() => goTo(step + 1)}
          >
            {steps[step + 1].title}
            <ArrowRightIcon size="sm" />
          </Button>
        )}
      </footer>
      <input
        ref={settingsInput}
        hidden
        type="file"
        accept=".json,application/json"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          try {
            if (file.size > 5 * 1024 * 1024)
              throw new Error(
                "Build settings are too large. Choose a settings JSON file smaller than 5 MB.",
              );
            await loadRecipe(parseBuildRecipe(JSON.parse(await file.text())));
          } catch (cause) {
            setError(`Could not load build settings: ${messageOf(cause)}`);
          }
        }}
      />
    </div>
  );
};

const readRecent = (): SavedBuildSettings[] => {
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(recentKey) ?? "[]",
    );
    if (!Array.isArray(value)) return [];
    return value.slice(0, 6).flatMap((item: unknown) => {
      try {
        return [parseBuildRecipe(item)];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
};

const readSource = async (
  group: { name: string; files: SourceFile[] },
  projections: Map<string, Proj4Projection> | undefined,
  options: {
    id?: string;
    epsg?: number;
    coordinateAttributes?: { x: string; y: string };
  } = {},
): Promise<BuilderSource> => {
  const result = await parseGisSource({
    files: group.files,
    projections,
    crs: options.epsg ? { type: "epsg", code: options.epsg } : undefined,
    coordinateAttributes: options.coordinateAttributes,
  });
  const issues = result.issues.build();
  const blocking = issues.find(({ severity }) => severity === "error");
  const coordinateIssue = issues.some(
    ({ code }) =>
      code === "coordinateAttributesUnknown" ||
      code === "coordinateAttributesMissing",
  );
  const projectionIssue = issues.some(
    ({ code }) =>
      code === "coordinateSystemUnknown" ||
      code === "coordinateSystemUnsupported" ||
      code === "coordinateSystemMismatch" ||
      code === "coordinateSystemMissing",
  );
  const status = coordinateIssue
    ? "coordinates"
    : projectionIssue
      ? "projection"
      : blocking || result.features.length === 0
        ? "error"
        : "ready";
  return {
    id: options.id ?? newBuilderId(),
    name: group.name,
    fileNames: group.files.map(({ name }) => name),
    files: group.files,
    features: result.features,
    attributes: result.contents.attributes,
    groups: result.contents.groups,
    projection:
      result.sourceProjection?.name ??
      (options.epsg === 4326
        ? "EPSG:4326 · WGS84"
        : options.epsg
          ? `EPSG:${options.epsg}`
          : projectionIssue
            ? "Confirmation needed"
            : "WGS84"),
    warnings: issues
      .filter(({ severity }) => severity !== "error")
      .map(({ code }) => issueMessage(code)),
    status,
    error: coordinateIssue
      ? "Choose the columns containing X/longitude and Y/latitude, then confirm to place these records."
      : projectionIssue
        ? blocking
          ? issueMessage(blocking.code)
          : "Confirm the coordinate system so the source can be placed correctly."
        : blocking
          ? issueMessage(blocking.code)
          : result.features.length === 0
            ? "No usable geometry was found in this source."
            : undefined,
    epsg: options.epsg,
    coordinateAttributes: options.coordinateAttributes,
  };
};

const issueMessage = (code: string): string => {
  const messages: Record<string, string> = {
    sourceEmpty: "This source contains no usable records.",
    sourceUnreadable:
      "The source could not be read. Check that all required Shapefile parts are present and the file format is valid.",
    sourceHeaderMissing: "The table needs a header row naming its columns.",
    featureCoordinatesInvalid:
      "Some records had invalid or missing coordinates and were skipped.",
    coordinateSystemMissing:
      "The file did not state a coordinate system. Confirm WGS84 or select the correct EPSG code.",
    coordinateSystemUnknown:
      "Select the coordinate system used by these coordinates.",
    coordinateSystemUnsupported:
      "The coordinate system is not available. Choose a supported EPSG code or reproject the source to WGS84.",
    coordinateSystemMismatch:
      "The selected coordinate system does not match the coordinate values. Check the EPSG code and X/Y columns.",
    coordinateAttributesUnknown:
      "Select the X/longitude and Y/latitude columns.",
    coordinateAttributesMissing:
      "At least two numeric coordinate columns are required for a CSV source.",
  };
  return messages[code] ?? code.replace(/([a-z])([A-Z])/g, "$1 $2");
};

const messageOf = (cause: unknown): string =>
  cause instanceof Error
    ? cause.name === "ZodError"
      ? "This is not a supported GIS build-settings file."
      : cause.name === "SyntaxError"
        ? "The settings file does not contain valid JSON."
        : cause.message
    : "Something went wrong. Check the source files and try again.";

const fallbackProjections = new Map<string, Proj4Projection>([
  [
    "EPSG:3857",
    {
      type: "proj4",
      id: "EPSG:3857",
      name: "WGS 84 / Pseudo-Mercator",
      code: "EPSG:3857",
    },
  ],
]);
