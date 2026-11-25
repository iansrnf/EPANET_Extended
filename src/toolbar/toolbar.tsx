import { useTranslate } from "src/hooks/use-translate";
import MenuAction from "src/components/menu-action";
import {
  UndoIcon,
  RedoIcon,
  SaveIcon,
  PanelBottomIcon,
  PanelBottomActiveIcon,
  PanelLeftIcon,
  PanelLeftActiveIcon,
  PanelRightActiveIcon,
  PanelRightIcon,
  SearchIcon,
  TableIcon,
  HglProfileIcon,
} from "src/icons";
import { useAtomValue, useSetAtom } from "jotai";
import { splitsAtom } from "src/state/layout";
import { panelsIn } from "src/state/panels";
import { commandBarOpenAtom } from "src/state/command-bar";
import {
  canRedoDerivedAtom,
  canUndoDerivedAtom,
} from "src/state/derived-branch-state";
import { saveShortcut } from "src/commands/save-inp";
import { useSaveProject } from "src/commands/save-project";
import { useUserTracking } from "src/infra/user-tracking";
import { useHistoryControl } from "src/commands/history-control";
import { useBreakpoint } from "src/hooks/use-breakpoint";
import { useAllocateCustomerPoints } from "src/commands/allocate-customer-points";
import { FileDropdown } from "./file-dropdown";
import { OperationalDataDropdown } from "./operational-data-dropdown";
import { Mode, modeAtom } from "src/state/mode";
import { useShowDataTables } from "src/commands/show-data-tables";
import { useShowHglProfile } from "src/commands/show-hgl-profile";
import { useStartProfileSelection } from "src/commands/start-profile-selection";
import {
  toggleLeftPanelShortcut,
  useToggleLeftPanel,
} from "src/commands/toggle-left-panel";
import {
  toggleSidePanelShortcut,
  useToggleSidePanel,
} from "src/commands/toggle-side-panel";
import { useToggleVerticalPanel } from "src/commands/toggle-vertical-panel";
import {
  toggleBottomPanelShortcut,
  useToggleBottomPanel,
} from "src/commands/toggle-bottom-panel";
import { CustomAllocateCustomerPointsIcon } from "src/icons/custom-icons/allocate-customer-points-icon";

