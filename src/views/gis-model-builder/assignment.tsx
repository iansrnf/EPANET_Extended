import { useState } from "react";
import { Button } from "src/components/elements";
import { CloseIcon, FileAddIcon } from "src/icons";
import type { BuilderLayer, BuilderSource } from "./data";
import {
  compatibleRoles,
  featuresForLayer,
  layerAttributes,
  roleColors,
  roleNames,
  valueAsText,
} from "./data";
import { controlClass, Field, FiltersEditor } from "./mapping";
import { GeometryPreview } from "./preview";
import type { NetworkLayerRole } from "src/lib/model-builder/network";
import { AssignmentRules } from "./assignment-rules";
import type { AssignmentPartition } from "./assignment-rules-data";

export const LayerAssignment = ({
  sources,
  layers,
  selectedId,
  onSelect,
  onChange,
  onRemove,
  onDuplicate,
  onRoleChange,
  onSplit,
  onAddGroup,
  onApplyRules,
}: {
  sources: BuilderSource[];
  layers: BuilderLayer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (layer: BuilderLayer) => void;
  onRemove: (id: string) => void;
  onDuplicate: (layer: BuilderLayer) => void;
  onRoleChange: (layer: BuilderLayer, role: NetworkLayerRole) => void;
  onSplit: (layer: BuilderLayer, attribute: string) => void;
  onAddGroup: (
    source: BuilderSource,
    geometry: BuilderLayer["geometry"],
  ) => void;
  onApplyRules: (
    layer: BuilderLayer,
    rules: AssignmentPartition["rules"],
    fallbackRole: NetworkLayerRole | null,
  ) => void;
}) => {
  const layer = layers.find(({ id }) => id === selectedId) ?? layers[0];
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <LayerList
        sources={sources}
        layers={layers}
        selectedId={layer?.id ?? null}
        onSelect={onSelect}
        onChange={onChange}
        onAddGroup={onAddGroup}
      />
      {layer && (
        <AssignmentDetails
          key={layer.id}
          layer={layer}
          sources={sources}
          onChange={onChange}
          onRemove={onRemove}
          onDuplicate={onDuplicate}
          onRoleChange={onRoleChange}
          onSplit={onSplit}
          onApplyRules={onApplyRules}
        />
      )}
      <GeometryPreview
        key={layer?.id ?? "all"}
        sources={sources}
        layers={layers.map((item) => ({
          ...item,
          features: featuresForLayer(item),
        }))}
        selectedLayerId={layer?.id}
      />
    </div>
  );
};

