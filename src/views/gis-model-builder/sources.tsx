import { useRef, useState } from "react";
import type { SourceFile } from "@epanet-js/converters";
import type { Proj4Projection } from "@epanet-js/projections";
import { Button } from "src/components/elements";
import { GisDropZone, type GisFiles } from "src/components/gis-drop-zone";
import {
  CheckIcon,
  CloseIcon,
  FileIcon,
  UploadIcon,
  WarningIcon,
} from "src/icons";
import type { BuilderLayer, BuilderSource } from "./data";
import { GeometryPreview } from "./preview";
import { controlClass, Field } from "./mapping";
import { ProjectionPicker } from "./projection-picker";

export const DataSources = ({
  sources,
  layers,
  selectedId,
  onSelect,
  onFiles,
  onRemove,
  onReproject,
  reading,
  projectionCatalog,
  projectionsLoading,
  projectionsError,
}: {
  sources: BuilderSource[];
  layers: BuilderLayer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onFiles: (files: SourceFile[]) => Promise<void>;
  onRemove: (id: string) => void;
  onReproject: (source: BuilderSource) => Promise<void>;
  reading: boolean;
  projectionCatalog: Proj4Projection[];
  projectionsLoading: boolean;
  projectionsError: string | null;
}) => {
  const upload = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<GisFiles>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const source = sources.find(({ id }) => id === selectedId);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside className="w-full shrink-0 space-y-4 overflow-y-auto border-b p-4 lg:w-72 lg:border-b-0 lg:border-r">
        <div>
          <h2 className="text-sm font-semibold">Data sources</h2>
          <p className="mt-1 text-xs text-subtle">
            Add each GIS file, or upload a ZIP containing multiple layers. Files
            stay on this computer.
          </p>
        </div>
        <div
          onDragOverCapture={(event) => {
            if (!reading) event.preventDefault();
          }}
          onDropCapture={(event) => {
            if (reading) return;
            const files = Array.from(event.dataTransfer.files);
            if (
              files.length > 1 ||
              files.some(({ name }) => /\.zip$/i.test(name))
            ) {
              event.preventDefault();
              event.stopPropagation();
              setUploadError(null);
              void onFiles(files);
            }
          }}
        >
          <GisDropZone
            selectedFiles={staged}
            onFileDrop={(files) => {
              setUploadError(null);
              setStaged(files);
            }}
            onFileRejected={(file) =>
              setUploadError(
                `${file.name} is not a supported GIS source. Use the multiple-files / ZIP option for archives and complete bundles.`,
              )
            }
            disabled={reading}
            supportedFormats={[
              "geojson",
              "geojsonl",
              "shapefile",
              "dxf",
              "csv",
            ]}
          />
        </div>
        {uploadError && (
          <p className="text-xs text-warning" role="alert">
            {uploadError}
          </p>
        )}
        {Object.values(staged).some(Boolean) && (
          <Button
            className="w-full"
            disabled={reading}
            onClick={async () => {
              await onFiles(
                Object.values(staged).filter((file): file is File => !!file),
              );
              setStaged({});
            }}
          >
            Add selected source
          </Button>
        )}
        <Button
          className="w-full"
          disabled={reading}
          onClick={() => upload.current?.click()}
        >
          <UploadIcon size="sm" />
          Multiple files / ZIP
        </Button>
        <input
          ref={upload}
          type="file"
          multiple
          hidden
          accept=".zip,.geojson,.json,.geojsonl,.shp,.dbf,.prj,.cpg,.shx,.dxf,.csv,.tsv"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length) void onFiles(files);
          }}
        />
        {reading && (
          <p className="text-sm text-info" role="status">
            Reading GIS files…
          </p>
        )}
        <ul className="space-y-1">
          {sources.map((item) => (
            <li
              key={item.id}
              className={`flex rounded-sm border ${selectedId === item.id ? "border-accent bg-base-active" : "border-transparent hover:bg-base-hover"}`}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-start gap-2 p-3 text-left text-sm"
                onClick={() => onSelect(item.id)}
                aria-pressed={selectedId === item.id}
              >
                <span
                  className={`mt-0.5 ${item.status === "ready" ? "text-success" : "text-warning"}`}
                >
                  {item.status === "ready" ? (
                    <CheckIcon size="sm" />
                  ) : (
                    <WarningIcon size="sm" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate" title={item.name}>
                    {item.name}
                  </span>
                  <span className="mt-1 block text-xs text-subtle">
                    {item.status === "ready"
                      ? `${item.features.length.toLocaleString()} records`
                      : item.status === "coordinates"
                        ? "Select coordinate columns"
                        : item.status === "projection"
                          ? "Confirm coordinate system"
                          : "Needs attention"}
                  </span>
                </span>
              </button>
              <Button
                className="self-start"
                size="sm"
                variant="quiet"
                disabled={reading}
                aria-label={`Remove source ${item.name}`}
                onClick={() => onRemove(item.id)}
              >
                <CloseIcon size="sm" />
              </Button>
            </li>
          ))}
        </ul>
      </aside>
      {source && (
        <SourceDetails
          key={source.id}
          source={source}
          reading={reading}
          onApply={onReproject}
          catalog={projectionCatalog}
          projectionsLoading={projectionsLoading}
          projectionsError={projectionsError}
        />
      )}
      <GeometryPreview
        key={selectedId ?? "all"}
        sources={sources}
        layers={layers}
        selectedSourceId={selectedId ?? undefined}
      />
    </div>
  );
};

