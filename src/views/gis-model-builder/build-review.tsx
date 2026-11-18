import { Button } from "src/components/elements";
import { CheckIcon, DownloadIcon, PlayIcon, WarningIcon } from "src/icons";
import type {
  GisBuildProgress,
  GisBuildResult,
} from "src/lib/model-builder/build-types";
import {
  downloadText,
  featuresForLayer,
  roleNames,
  roleOrder,
  type BuilderLayer,
  type BuilderSettings,
  type BuilderSource,
} from "./data";
import { GeometryPreview } from "./preview";

export const BuildReview = ({
  settings,
  sources,
  layers,
  building,
  opening,
  progress,
  result,
  error,
  onBuild,
  onCancel,
  onOpenModel,
  acknowledged,
  onAcknowledge,
}: {
  settings: BuilderSettings;
  sources: BuilderSource[];
  layers: BuilderLayer[];
  building: boolean;
  opening: boolean;
  progress: GisBuildProgress;
  result: GisBuildResult | null;
  error: string | null;
  onBuild: () => void;
  onCancel: () => void;
  onOpenModel: () => void;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
}) => {
  const enabled = layers.filter(({ enabled }) => enabled);
  const unmapped = enabled.filter((layer) =>
    Object.values(layer.mapping ?? {}).every((value) => !value),
  );
  const hasNetwork = enabled.some(
    (layer) =>
      layer.role !== "customerPoint" &&
      layer.role !== "zone" &&
      featuresForLayer(layer).length > 0,
  );
  const blocked = !hasNetwork || (unmapped.length > 0 && !acknowledged);
  const hasErrors = result?.issues.some(({ severity }) => severity === "error");
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside className="w-full shrink-0 space-y-5 overflow-y-auto border-b p-5 lg:w-72 lg:border-b-0 lg:border-r">
        <div>
          <h2 className="text-sm font-semibold">Build summary</h2>
          <p className="mt-2 break-words text-base font-medium">
            {settings.name}
          </p>
          <p className="mt-1 text-xs text-subtle">
            {settings.unitSystem === "metric" ? "SI metric" : "US customary"} ·{" "}
            {settings.flowUnit} · {settings.headlossFormula}
          </p>
        </div>
        <dl className="space-y-3 text-sm">
          {roleOrder.map((role) => {
            const count = enabled
              .filter((layer) => layer.role === role)
              .reduce(
                (total, layer) => total + featuresForLayer(layer).length,
                0,
              );
            return (
              <div key={role} className="flex justify-between gap-3">
                <dt className="text-subtle">{roleNames[role]}</dt>
                <dd>{count.toLocaleString()}</dd>
              </div>
            );
          })}
        </dl>
        <p className="border-t pt-4 text-xs leading-relaxed text-subtle">
          Pipe endpoints generate junctions automatically. Nearby point assets
          and pipe endpoints connect within {settings.snapTolerance} m.
        </p>
        <p className="text-xs leading-relaxed text-subtle">
          Elevations:{" "}
          {settings.fetchElevations
            ? "automatic lookup enabled"
            : "source values only"}
          .
        </p>
        <p className="text-xs leading-relaxed text-subtle">
          {sources.length} data sources · {enabled.length} assignments. Missing
          hydraulic properties remain visible for review.
        </p>
      </aside>
      <section className="w-full shrink-0 space-y-5 overflow-y-auto border-b p-6 lg:w-[28rem] lg:border-b-0 lg:border-r">
        <h2 className="text-base font-semibold">
          {building
            ? "Building your model"
            : result
              ? "Build complete"
              : "Ready to build"}
        </h2>
        {!hasNetwork && (
          <div
            className="rounded-sm border bg-warning-subtle p-3 text-sm text-warning"
            role="alert"
          >
            Assign at least one nonempty network layer (pipes, junctions,
            reservoirs, tanks, pumps or valves) before building.
          </div>
        )}
        {!building && !result && (
          <p className="text-sm leading-relaxed text-subtle">
            The builder will apply mappings and rules, connect the network,
            create junctions, and check the resulting model.
          </p>
        )}
        {unmapped.length > 0 && !result && (
          <div className="space-y-3 rounded-sm border bg-warning-subtle p-3 text-sm">
            <p className="text-warning">
              {unmapped.length} assignment
              {unmapped.length === 1 ? " has" : "s have"} no source attributes
              mapped. IDs will be generated; other values use defaults or remain
              empty.
            </p>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 accent-accent"
                checked={acknowledged}
                disabled={building}
                onChange={(event) => onAcknowledge(event.target.checked)}
              />
              <span>
                Continue with geometry and defaults for these assignments.
              </span>
            </label>
          </div>
        )}
        {building && (
          <div className="space-y-3" role="status" aria-live="polite">
            <div className="flex justify-between gap-3 text-sm">
              <span>{progress.stage || "Preparing model"}</span>
              <span>{Math.round(progress.progress)}%</span>
            </div>
            <progress
              className="h-2 w-full accent-accent"
              value={progress.progress}
              max={100}
              aria-label="Model build progress"
            />
            <Button onClick={onCancel}>Cancel build</Button>
          </div>
        )}
        {(result?.stages ?? progress.completedStages ?? []).length > 0 && (
          <ol
            className="space-y-3 rounded-sm border p-4"
            aria-label="Completed build stages"
          >
            {(result?.stages ?? progress.completedStages ?? []).map(
              ({ stage, durationMs }, index) => (
                <li
                  key={`${stage}-${index}`}
                  className="flex items-center gap-3 text-sm"
                >
                  <CheckIcon size="sm" className="text-success" />
                  <span className="flex-1">{stage}</span>
                  <span className="text-xs text-subtle">
                    {(durationMs / 1000).toFixed(1)} s
                  </span>
                </li>
              ),
            )}
          </ol>
        )}
        {error && (
          <div
            className="rounded-sm border bg-error-subtle p-3 text-sm text-error"
            role="alert"
          >
            {error}
          </div>
        )}
        {result && (
          <>
            <div
              className={`flex items-start gap-3 rounded-sm border p-4 ${hasErrors ? "bg-warning-subtle text-warning" : "bg-success-subtle text-success"}`}
            >
              {hasErrors ? <WarningIcon /> : <CheckIcon />}
              <div>
                <p className="font-medium">
                  {result.assetCount.toLocaleString()} model elements prepared
                </p>
                <p className="mt-1 text-sm">
                  {hasErrors
                    ? "Resolve the errors below and build again."
                    : "Review the build report, then open the model in the workspace."}
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm">
              {Object.entries(result.summary).map(([name, value]) => (
                <div key={name} className="border-b pb-2">
                  <dt className="text-xs text-subtle">
                    {name.replace(/([a-z])([A-Z])/g, "$1 $2")}
                  </dt>
                  <dd className="mt-1 font-medium">{value.toLocaleString()}</dd>
                </div>
              ))}
            </dl>
            {result.issues.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium">
                  Build report ({result.issues.length.toLocaleString()})
                </h3>
                <ul className="max-h-72 space-y-2 overflow-y-auto">
                  {result.issues.slice(0, 300).map((issue, index) => (
                    <li
                      key={index}
                      className={`rounded-sm border p-3 text-sm ${issue.severity === "error" ? "bg-error-subtle text-error" : issue.severity === "warning" ? "bg-warning-subtle text-warning" : "bg-info-subtle text-info"}`}
                    >
                      <span className="font-medium capitalize">
                        {issue.severity}:{" "}
                      </span>
                      {issue.message}
                    </li>
                  ))}
                </ul>
                {result.issues.length > 300 && (
                  <p className="text-xs text-subtle">
                    Showing 300 notes. Download the report for all details.
                  </p>
                )}
                <Button
                  size="sm"
                  onClick={() =>
                    downloadText(
                      `${settings.name.replace(/[^a-z0-9_-]/gi, "-")}-build-report.json`,
                      JSON.stringify(
                        { modelName: settings.name, ...result },
                        null,
                        2,
                      ),
                    )
                  }
                >
                  <DownloadIcon size="sm" />
                  Download build report
                </Button>
              </div>
            )}
            <Button
              variant="primary"
              disabled={!!hasErrors || result.assetCount === 0 || opening}
              onClick={onOpenModel}
            >
              {opening ? "Opening model…" : "Open model"}
            </Button>
          </>
        )}
        {!building && (
          <Button
            variant={result ? "default" : "primary"}
            disabled={blocked}
            onClick={onBuild}
          >
            <PlayIcon size="sm" />
            {result ? "Build again" : "Build model"}
          </Button>
        )}
      </section>
      <GeometryPreview
        sources={sources}
        layers={layers.map((layer) => ({
          ...layer,
          features: featuresForLayer(layer),
        }))}
      />
    </div>
  );
};