export const LayerList = ({
  sources,
  layers,
  selectedId,
  onSelect,
  onChange,
  onAddGroup,
}: {
  sources: BuilderSource[];
  layers: BuilderLayer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (layer: BuilderLayer) => void;
  onAddGroup?: (
    source: BuilderSource,
    geometry: BuilderLayer["geometry"],
  ) => void;
}) => (
  <aside className="w-full shrink-0 overflow-y-auto border-b lg:w-64 lg:border-b-0 lg:border-r">
    <div className="border-b p-4">
      <h2 className="text-sm font-semibold">Source layers</h2>
      <p className="mt-1 text-xs text-subtle">
        Assign geometry to network elements.
      </p>
    </div>
    {sources
      .filter(({ status }) => status === "ready")
      .map((source) => (
        <div key={source.id} className="border-b py-2">
          <h3
            className="truncate px-4 py-2 text-xs font-medium text-subtle"
            title={source.name}
          >
            {source.name}
          </h3>
          {layers
            .filter(({ sourceId }) => sourceId === source.id)
            .map((layer) => (
              <div
                key={layer.id}
                className={`mx-2 flex items-start gap-2 rounded-sm ${selectedId === layer.id ? "bg-base-active" : "hover:bg-base-hover"}`}
              >
                <label className="pl-2 pt-3">
                  <input
                    type="checkbox"
                    className="accent-accent"
                    checked={layer.enabled}
                    aria-label={`Include ${layer.name} as ${roleNames[layer.role]}`}
                    onChange={(event) =>
                      onChange({ ...layer, enabled: event.target.checked })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="min-w-0 flex-1 py-2 pr-2 text-left text-sm"
                  aria-pressed={selectedId === layer.id}
                  onClick={() => onSelect(layer.id)}
                >
                  <span
                    className={`block font-medium ${roleColors[layer.role]}`}
                  >
                    {roleNames[layer.role]}
                  </span>
                  <span
                    className="mt-1 block truncate text-xs text-subtle"
                    title={layer.name}
                  >
                    {layer.name}
                  </span>
                  <span className="mt-1 block text-xs text-subtle">
                    {featuresForLayer(layer).length.toLocaleString()}{" "}
                    {layer.geometry} records
                  </span>
                </button>
              </div>
            ))}
          {source.groups
            .filter(
              (group) =>
                compatibleRoles(group.geometry).length > 0 &&
                !layers.some(
                  (layer) =>
                    layer.sourceId === source.id &&
                    layer.geometry === group.geometry,
                ),
            )
            .map((group) => (
              <div key={group.geometry} className="px-4 py-2">
                <p className="text-xs text-subtle">
                  {group.features.length.toLocaleString()} unassigned{" "}
                  {group.geometry} records
                </p>
                {onAddGroup && (
                  <Button
                    className="mt-2"
                    size="sm"
                    onClick={() => onAddGroup(source, group.geometry)}
                  >
                    Assign {group.geometry} records
                  </Button>
                )}
              </div>
            ))}
        </div>
      ))}
  </aside>
);

const AssignmentDetails = ({
  layer,
  sources,
  onChange,
  onRemove,
  onDuplicate,
  onRoleChange,
  onSplit,
  onApplyRules,
}: {
  layer: BuilderLayer;
  sources: BuilderSource[];
  onChange: (layer: BuilderLayer) => void;
  onRemove: (id: string) => void;
  onDuplicate: (layer: BuilderLayer) => void;
  onRoleChange: (layer: BuilderLayer, role: NetworkLayerRole) => void;
  onSplit: (layer: BuilderLayer, attribute: string) => void;
  onApplyRules: (
    layer: BuilderLayer,
    rules: AssignmentPartition["rules"],
    fallbackRole: NetworkLayerRole | null,
  ) => void;
}) => {
  const attributes = layerAttributes(layer, sources);
  const [splitAttribute, setSplitAttribute] = useState("");
  const values = splitAttribute
    ? [
        ...new Set(
          layer.features.map(({ properties }) =>
            valueAsText(properties?.[splitAttribute]),
          ),
        ),
      ]
    : [];
  const included = featuresForLayer(layer).length;
  return (
    <section className="w-full shrink-0 space-y-5 overflow-y-auto border-b p-5 lg:w-96 lg:border-b-0 lg:border-r">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Layer assignment</h2>
          <p className="mt-1 break-all text-xs text-subtle">
            {layer.sourceName} · {layer.geometry} geometry
          </p>
        </div>
        <Button
          variant="quiet"
          size="sm"
          aria-label={`Remove assignment ${layer.name}`}
          onClick={() => onRemove(layer.id)}
        >
          <CloseIcon size="sm" />
        </Button>
      </div>
      <Field label="Use records as">
        <select
          className={controlClass}
          value={layer.role}
          onChange={(event) =>
            onRoleChange(layer, event.target.value as NetworkLayerRole)
          }
        >
          {compatibleRoles(layer.geometry).map((role) => (
            <option value={role} key={role}>
              {roleNames[role]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Assignment name">
        <input
          className={controlClass}
          value={layer.name}
          onChange={(event) => onChange({ ...layer, name: event.target.value })}
        />
      </Field>
      <div className="rounded-sm border bg-info-subtle p-3 text-sm text-info">
        {included.toLocaleString()} of {layer.features.length.toLocaleString()}{" "}
        records included.
      </div>
      <FiltersEditor
        filters={layer.filters ?? []}
        attributes={attributes}
        onChange={(filters) => onChange({ ...layer, filters })}
      />
      <div className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-medium">Split by attribute</h3>
        <p className="text-xs text-subtle">
          Create a separate assignment for each value, then give each one its
          own mappings or element type.
        </p>
        <select
          aria-label="Split assignment by attribute"
          className={controlClass}
          value={splitAttribute}
          onChange={(event) => setSplitAttribute(event.target.value)}
        >
          <option value="">Choose an attribute</option>
          {attributes.map(({ name }) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        {splitAttribute && (
          <p className="text-xs text-subtle">
            {values.length} distinct values
            {values.length > 20
              ? ". Use filtered assignments for more than 20 values."
              : "."}
          </p>
        )}
        <Button
          size="sm"
          disabled={
            !splitAttribute || values.length === 0 || values.length > 20
          }
          onClick={() => onSplit(layer, splitAttribute)}
        >
          Create value assignments
        </Button>
      </div>
      <AssignmentRules
        key={layer.id}
        layer={layer}
        attributes={attributes}
        onApply={(rules, fallbackRole) =>
          onApplyRules(layer, rules, fallbackRole)
        }
      />
      <div className="space-y-2 border-t pt-4">
        <Button size="sm" onClick={() => onDuplicate(layer)}>
          <FileAddIcon size="sm" />
          Add filtered assignment
        </Button>
        <p className="text-xs text-subtle">
          Use additional assignments to send different records from one file to
          different elements. Avoid overlapping filters unless you intend to
          import a record more than once.
        </p>
      </div>
    </section>
  );
};
