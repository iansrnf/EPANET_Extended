import React from "react";
import * as DD from "@radix-ui/react-dropdown-menu";
import { Tooltip } from "@epanet-js/ui-kit";

import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  FileBoxIcon,
  FilePlusCornerIcon,
  FileSpreadsheetIcon,
  FolderIcon,
  FolderOpenIcon,
  GlobeIcon,
  OutdatedSimulationIcon,
  SaveIcon,
  SaveAllIcon,
  FileTextIcon,
  ImportCustomerPointsIcon,
  FolderInputIcon,
  FolderOutputIcon,
  ZonesIcon,
} from "src/icons";
import { useAtomValue, useSetAtom } from "jotai";
import { dialogAtom } from "src/state/dialog";
import { worktreeAtom } from "src/state/scenarios";
import { useNewProject } from "src/commands/create-new-project";
import { useOpenInpFromFs } from "src/commands/open-inp-from-fs";
import { useConvertModel } from "src/commands/convert-model";
import { getConverter, type ConverterVendor } from "src/lib/converters";
import { useOpenProject } from "src/commands/open-project";
import { useSaveInp } from "src/commands/save-inp";
import { useSaveProject } from "src/commands/save-project";
import { useExportScenarioAsProject } from "src/commands/export-scenario-as-project";
import { useOpenModelBuilder } from "src/commands/open-model-builder";
import { useOpenRecentFile } from "src/commands/open-recent-file";
import { projectExtension } from "src/commands/save-project";
import { useUserTracking } from "src/infra/user-tracking";
import { useTranslate } from "src/hooks/use-translate";
import { useOpenCustomerPointsImport } from "src/commands/open-customer-points-import";
import { useOpenZonesImport } from "src/commands/open-zones-import";
import { useImportZonesDisabled } from "src/hooks/use-import-zones-disabled";
import { useImportCustomerPointsDisabled } from "src/hooks/use-import-customer-points-disabled";
import { useRecentFiles } from "src/hooks/use-recent-files";
import { useIsDrawingAvailable } from "src/hooks/use-is-drawing-available";
import { useIsModelBuilderAvailable } from "src/hooks/use-is-model-builder-available";
import { useFeatureFlag } from "src/hooks/use-feature-flags";
import {
  Button,
  DDContent,
  DDSubContent,
  DDSubTriggerItem,
  DDSeparator,
  StyledItem,
} from "src/components/elements";

const floatingMenuPresentation = {
  className:
    "map-overlay-theme map-overlay-surface map-overlay-popover placemark-scrollbar z-40 max-w-[calc(100vw-1rem)] overflow-y-auto [&_[data-highlighted]]:bg-base-hover [&_[data-disabled]]:cursor-not-allowed [&_[data-disabled]]:text-disabled [&_[data-disabled]]:opacity-60",
  collisionPadding: 8,
  style: {
    maxHeight:
      "min(calc(100dvh - 1rem), var(--radix-dropdown-menu-content-available-height))",
  },
};

export const FileDropdown = ({ floating = false }: { floating?: boolean }) => {
  const openProject = useOpenProject();
  const saveProject = useSaveProject();
  const translate = useTranslate();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [tooltipOpen, setTooltipOpen] = React.useState(false);

  return (
    <div
      className={
        floating
          ? "map-overlay-theme flex h-[var(--map-control-target-size)] w-[var(--map-control-target-size)] shrink-0 items-center justify-center"
          : "h-10 w-12 group bn flex items-stretch py-1 focus:outline-hidden"
      }
    >
      <DD.Root
        onOpenChange={(open) => {
          setMenuOpen(open);
          setTooltipOpen(false);
        }}
      >
        <Tooltip
          content={translate("file")}
          side={floating ? "right" : undefined}
          sideOffset={floating ? 6 : undefined}
          zIndex={floating ? 50 : undefined}
          className={
            floating
              ? "map-overlay-theme map-overlay-surface map-overlay-tooltip pointer-events-none"
              : undefined
          }
          open={floating ? tooltipOpen && !menuOpen : undefined}
          onOpenChange={floating ? setTooltipOpen : undefined}
        >
          <DD.Trigger asChild>
            {floating ? (
              <button
                type="button"
                aria-label={translate("file")}
                className="group flex h-[var(--map-control-target-size)] w-[var(--map-control-target-size)] items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span
                  className={`flex h-[var(--map-control-face-size)] w-[var(--map-control-face-size)] items-center justify-center rounded-sm border shadow-lg transition-colors [&_svg]:h-[var(--map-control-icon-size)] [&_svg]:w-[var(--map-control-icon-size)] ${
                    menuOpen
                      ? "border-accent bg-accent text-default-inverse"
                      : "map-overlay-surface text-default group-hover:bg-base-hover group-focus-visible:bg-base-hover"
                  }`}
                >
                  <FolderIcon aria-hidden="true" />
                </span>
              </button>
            ) : (
              <Button variant="quiet" aria-label={translate("file")}>
                <FolderIcon />
                <ChevronDownIcon size="sm" />
              </Button>
            )}
          </DD.Trigger>
        </Tooltip>
        <DD.Portal>
          <DDContent
            {...(floating ? floatingMenuPresentation : {})}
            align="start"
            side={floating ? "right" : "bottom"}
            sideOffset={floating ? 6 : undefined}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <NewProjectSubmenu floating={floating} />

            <DDSeparator />

            <StyledItem
              onSelect={() => {
                openProject({ source: "toolbar" });
              }}
            >
              <FolderOpenIcon />
              {translate("openFile")}
            </StyledItem>

            <ConvertModelSubmenu floating={floating} />

            <DDSeparator />

            <StyledItem
              onSelect={() => {
                void saveProject({ source: "toolbar" });
              }}
            >
              <SaveIcon />
              {translate("save")}
            </StyledItem>

            <StyledItem
              onSelect={() => {
                void saveProject({ source: "toolbar", isSaveAs: true });
              }}
            >
              <SaveAllIcon />
              {translate("saveAs")}
            </StyledItem>

            <DDSeparator />

            <ImportSubmenu floating={floating} />
            <ExportSubmenu floating={floating} />
            <RecentFilesMenu floating={floating} />
          </DDContent>
        </DD.Portal>
      </DD.Root>
    </div>
  );
};