const SourceDetails = ({
  source,
  reading,
  onApply,
  catalog,
  projectionsLoading,
  projectionsError,
}: {
  source: BuilderSource;
  reading: boolean;
  onApply: (source: BuilderSource) => Promise<void>;
  catalog: Proj4Projection[];
  projectionsLoading: boolean;
  projectionsError: string | null;
}) => {
  const [epsg, setEpsg] = useState(
    source.epsg?.toString() ??
      (source.status === "projection" &&
      source.features.some(({ geometry }) => geometry)
        ? "4326"
        : ""),
  );
  const [x, setX] = useState(
    source.coordinateAttributes?.x ?? guessCoordinate(source, "x"),
  );
  const [y, setY] = useState(
    source.coordinateAttributes?.y ?? guessCoordinate(source, "y"),
  );
  const isCsv = source.fileNames.some((name) => /\.(csv|tsv)$/i.test(name));
  const numeric = source.attributes.filter(({ type }) => type === "number");
  const needsCoordinates =
    isCsv && (source.status === "coordinates" || !source.coordinateAttributes);
  const apply = () =>
    onApply({
      ...source,
      epsg: epsg.trim() ? Number(epsg) : undefined,
      coordinateAttributes: isCsv && x && y ? { x, y } : undefined,
    });
  return (
    <section className="w-full shrink-0 space-y-5 overflow-y-auto border-b p-5 lg:w-80 lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-2">
        <FileIcon size="sm" />
        <h2
          className="min-w-0 truncate text-sm font-semibold"
          title={source.name}
        >
          {source.name}
        </h2>
      </div>
      <div className="space-y-1 text-xs text-subtle">
        {source.fileNames.map((name) => (
          <p key={name} className="break-all">
            {name}
          </p>
        ))}
      </div>
      {source.error && (
        <div
          className="rounded-sm border bg-warning-subtle p-3 text-sm text-warning"
          role="alert"
        >
          {source.error}
        </div>
      )}
      {isCsv && (
        <fieldset className="space-y-3">
          <legend className="mb-3 text-sm font-medium">CSV coordinates</legend>
          <Field label="X / Longitude">
            <select
              className={controlClass}
              value={x}
              onChange={(event) => setX(event.target.value)}
            >
              <option value="">Choose a numeric column</option>
              {numeric.map(({ name }) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </Field>
          <Field label="Y / Latitude">
            <select
              className={controlClass}
              value={y}
              onChange={(event) => setY(event.target.value)}
            >
              <option value="">Choose a numeric column</option>
              {numeric.map(({ name }) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </Field>
        </fieldset>
      )}
      <ProjectionPicker
        value={epsg}
        onChange={setEpsg}
        disabled={reading}
        catalog={catalog}
        loading={projectionsLoading}
        error={projectionsError}
      />
      <p className="text-xs text-subtle">
        Detected: {source.projection || "Not yet determined"}
      </p>
      <Button
        variant={source.status === "ready" ? "default" : "primary"}
        disabled={
          reading ||
          (needsCoordinates && (!x || !y || x === y)) ||
          (epsg !== "" &&
            (!Number.isInteger(Number(epsg)) || Number(epsg) <= 0))
        }
        onClick={() => void apply()}
      >
        {source.status === "ready"
          ? "Apply coordinate settings"
          : "Confirm and read source"}
      </Button>
      {source.status === "ready" && (
        <div className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-medium">Source contents</h3>
          {source.groups.map(({ geometry, features }) => (
            <p key={geometry} className="flex justify-between text-sm">
              <span className="capitalize">{geometry} records</span>
              <span>{features.length.toLocaleString()}</span>
            </p>
          ))}
          <p className="text-xs text-subtle">
            {source.attributes.length} attributes · Converted to WGS84 for the
            model.
          </p>
        </div>
      )}
      {source.warnings.length > 0 && (
        <details className="border-t pt-4 text-xs text-subtle">
          <summary className="cursor-pointer">
            Source notes ({source.warnings.length})
          </summary>
          <ul className="mt-3 list-disc space-y-2 pl-4">
            {source.warnings.slice(0, 20).map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
};

const guessCoordinate = (source: BuilderSource, axis: "x" | "y") => {
  const names =
    axis === "x"
      ? ["longitude", "lon", "lng", "x", "easting"]
      : ["latitude", "lat", "y", "northing"];
  return (
    source.attributes.find(({ name }) => names.includes(name.toLowerCase()))
      ?.name ?? ""
  );
};
