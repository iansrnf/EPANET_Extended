import { modeAtom, Mode, MODE_INFO } from "src/state/mode";
import MenuAction from "src/components/menu-action";
import { memo } from "react";
import { useAtomValue } from "jotai";
import { useUserTracking } from "src/infra/user-tracking";
import { useDrawingMode } from "src/commands/set-drawing-mode";
import { useTranslate } from "src/hooks/use-translate";
import { SelectionTool } from "./toolbar/selection-tool";
import { TraceTool } from "./toolbar/trace-tool";

import {
  JunctionIcon,
  ReservoirIcon,
  TankIcon,
  MouseCursorDefaultIcon,
  PumpIcon,
  ValveIcon,
  PipeIcon,
  CustomerPointIcon,
  PressureLoggerIcon,
} from "src/icons";

const MODE_OPTIONS = [
  {
    mode: Mode.DRAW_JUNCTION,
    hotkey: "2",
    Icon: () => <JunctionIcon />,
  },
  {
    mode: Mode.DRAW_RESERVOIR,
    hotkey: "3",
    Icon: () => <ReservoirIcon />,
  },
  {
    mode: Mode.DRAW_TANK,
    hotkey: "4",
    Icon: () => <TankIcon />,
  },
  {
    mode: Mode.DRAW_PIPE,
    hotkey: "5",
    Icon: () => <PipeIcon />,
  },
  {
    mode: Mode.DRAW_PUMP,
    hotkey: "6",
    Icon: () => <PumpIcon />,
  },
  {
    mode: Mode.DRAW_VALVE,
    hotkey: "7",
    Icon: () => <ValveIcon />,
  },
] as const;

const CUSTOMER_POINT_MODE = {
  mode: Mode.DRAW_CUSTOMER_POINT,
  hotkey: "8",
  labelKey: "customerPoint",
  Icon: () => <CustomerPointIcon />,
} as const;

const PRESSURE_LOGGER_MODE = {
  mode: Mode.DRAW_PRESSURE_LOGGER,
  hotkey: "9",
  labelKey: "pressureLogger",
  Icon: () => <PressureLoggerIcon />,
} as const;

export default memo(function Modes({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const { mode: currentMode } = useAtomValue(modeAtom);
  const setDrawingMode = useDrawingMode();
  const userTracking = useUserTracking();
  const translate = useTranslate();
  const drawingModes = [...MODE_OPTIONS, CUSTOMER_POINT_MODE, PRESSURE_LOGGER_MODE];

  return (
    <div className="flex items-center justify-start" role="radiogroup">
      <MenuAction
        role="radio"
        key={Mode.NONE}
        selected={currentMode === Mode.NONE}
        readOnlyHotkey={"1"}
        label={translate(MODE_INFO[Mode.NONE].name)}
        onClick={() => {
          userTracking.capture({
            name: "drawingMode.enabled",
            source: "toolbar",
            type: MODE_INFO[Mode.NONE].name,
          });
          void setDrawingMode(Mode.NONE);
        }}
      >
        <MouseCursorDefaultIcon />
      </MenuAction>
      <SelectionTool />
      <TraceTool />
      {drawingModes.map(({ mode, hotkey, labelKey, Icon }) => {
        const modeInfo = MODE_INFO[mode];
        const label = translate(labelKey ?? modeInfo.name);

        return (
          <MenuAction
            role="radio"
            key={`${mode}-${hotkey}`}
            selected={currentMode === mode}
            readOnlyHotkey={hotkey}
            label={label}
            onClick={() => {
              userTracking.capture({
                name: "drawingMode.enabled",
                source: "toolbar",
                type: labelKey ?? modeInfo.name,
              });
              void setDrawingMode(mode);
            }}
            disabled={disabled}
          >
            <Icon />
          </MenuAction>
        );
      })}
    </div>
  );
});