const ConverterItem = ({ vendor }: { vendor: ConverterVendor }) => {
  const convertModel = useConvertModel();
  const converter = getConverter(vendor);

  if (!converter) return null;

  return (
    <StyledItem
      onSelect={() => {
        void convertModel({ vendor, source: "toolbar" });
      }}
    >
      <FileBoxIcon />
      {converter.name}
    </StyledItem>
  );
};

const ConvertModelSubmenu = ({ floating }: { floating: boolean }) => {
  const translate = useTranslate();
  const isSynergiOn = useFeatureFlag("FLAG_SYNERGI");

  const isSynergiAvailable = isSynergiOn && !!getConverter("synergi");

  if (!isSynergiAvailable) return null;

  return (
    <DD.Sub>
      <DDSubTriggerItem>
        <FolderOpenIcon />
        {translate("convertModel.menuTitle")}
        <ChevronRightIcon size="sm" className="ml-auto" />
      </DDSubTriggerItem>
      <DD.Portal>
        <DDSubContent
          {...(floating ? floatingMenuPresentation : {})}
          sideOffset={4}
          alignOffset={-4}
        >
          <ConverterItem vendor="synergi" />
        </DDSubContent>
      </DD.Portal>
    </DD.Sub>
  );
};

const NewProjectSubmenu = ({ floating }: { floating: boolean }) => {
  const createNewProject = useNewProject();
  const openModelBuilder = useOpenModelBuilder();
  const openInpFromFs = useOpenInpFromFs();
  const userTracking = useUserTracking();
  const translate = useTranslate();
  const isDrawingAvailable = useIsDrawingAvailable();
  const isModelBuilderAvailable = useIsModelBuilderAvailable();

  return (
    <DD.Sub>
      <DDSubTriggerItem>
        <FilePlusCornerIcon />
        {translate("newProject")}
        <ChevronRightIcon size="sm" className="ml-auto" />
      </DDSubTriggerItem>
      <DD.Portal>
        <DDSubContent
          {...(floating ? floatingMenuPresentation : {})}
          sideOffset={4}
          alignOffset={-4}
        >
          {isDrawingAvailable && (
            <StyledItem
              onSelect={() => {
                userTracking.capture({
                  name: "newModel.started",
                  source: "toolbar",
                });
                void createNewProject({ source: "toolbar" });
              }}
            >
              <FileIcon />
              {translate("newProject.blank")}
            </StyledItem>
          )}

          {isModelBuilderAvailable && (
            <StyledItem
              onSelect={() => {
                openModelBuilder({ source: "toolbar" });
              }}
            >
              <GlobeIcon />
              {translate("newProject.fromGIS")}
            </StyledItem>
          )}

          <StyledItem
            onSelect={() => {
              userTracking.capture({
                name: "openInp.started",
                source: "toolbar",
              });
              void openInpFromFs({ source: "toolbar" });
            }}
          >
            <FileSpreadsheetIcon />
            {translate("newProject.fromEpanetInp")}
          </StyledItem>
        </DDSubContent>
      </DD.Portal>
    </DD.Sub>
  );
};

