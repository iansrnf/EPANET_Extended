import { useState } from "react";
import type { SourceAttribute } from "@epanet-js/gis-importers";
import type { NetworkLayerRole } from "src/lib/model-builder/network";
import { Button } from "src/components/elements";
import { ChevronDownIcon, ChevronUpIcon, CloseIcon } from "src/icons";
import { compatibleRoles, roleNames, type BuilderLayer } from "./data";
import { controlClass, Field, FiltersEditor } from "./mapping";
import type { AssignmentPartition } from "./assignment-rules-data";

type AssignmentRulesProps = {
  layer: BuilderLayer;
  attributes: SourceAttribute[];
  onApply: (
    rules: AssignmentPartition["rules"],
    fallbackRole: NetworkLayerRole | null,
  ) => void;
};

export const AssignmentRules = ({
  layer,
  attributes,
  onApply,
}: AssignmentRulesProps) => {
  const [rules, setRules] = useState<AssignmentPartition["rules"]>(
    () =>
      layer.partition?.rules.map((rule) => ({
        ...rule,
        conditions: [...rule.conditions],
      })) ?? [],
  );
  const [fallbackRole, setFallbackRole] = useState<NetworkLayerRole | null>(
    layer.partition?.fallbackRole ?? null,
  );
  const [editing, setEditing] = useState(false);
  const roles = compatibleRoles(layer.geometry);
  const hasEmptyRule = rules.some(({ conditions }) => conditions.length === 0);

  const updateRule = (
    index: number,
    next: AssignmentPartition["rules"][number],
  ) => {
    setRules((current) =>
      current.map((rule, currentIndex) =>
        currentIndex === index ? next : rule,
      ),
    );
  };
  const moveRule = (index: number, offset: number) => {
    setRules((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  return (
    <section className="space-y-3 border-t pt-4">
      <div>
        <h3 className="text-sm font-medium">Assign with custom rules</h3>
        <p className="mt-1 text-xs leading-relaxed text-subtle">
          Evaluate rules from top to bottom. Each record goes to the first rule
          it matches. Conditions within a rule must all match.
        </p>
      </div>
      {!editing ? (
        <Button
          size="sm"
          disabled={attributes.length === 0}
          onClick={() => setEditing(true)}
        >
          {layer.partition
            ? "Edit assignment rules"
            : "Set up assignment rules"}
        </Button>
      ) : (
        <div className="space-y-4">
          {rules.map((rule, index) => (
            <fieldset key={index} className="space-y-3 rounded-sm border p-3">
              <legend className="px-1 text-sm font-medium">
                Rule {index + 1}
              </legend>
              <div className="flex items-center gap-1">
                <Button
                  variant="quiet"
                  size="sm"
                  disabled={index === 0}
                  aria-label={`Move rule ${index + 1} up`}
                  onClick={() => moveRule(index, -1)}
                >
                  <ChevronUpIcon size="sm" />
                </Button>
                <Button
                  variant="quiet"
                  size="sm"
                  disabled={index === rules.length - 1}
                  aria-label={`Move rule ${index + 1} down`}
                  onClick={() => moveRule(index, 1)}
                >
                  <ChevronDownIcon size="sm" />
                </Button>
                <Button
                  className="ml-auto"
                  variant="quiet"
                  size="sm"
                  aria-label={`Remove rule ${index + 1}`}
                  onClick={() =>
                    setRules((current) =>
                      current.filter(
                        (_, currentIndex) => currentIndex !== index,
                      ),
                    )
                  }
                >
                  <CloseIcon size="sm" />
                </Button>
              </div>
              <Field label="Rule name">
                <input
                  className={controlClass}
                  value={rule.name}
                  maxLength={80}
                  onChange={(event) =>
                    updateRule(index, { ...rule, name: event.target.value })
                  }
                />
              </Field>
              <Field label="Assign to">
                <select
                  className={controlClass}
                  value={rule.role ?? ""}
                  onChange={(event) =>
                    updateRule(index, {
                      ...rule,
                      role: (event.target.value ||
                        null) as NetworkLayerRole | null,
                    })
                  }
                >
                  <option value="">Not assigned</option>
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {roleNames[role]}
                    </option>
                  ))}
                </select>
              </Field>
              <FiltersEditor
                filters={rule.conditions}
                attributes={attributes}
                onChange={(conditions) =>
                  updateRule(index, { ...rule, conditions })
                }
              />
            </fieldset>
          ))}
          <Button
            size="sm"
            disabled={attributes.length === 0}
            onClick={() =>
              setRules((current) => [
                ...current,
                {
                  name: `Rule ${current.length + 1}`,
                  role: layer.role,
                  conditions: [],
                },
              ])
            }
          >
            Add rule
          </Button>
          <Field
            label="Otherwise"
            hint="Records that match no rule go to this layer, or are excluded when not assigned."
          >
            <select
              className={controlClass}
              value={fallbackRole ?? ""}
              onChange={(event) =>
                setFallbackRole(
                  (event.target.value || null) as NetworkLayerRole | null,
                )
              }
            >
              <option value="">Not assigned</option>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {roleNames[role]}
                </option>
              ))}
            </select>
          </Field>
          {hasEmptyRule && (
            <p className="text-xs text-warning" role="status">
              Add at least one condition to each rule before applying.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={
                hasEmptyRule || (rules.length === 0 && fallbackRole === null)
              }
              onClick={() => {
                onApply(rules, fallbackRole);
                setEditing(false);
              }}
            >
              Apply assignment rules
            </Button>
            <Button
              variant="quiet"
              size="sm"
              onClick={() => {
                setRules(
                  layer.partition?.rules.map((rule) => ({
                    ...rule,
                    conditions: [...rule.conditions],
                  })) ?? [],
                );
                setFallbackRole(layer.partition?.fallbackRole ?? null);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
};
