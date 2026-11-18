import { useId, useMemo, useState } from "react";
import type { Proj4Projection } from "@epanet-js/projections";
import { useProjections } from "src/hooks/use-projections";
import { controlClass } from "./mapping";

type ProjectionChoice = {
  code: string;
  name: string;
  deprecated?: boolean;
};

const commonProjections: ProjectionChoice[] = [
  { code: "4326", name: "WGS 84 (longitude / latitude)" },
  { code: "3857", name: "WGS 84 / Pseudo-Mercator" },
];

type ProjectionPickerProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  catalog?: Proj4Projection[];
  loading?: boolean;
  error?: string | null;
};

export const ProjectionPicker = (props: ProjectionPickerProps) =>
  props.catalog !== undefined ? (
    <ProjectionPickerContents {...props} catalog={props.catalog} />
  ) : (
    <ProjectionPickerWithCatalog {...props} />
  );

const ProjectionPickerWithCatalog = (props: ProjectionPickerProps) => {
  const { projectionsArray, loading, error } = useProjections();
  return (
    <ProjectionPickerContents
      {...props}
      catalog={projectionsArray}
      loading={loading}
      error={error}
    />
  );
};

const ProjectionPickerContents = ({
  value,
  onChange,
  disabled = false,
  catalog,
  loading = false,
  error,
}: ProjectionPickerProps & { catalog: Proj4Projection[] }) => {
  const id = useId();
  const [query, setQuery] = useState("");
  const choices = useMemo(() => {
    const byCode = new Map(
      commonProjections.map((projection) => [projection.code, projection]),
    );
    for (const projection of catalog) {
      const code = numericEpsgCode(projection.id);
      if (code !== null) {
        byCode.set(code, {
          code,
          name: projection.name,
          deprecated: projection.deprecated,
        });
      }
    }
    return [...byCode.values()];
  }, [catalog]);
  const search = useMemo(() => {
    const normalized = query
      .trim()
      .toLowerCase()
      .replace(/^epsg\s*:?\s*/, "");
    if (!normalized) return { matches: [], total: 0 };
    const terms = normalized.split(/\s+/);
    const matches = choices.filter((projection) => {
      const searchable = `${projection.name} ${projection.code}`.toLowerCase();
      return terms.every((term) => searchable.includes(term));
    });
    matches.sort(
      (first, second) =>
        matchRank(first, normalized) - matchRank(second, normalized) ||
        first.name.localeCompare(second.name) ||
        Number(first.code) - Number(second.code),
    );
    return { matches: matches.slice(0, 50), total: matches.length };
  }, [choices, query]);
  const selected = choices.find(
    (projection) => projection.code === numericEpsgCode(value),
  );

  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="mb-2 text-sm font-medium">Coordinate system</legend>
      <div className="space-y-1.5">
        <label className="block text-sm text-subtle" htmlFor={`${id}-code`}>
          EPSG code
        </label>
        <input
          id={`${id}-code`}
          className={controlClass}
          type="number"
          min="1"
          step="1"
          placeholder="Automatic / EPSG code"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={`${id}-selected ${id}-hint`}
        />
        <p
          id={`${id}-selected`}
          className="text-xs text-subtle"
          aria-live="polite"
        >
          {value.trim() === ""
            ? "Automatic detection"
            : selected
              ? `EPSG:${selected.code} · ${selected.name}`
              : `EPSG:${value} · Enter the code provided with your GIS data`}
        </p>
      </div>
      <div className="space-y-1.5">
        <label className="block text-sm text-subtle" htmlFor={`${id}-search`}>
          Find a projection
        </label>
        <input
          id={`${id}-search`}
          className={controlClass}
          type="search"
          placeholder="Projection name or EPSG…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-controls={`${id}-results`}
          aria-describedby={`${id}-results-summary`}
        />
      </div>
      <p id={`${id}-hint`} className="text-xs leading-relaxed text-subtle">
        Search by name or code, or enter an EPSG code directly. Use 4326 for
        longitude / latitude.
      </p>
      {loading && (
        <p className="text-xs text-subtle" role="status">
          Loading coordinate systems…
        </p>
      )}
      {error && (
        <p className="text-xs text-subtle">
          The projection catalogue could not load. Manual EPSG entry and the
          built-in WGS 84 choices are still available.
        </p>
      )}
      <p
        id={`${id}-results-summary`}
        className="text-xs text-subtle"
        role="status"
      >
        {query.trim() === ""
          ? "Type a name or EPSG code to search."
          : search.total === 0
            ? "No matching projection. You can enter its EPSG code directly."
            : `${search.matches.length} of ${search.total} matching coordinate systems`}
      </p>
      <ul
        id={`${id}-results`}
        aria-label="Projection search results"
        className="max-h-64 overflow-y-auto rounded-sm border empty:hidden"
      >
        {search.matches.map((projection) => (
          <li key={projection.code}>
            <button
              type="button"
              className={`min-h-11 w-full space-y-1 px-3 py-2 text-left text-sm outline-hidden hover:bg-base-hover focus-visible:bg-base-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${selected?.code === projection.code ? "bg-base-active" : ""}`}
              aria-pressed={selected?.code === projection.code}
              onClick={() => {
                onChange(projection.code);
                setQuery("");
              }}
            >
              <span className="block">{projection.name}</span>
              <span className="block text-xs text-subtle">
                EPSG:{projection.code}
                {projection.deprecated ? " · Deprecated" : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </fieldset>
  );
};

const numericEpsgCode = (value: string): string | null => {
  const match = value.trim().match(/^(?:EPSG\s*:\s*)?(\d+)$/i);
  if (!match) return null;
  const code = Number(match[1]);
  return Number.isSafeInteger(code) && code > 0 ? String(code) : null;
};

const matchRank = (projection: ProjectionChoice, query: string) =>
  (projection.deprecated ? 4 : 0) +
  (projection.code === query
    ? 0
    : projection.code.startsWith(query)
      ? 1
      : projection.name.toLowerCase().startsWith(query)
        ? 2
        : 3);