const ImportSubmenu = ({ floating }: { floating: boolean }) => {
  const importCustomerPoints = useOpenCustomerPointsImport();
  const openZonesImport = useOpenZonesImport();
  const importZonesDisabled = useImportZonesDisabled();
  const importCustomerPointsDisabled = useImportCustomerPointsDisabled();
  const translate = useTranslate();

  return (
    <DD.Sub>
      <DDSubTriggerItem>
        <FolderOutputIcon />
        {translate("import")}
        <ChevronRightIcon size="sm" className="ml-auto" />
      </DDSubTriggerItem>
      <DD.Portal>
        <DDSubContent
          {...(floating ? floatingMenuPresentation : {})}
          sideOffset={4}
          alignOffset={-4}
        >
          <StyledItem
            disabled={importCustomerPointsDisabled}
            className={importCustomerPointsDisabled ? "opacity-60" : undefined}
            onSelect={() => {
              importCustomerPoints({ source: "toolbar" });
            }}
          >
            <ImportCustomerPointsIcon />
            {translate("importCustomerPoints.menuEntry")}
          </StyledItem>

          <StyledItem
            disabled={importZonesDisabled}
            className={importZonesDisabled ? "opacity-60" : undefined}
            onSelect={() => {
              openZonesImport({ source: "toolbar" });
            }}
          >
            <ZonesIcon />
            {translate("importZones.menuTitle")}
          </StyledItem>
        </DDSubContent>
      </DD.Portal>
    </DD.Sub>
  );
};

const ExportSubmenu = ({ floating }: { floating: boolean }) => {
  const saveInp = useSaveInp();
  const saveProject = useSaveProject();
  const exportScenarioAsProject = useExportScenarioAsProject();
  const worktree = useAtomValue(worktreeAtom);
  const isInScenario = worktree.activeBranchId !== worktree.mainId;
  const setDialogState = useSetAtom(dialogAtom);
  const translate = useTranslate();
  const exportInpLabel = isInScenario
    ? translate("export.currentScenarioAsEpanetInp")
    : translate("export.epanetInp");

  return (
    <DD.Sub>
      <DDSubTriggerItem>
        <FolderInputIcon />
        {translate("export")}
        <ChevronRightIcon size="sm" className="ml-auto" />
      </DDSubTriggerItem>
      <DD.Portal>
        <DDSubContent
          {...(floating ? floatingMenuPresentation : {})}
          sideOffset={4}
          alignOffset={-4}
        >
          <StyledItem
            onSelect={() => {
              setDialogState({
                type: "alertExportInp",
                onSaveProject: () => {
                  void saveProject({ source: "toolbar" });
                },
                onExportAnyway: () => {
                  void saveInp({ source: "toolbar", isSaveAs: true });
                },
              });
            }}
          >
            <FileSpreadsheetIcon />
            {exportInpLabel}
          </StyledItem>
          <StyledItem
            disabled={!isInScenario}
            className={!isInScenario ? "opacity-60" : undefined}
            onSelect={() => {
              void exportScenarioAsProject({ source: "toolbar" });
            }}
          >
            <FileBoxIcon />
            {translate("export.currentScenarioAsProject")}
          </StyledItem>
          <StyledItem
            onSelect={() => {
              setDialogState({ type: "exportAssetData" });
            }}
          >
            <FileTextIcon />
            {translate("export.assetData")}
          </StyledItem>
          <StyledItem
            onSelect={() => {
              setDialogState({ type: "exportTimeSeries" });
            }}
          >
            <FileTextIcon />
            {translate("export.simulationResults")}
          </StyledItem>
        </DDSubContent>
      </DD.Portal>
    </DD.Sub>
  );
};

const RecentFilesMenu = ({ floating }: { floating: boolean }) => {
  const openRecentFile = useOpenRecentFile();
  const translate = useTranslate();
  const { recentFiles, isSupported: isRecentFilesSupported } = useRecentFiles();

  const showRecentFiles = isRecentFilesSupported && recentFiles.length > 0;

  if (!showRecentFiles) return null;

  return (
    <>
      <DDSeparator />
      <DD.Sub>
        <DDSubTriggerItem>
          <OutdatedSimulationIcon />
          {translate("recent")}
          <ChevronRightIcon size="sm" className="ml-auto" />
        </DDSubTriggerItem>
        <DD.Portal>
          <DDSubContent
            {...(floating ? floatingMenuPresentation : {})}
            sideOffset={4}
            alignOffset={-4}
          >
            {recentFiles.map((entry) => {
              const isProject = entry.name
                .toLowerCase()
                .endsWith(projectExtension);
              return (
                <StyledItem
                  key={entry.id}
                  onSelect={() => openRecentFile(entry, "toolbar")}
                >
                  {isProject ? <FileBoxIcon /> : <FileSpreadsheetIcon />}
                  {entry.name}
                </StyledItem>
              );
            })}
          </DDSubContent>
        </DD.Portal>
      </DD.Sub>
    </>
  );
};