export const ProjectToolbar = ({
  readonly = false,
  customerAllocationDisabled = false,
}: {
  readonly?: boolean;
  customerAllocationDisabled?: boolean;
}) => {
  const translate = useTranslate();
  const saveProject = useSaveProject();
  const userTracking = useUserTracking();
  const allocateCustomerPoints = useAllocateCustomerPoints();
  const showDataTables = useShowDataTables();
  const showHglProfile = useShowHglProfile();
  const startProfileSelection = useStartProfileSelection();
  const { mode: currentMode } = useAtomValue(modeAtom);

  const { undo, redo } = useHistoryControl();

  const canUndo = useAtomValue(canUndoDerivedAtom);
  const canRedo = useAtomValue(canRedoDerivedAtom);
  const isMdOrLarger = useBreakpoint("md");
  const isSmOrLarger = useBreakpoint("sm");

  const fileActionsGroup = isSmOrLarger && (
    <>
      <MenuAction
        floating
        label={translate("save")}
        role="button"
        onClick={() => {
          void saveProject({ source: "toolbar" });
        }}
        readOnlyHotkey={saveShortcut}
      >
        <SaveIcon />
      </MenuAction>
      <MenuAction
        floating
        label={translate("allocateCustomerPoints.menuEntry")}
        role="button"
        onClick={() => allocateCustomerPoints()}
        disabled={customerAllocationDisabled}
      >
        <CustomAllocateCustomerPointsIcon />
      </MenuAction>
    </>
  );

  const undoRedoGroup = isMdOrLarger && (
    <>
      <MenuAction
        floating
        label={translate("undo")}
        role="button"
        onClick={() => {
          userTracking.capture({
            name: "operation.undone",
            source: "toolbar",
          });

          undo();
        }}
        readOnlyHotkey={"ctrl+z"}
        disabled={readonly || !canUndo}
      >
        <UndoIcon />
      </MenuAction>
      <MenuAction
        floating
        label={translate("redo")}
        role="button"
        onClick={() => {
          userTracking.capture({
            name: "operation.redone",
            source: "toolbar",
          });
          redo();
        }}
        readOnlyHotkey={"ctrl+y"}
        disabled={readonly || !canRedo}
      >
        <RedoIcon />
      </MenuAction>
      <Divider />
    </>
  );

  const operationalGroup = (
    <>
      <OperationalDataDropdown floating />
      <MenuAction
        floating
        label={translate("dataTables.title")}
        role="button"
        onClick={showDataTables}
      >
        <TableIcon />
      </MenuAction>
      <MenuAction
        floating
        label={translate("hglProfile.toolbar")}
        role="button"
        selected={currentMode === Mode.HGL_PROFILE}
        onClick={() => {
          showHglProfile({ source: "toolbar" });
          startProfileSelection({ source: "toolbar" });
        }}
      >
        <HglProfileIcon />
      </MenuAction>
    </>
  );

  return (
    <div
      className="map-project-toolbar map-overlay-theme absolute left-2 top-2 z-30 flex items-center"
      onKeyDown={(event) => event.stopPropagation()}
      onKeyPress={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <FileDropdown floating />
      {fileActionsGroup}
      <Divider />
      {undoRedoGroup}
      {operationalGroup}
    </div>
  );
};

export const ViewControls = () => {
  const isSmOrLarger = useBreakpoint("sm");

  return (
    <div
      className="map-view-controls map-overlay-theme absolute right-2 top-2 z-30 flex items-center"
      onKeyDown={(event) => event.stopPropagation()}
      onKeyPress={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <CommandBarButton />
      {isSmOrLarger ? <LayoutActions /> : <VerticalLayoutActions />}
    </div>
  );
};

const Divider = () => {
  return <div className="map-project-toolbar-divider" />;
};

const CommandBarButton = () => {
  const translate = useTranslate();
  const setOpen = useSetAtom(commandBarOpenAtom);
  const userTracking = useUserTracking();

  return (
    <MenuAction
      floating
      label={translate("assetSearch.placeholder")}
      role="button"
      onClick={() => {
        userTracking.capture({
          name: "commandBar.opened",
          source: "toolbar",
        });
        setOpen(true);
      }}
      readOnlyHotkey="ctrl+k"
    >
      <SearchIcon />
    </MenuAction>
  );
};

const VerticalLayoutActions = () => {
  const translate = useTranslate();
  const splits = useAtomValue(splitsAtom);
  const toggleVerticalPanel = useToggleVerticalPanel();

  return (
    <MenuAction
      floating
      label={translate("toggleBottomPanel")}
      role="button"
      onClick={() => {
        toggleVerticalPanel({ source: "toolbar" });
      }}
    >
      {splits.verticalOpen ? <PanelBottomActiveIcon /> : <PanelBottomIcon />}
    </MenuAction>
  );
};

const LayoutActions = () => {
  const translate = useTranslate();
  const splits = useAtomValue(splitsAtom);
  const hasLeftPanels = useAtomValue(panelsIn("left")).length > 0;
  const toggleLeftPanel = useToggleLeftPanel();
  const toggleBottomPanel = useToggleBottomPanel();
  const toggleSidePanel = useToggleSidePanel();

  const leftPanelIcon = splits.leftOpen ? (
    <PanelLeftActiveIcon />
  ) : (
    <PanelLeftIcon />
  );
  const bottomPanelIcon = splits.bottomOpen ? (
    <PanelBottomActiveIcon />
  ) : (
    <PanelBottomIcon />
  );
  const rightPanelIcon = splits.rightOpen ? (
    <PanelRightActiveIcon />
  ) : (
    <PanelRightIcon />
  );

  return (
    <>
      {hasLeftPanels && (
        <MenuAction
          floating
          label={translate("toggleLeftPanel")}
          role="button"
          onClick={() => {
            toggleLeftPanel({ source: "toolbar" });
          }}
          readOnlyHotkey={toggleLeftPanelShortcut}
        >
          {leftPanelIcon}
        </MenuAction>
      )}

      <MenuAction
        floating
        label={translate("toggleBottomPanel")}
        role="button"
        onClick={() => {
          toggleBottomPanel({ source: "toolbar" });
        }}
        readOnlyHotkey={toggleBottomPanelShortcut}
      >
        {bottomPanelIcon}
      </MenuAction>

      <MenuAction
        floating
        label={translate("toggleSidePanel")}
        role="button"
        onClick={() => {
          toggleSidePanel({ source: "toolbar" });
        }}
        readOnlyHotkey={toggleSidePanelShortcut}
      >
        {rightPanelIcon}
      </MenuAction>
    </>
  );
};
