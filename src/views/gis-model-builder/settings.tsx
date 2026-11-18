import type { FlowUnit } from "@epanet-js/quantity";
import { Button } from "src/components/elements";
import { DownloadIcon, UploadIcon } from "src/icons";
import {
  flowUnits,
  type BuilderSettings,
  type SavedBuildSettings,
} from "./data";
import { controlClass, Field } from "./mapping";
import { NetworkIllustration } from "./preview";

export const ModelSettings = ({
  settings,
  onChange,
  recent,
  onLoad,
  onNew,
  onSaveFile,
  onLoadFile,
}: {
  settings: BuilderSettings;
  onChange: (settings: BuilderSettings) => void;
  recent: SavedBuildSettings[];
  onLoad: (recipe: SavedBuildSettings) => void;
  onNew: () => void;
  onSaveFile: () => void;
  onLoadFile: () => void;
}) => (
  <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
    <aside className="w-full shrink-0 space-y-5 overflow-y-auto border-b p-4 lg:w-64 lg:border-b-0 lg:border-r">
      <div>
        <h2 className="text-sm font-semibold">Create</h2>
        <Button className="mt-3 w-full justify-start" onClick={onNew}>
          New build
        </Button>
      </div>
      <div className="space-y-2">
        <Button
          className="w-full justify-start"
          variant="quiet"
          onClick={onLoadFile}
        >
          <UploadIcon size="sm" />
          Load build settings
        </Button>
        <Button
          className="w-full justify-start"
          variant="quiet"
          onClick={onSaveFile}
        >
          <DownloadIcon size="sm" />
          Save build settings
        </Button>
      </div>
      {recent.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">
            Recent builds
          </h3>
          <ul className="mt-2 space-y-1">
            {recent.map((recipe, index) => (
              <li key={`${recipe.settings.name}-${index}`}>
                <button
                  type="button"
                  className="w-full rounded-sm p-3 text-left text-sm hover:bg-base-hover"
                  onClick={() => onLoad(recipe)}
                >
                  <span className="block truncate">{recipe.settings.name}</span>
                  <span className="mt-1 block text-xs text-subtle">
                    {recipe.sourceNames.length} sources ·{" "}
                    {new Date(recipe.savedAt).toLocaleDateString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs leading-relaxed text-subtle">
        Build settings remember mappings and file names. Add the original GIS
        files again when continuing a saved build.
      </p>
    </aside>
    <section className="w-full shrink-0 space-y-5 overflow-y-auto border-b p-5 lg:w-96 lg:border-b-0 lg:border-r">
      <h2 className="text-sm font-semibold">Model settings</h2>
      <Field label="Name">
        <input
          className={controlClass}
          value={settings.name}
          maxLength={120}
          placeholder="Name your model"
          onChange={(event) =>
            onChange({ ...settings, name: event.target.value })
          }
        />
      </Field>
      <Field label="Unit system">
        <select
          className={controlClass}
          value={settings.unitSystem}
          onChange={(event) => {
            const unitSystem = event.target.value as "metric" | "us";
            onChange({
              ...settings,
              unitSystem,
              flowUnit: unitSystem === "us" ? "gal/min" : "l/s",
            });
          }}
        >
          <option value="metric">SI metric</option>
          <option value="us">US customary</option>
        </select>
      </Field>
      <Field label="Flow units">
        <select
          className={controlClass}
          value={settings.flowUnit}
          onChange={(event) => {
            const flowUnit = event.target.value as FlowUnit;
            onChange({
              ...settings,
              flowUnit,
              unitSystem:
                flowUnits.find(({ value }) => value === flowUnit)?.system ??
                settings.unitSystem,
            });
          }}
        >
          {flowUnits.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Headloss formula">
        <select
          className={controlClass}
          value={settings.headlossFormula}
          onChange={(event) =>
            onChange({
              ...settings,
              headlossFormula: event.target
                .value as BuilderSettings["headlossFormula"],
            })
          }
        >
          <option value="H-W">Hazen-Williams</option>
          <option value="D-W">Darcy-Weisbach</option>
          <option value="C-M">Chezy-Manning</option>
        </select>
      </Field>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1 accent-accent"
          checked={settings.fetchElevations}
          onChange={(event) =>
            onChange({ ...settings, fetchElevations: event.target.checked })
          }
        />
        <span>
          <span className="block">Fetch ground elevations</span>
          <span className="mt-1 block text-xs leading-relaxed text-subtle">
            Look up elevations for junctions and tanks during the build. Source
            elevation mappings take precedence.
          </span>
        </span>
      </label>
      <details className="space-y-4 border-t pt-4">
        <summary className="cursor-pointer text-sm font-medium">
          Advanced topology settings
        </summary>
        <div className="space-y-4 pt-3">
          <Field
            label="Snap tolerance (meters)"
            hint="Connect nearby endpoints and point assets. The standard tolerance is 0.1 m."
          >
            <input
              type="number"
              className={controlClass}
              min="0"
              max="1000"
              step="0.1"
              value={settings.snapTolerance}
              onChange={(event) =>
                onChange({
                  ...settings,
                  snapTolerance: Math.max(0, Number(event.target.value)),
                })
              }
            />
          </Field>
          <Field
            label="Fallback junction elevation"
            hint="Optional. Leave empty to keep missing elevations visible in the review."
          >
            <input
              type="number"
              className={controlClass}
              step="any"
              placeholder="Empty"
              value={settings.junctionElevation ?? ""}
              onChange={(event) =>
                onChange({
                  ...settings,
                  junctionElevation:
                    event.target.value === ""
                      ? undefined
                      : Number(event.target.value),
                })
              }
            />
          </Field>
          {(
            [
              [
                "splitAtIntersections",
                "Connect pure line crossings",
                "Creates junctions where lines cross. Off by default because crossing mains may not be connected.",
              ],
              [
                "splitAtVertices",
                "Create junctions at every pipe vertex",
                "Off by default; bends normally stay as pipe geometry.",
              ],
              [
                "removeDuplicatePipes",
                "Remove coincident duplicate pipes",
                "Keeps one pipe when duplicate line geometry is detected.",
              ],
              [
                "keepLargestComponent",
                "Keep only the largest connected network",
                "Drops other disconnected components. Leave off to review all imported assets.",
              ],
            ] as const
          ).map(([key, label, hint]) => (
            <label key={key} className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 accent-accent"
                checked={settings[key]}
                onChange={(event) =>
                  onChange({ ...settings, [key]: event.target.checked })
                }
              />
              <span>
                <span className="block">{label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-subtle">
                  {hint}
                </span>
              </span>
            </label>
          ))}
        </div>
      </details>
    </section>
    <section className="flex min-h-72 min-w-0 flex-1 items-center justify-center bg-panel p-8">
      <div className="max-w-lg text-center">
        <NetworkIllustration />
        <h2 className="mt-8 text-sm font-semibold">
          Turn GIS files into an EPANET model
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-subtle">
          Bring together pipes, junctions, reservoirs, tanks, pumps, valves,
          customer points and zones. Review the topology and attributes before
          opening your model.
        </p>
        <p className="mt-5 text-xs text-subtle">
          GeoJSON · GeoJSONL · Shapefile · DXF · CSV · ZIP
        </p>
      </div>
    </section>
  </div>
);
