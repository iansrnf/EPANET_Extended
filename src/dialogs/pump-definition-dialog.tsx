import { useId, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { nanoid } from "nanoid";
import clsx from "clsx";
import {
  clonePumpDefinition,
  createDefaultPumpDefinition,
  getPumpDefinitionErrors,
  type Pump,
  type PumpDefinition,
} from "@epanet-js/hydraulic-model";
import { BaseDialog, useDialogState } from "src/components/dialog";
import { Button } from "src/components/elements";
import { useTranslate } from "src/hooks/use-translate";
import { useIsEditionBlocked } from "src/hooks/use-is-edition-blocked";
import { useSavePumpDefinitions } from "src/commands/save-pump-definitions";
import {
  stagingModelDerivedAtom,
  simulationSettingsDerivedAtom,
} from "src/state/derived-branch-state";
import { projectSettingsAtom } from "src/state/project-settings";
import {
  AddIcon,
  CopyIcon,
  DeleteIcon,
  PumpIcon,
  SearchIcon,
  WarningIcon,
  ChevronDownIcon,
} from "src/icons";
import { pumpDefinitionFromPump } from "src/lib/pump-definitions/from-pump";
import { PumpDefinitionEditor } from "src/panels/asset-panel/pump-definition/pump-definition-editor";

type Draft = { definitions: PumpDefinition[]; selectedId: string };

export const PumpDefinitionDialog = ({ pumpId }: { pumpId: number }) => {
  const model = useAtomValue(stagingModelDerivedAtom);
  const settings = useAtomValue(projectSettingsAtom);
  const simulationSettings = useAtomValue(simulationSettingsDerivedAtom);
  const pump = model.assets.get(pumpId);
  if (pump?.type !== "pump") return null;
  return (
    <PumpDefinitionDialogContent
      key={pumpId}
      pump={pump as Pump}
      initialDefinitions={model.pumpDefinitions}
      globalEfficiency={simulationSettings.energyGlobalEfficiency}
      units={settings.units}
    />
  );
};

const PumpDefinitionDialogContent = ({
  pump,
  initialDefinitions,
  globalEfficiency,
  units,
}: {
  pump: Pump;
  initialDefinitions: PumpDefinition[];
  globalEfficiency: number;
  units: import("@epanet-js/project-settings").UnitsSpec;
}) => {
  const translate = useTranslate();
  const model = useAtomValue(stagingModelDerivedAtom);
  const savePumpDefinitions = useSavePumpDefinitions();
  const { closeDialog } = useDialogState();
  const readOnly = useIsEditionBlocked();
  const [draft, setDraft] = useState<Draft>(() => {
    const definitions = initialDefinitions.map(clonePumpDefinition);
    const existing = definitions.find(
      (item) => item.id === pump.pumpDefinitionId,
    );
    if (existing) return { definitions, selectedId: existing.id };
    const definition = pumpDefinitionFromPump(
      pump,
      model.curves,
      nanoid(10),
      uniqueName(
        definitions,
        translate("pumpDefinitions.defaultName", pump.label),
      ),
      globalEfficiency,
    );
    return {
      definitions: [...definitions, definition],
      selectedId: definition.id,
    };
  });
  const [search, setSearch] = useState("");
  const [discarding, setDiscarding] = useState(false);
  const [isLibraryExpanded, setLibraryExpanded] = useState(false);
  const libraryId = useId();
  const selected = draft.definitions.find(
    (item) => item.id === draft.selectedId,
  );
  const invalidIds = useMemo(() => {
    const invalid = new Set<string>();
    const names = new Map<string, string>();
    for (const definition of draft.definitions) {
      if (getPumpDefinitionErrors(definition).length)
        invalid.add(definition.id);
      const name = definition.name.trim().toLocaleLowerCase();
      const previous = names.get(name);
      if (previous) {
        invalid.add(previous);
        invalid.add(definition.id);
      }
      names.set(name, definition.id);
    }
    return invalid;
  }, [draft.definitions]);
  const hasChanges =
    JSON.stringify(draft.definitions) !== JSON.stringify(initialDefinitions) ||
    draft.selectedId !== pump.pumpDefinitionId;
  const users = model.assets.values();
  const usage = new Map<string, number>();
  const usedByOthers = new Set<string>();
  for (const asset of users) {
    if (asset.type !== "pump") continue;
    const otherPump = asset as Pump;
    if (!otherPump.pumpDefinitionId) continue;
    usage.set(
      otherPump.pumpDefinitionId,
      (usage.get(otherPump.pumpDefinitionId) ?? 0) + 1,
    );
    if (asset.id !== pump.id) usedByOthers.add(otherPump.pumpDefinitionId);
  }

  const handleClose = () => {
    if (hasChanges && !readOnly && !discarding) setDiscarding(true);
    else closeDialog();
  };
  const handleApply = () => {
    if (readOnly || !selected || invalidIds.size) return;
    const result = savePumpDefinitions(draft.definitions, pump.id, selected.id);
    if (result) closeDialog();
  };
  const handleChange = (definition: PumpDefinition) =>
    setDraft((current) => ({
      ...current,
      definitions: current.definitions.map((item) =>
        item.id === definition.id ? definition : item,
      ),
    }));
  const handleAdd = (duplicate: boolean) => {
    const id = nanoid(10);
    const definition =
      duplicate && selected
        ? {
            ...clonePumpDefinition(selected),
            id,
            headCurveId: undefined,
            efficiencyCurveId: undefined,
          }
        : createDefaultPumpDefinition(id, "");
    definition.name = uniqueName(
      draft.definitions,
      duplicate && selected
        ? translate("pumpDefinitions.copyName", selected.name)
        : translate("pumpDefinitions.newName"),
    );
    setDraft({
      definitions: [...draft.definitions, definition],
      selectedId: id,
    });
    setSearch("");
    setLibraryExpanded(false);
  };
  const handleDelete = () => {
    if (!selected || usedByOthers.has(selected.id)) return;
    const remaining = draft.definitions.filter(
      (item) => item.id !== selected.id,
    );
    setDraft({ definitions: remaining, selectedId: remaining[0]?.id ?? "" });
  };

  return (
    <BaseDialog
      title={translate("pumpDefinitions.dialogTitle", pump.label)}
      size="xxl"
      height="xxl"
      isOpen
      onClose={handleClose}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3 border-t bg-panel px-5 py-4">
          {discarding ? (
            <>
              <p className="mr-auto text-size-base text-subtle">
                {translate("pumpDefinitions.discardHint")}
              </p>
              <Button
                type="button"
                className="min-h-11"
                onClick={() => setDiscarding(false)}
              >
                {translate("dialog.keepEditing")}
              </Button>
              <Button
                type="button"
                className="min-h-11"
                variant="danger"
                onClick={handleClose}
              >
                {translate("dialog.discardChanges")}
              </Button>
            </>
          ) : (
            <>
              <p
                role="status"
                className="mr-auto max-w-lg text-size-small text-subtle"
              >
                {invalidIds.size
                  ? translate("pumpDefinitions.invalidHint")
                  : translate("pumpDefinitions.applyHint", pump.label)}
              </p>
              <Button type="button" className="min-h-11" onClick={handleClose}>
                {translate(readOnly ? "dialog.close" : "dialog.cancel")}
              </Button>
              {!readOnly && (
                <Button
                  type="button"
                  variant="primary"
                  className="min-h-11"
                  disabled={!selected || invalidIds.size > 0}
                  onClick={handleApply}
                >
                  {translate("pumpDefinitions.apply")}
                </Button>
              )}
            </>
          )}
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside
          className="flex w-full shrink-0 flex-col border-b bg-panel md:w-60 md:border-r md:border-b-0"
          aria-label={translate("pumpDefinitions.listLabel")}
        >
          <button
            type="button"
            className="flex min-h-12 w-full items-center gap-2 border-b p-4 text-size-base font-semibold text-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 md:hidden"
            aria-expanded={isLibraryExpanded}
            aria-controls={libraryId}
            onClick={() => setLibraryExpanded((expanded) => !expanded)}
          >
            <PumpIcon />
            {translate("pumpDefinitions.saved")}
            <ChevronDownIcon
              className={clsx(
                "ml-auto transition-transform",
                isLibraryExpanded && "rotate-180",
              )}
            />
          </button>
          <div
            className={clsx(
              "space-y-3 border-b p-4",
              !isLibraryExpanded && "hidden md:block",
            )}
          >
            <div className="hidden items-center gap-2 text-size-base font-semibold text-default md:flex">
              <PumpIcon />
              {translate("pumpDefinitions.saved")}
            </div>
            <div className="relative">
              <SearchIcon
                className="pointer-events-none absolute top-3 left-3 text-subtle"
                size="sm"
              />
              <input
                type="search"
                aria-label={translate("pumpDefinitions.search")}
                placeholder={translate("pumpDefinitions.search")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="min-h-11 w-full rounded-lg border bg-base py-2 pr-3 pl-9 text-size-base text-default focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <Button
              type="button"
              disabled={readOnly}
              className="min-h-11 w-full"
              onClick={() => handleAdd(false)}
            >
              <AddIcon />
              {translate("pumpDefinitions.new")}
            </Button>
          </div>
          <div
            id={libraryId}
            className={clsx(
              "max-h-44 flex-1 space-y-1 overflow-y-auto p-2 md:max-h-none",
              !isLibraryExpanded && "hidden md:block",
            )}
          >
            {draft.definitions
              .filter((item) =>
                item.name
                  .toLocaleLowerCase()
                  .includes(search.toLocaleLowerCase()),
              )
              .map((definition) => (
                <button
                  type="button"
                  key={definition.id}
                  aria-pressed={definition.id === draft.selectedId}
                  onClick={() => {
                    setDraft((current) => ({
                      ...current,
                      selectedId: definition.id,
                    }));
                    setDiscarding(false);
                    setLibraryExpanded(false);
                  }}
                  className={clsx(
                    "flex min-h-16 w-full items-start gap-2 rounded-lg border p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500",
                    definition.id === draft.selectedId
                      ? "border-accent bg-base text-accent shadow-sm"
                      : "border-transparent text-default hover:bg-base-hover",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-size-base font-medium">
                      {definition.name || translate("pumpDefinitions.untitled")}
                    </p>
                    <p className="mt-1 text-size-small text-subtle">
                      {translate(
                        "pumpDefinitions.usedBy",
                        String(usage.get(definition.id) ?? 0),
                      )}
                    </p>
                  </div>
                  {invalidIds.has(definition.id) && (
                    <WarningIcon
                      size="sm"
                      className="text-warning"
                      aria-label={translate("pumpDefinitions.invalid")}
                    />
                  )}
                </button>
              ))}
            {draft.definitions.length === 0 && (
              <p className="p-3 text-size-base text-subtle">
                {translate("pumpDefinitions.empty")}
              </p>
            )}
          </div>
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto bg-base p-4 sm:p-6">
          {selected ? (
            <div className="mx-auto max-w-5xl space-y-5">
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-44 flex-1 space-y-1 text-size-small font-medium text-subtle">
                  <span>{translate("pumpDefinitions.name")}</span>
                  <input
                    autoFocus
                    value={selected.name}
                    disabled={readOnly}
                    onChange={(event) =>
                      handleChange({ ...selected, name: event.target.value })
                    }
                    className="min-h-11 w-full rounded-lg border bg-panel px-3 py-2 text-size-base font-semibold text-default focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-60"
                  />
                </label>
                <Button
                  type="button"
                  disabled={readOnly}
                  onClick={() => handleAdd(true)}
                  className="min-h-11"
                >
                  <CopyIcon />
                  {translate("pumpDefinitions.duplicate")}
                </Button>
                <Button
                  type="button"
                  disabled={readOnly || usedByOthers.has(selected.id)}
                  title={
                    usedByOthers.has(selected.id)
                      ? translate("pumpDefinitions.inUse")
                      : undefined
                  }
                  onClick={handleDelete}
                  className="min-h-11"
                  aria-label={translate("pumpDefinitions.delete")}
                >
                  <DeleteIcon />
                </Button>
              </div>
              {(usage.get(selected.id) ?? 0) > 1 && (
                <div className="rounded-lg border bg-info-subtle px-3 py-2 text-size-small text-info">
                  {translate(
                    "pumpDefinitions.sharedHint",
                    String(usage.get(selected.id)),
                  )}
                </div>
              )}
              <PumpDefinitionEditor
                key={selected.id}
                definition={selected}
                units={units}
                speed={pump.speed ?? 1}
                readOnly={readOnly}
                onChange={handleChange}
              />
              <details className="rounded-lg border bg-panel p-3">
                <summary className="cursor-pointer text-size-base font-medium text-default">
                  {translate("pumpDefinitions.notes")}
                </summary>
                <textarea
                  aria-label={translate("pumpDefinitions.notes")}
                  value={selected.notes ?? ""}
                  disabled={readOnly}
                  onChange={(event) =>
                    handleChange({ ...selected, notes: event.target.value })
                  }
                  rows={3}
                  className="mt-3 w-full rounded-md border bg-base p-3 text-size-base text-default focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </details>
            </div>
          ) : (
            <div className="flex h-full min-h-64 items-center justify-center text-size-base text-subtle">
              {translate("pumpDefinitions.selectHint")}
            </div>
          )}
        </div>
      </div>
    </BaseDialog>
  );
};

function uniqueName(definitions: PumpDefinition[], preferred: string): string {
  const names = new Set(
    definitions.map((item) => item.name.trim().toLocaleLowerCase()),
  );
  let name = preferred;
  let suffix = 2;
  while (names.has(name.toLocaleLowerCase()))
    name = `${preferred} (${suffix++})`;
  return name;
}
