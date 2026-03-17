import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { Maybe } from "purify-ts/Maybe";
import { ZoomToIcon } from "src/icons";
import { BBox } from "src/types";
import { useZoomTo } from "src/hooks/use-zoom-to";
import { selectionAtom } from "src/state/selection";
import { stagingModelAtom } from "src/state/hydraulic-model";
import { useTranslate } from "src/hooks/use-translate";
import { ActionButton } from "src/components/panels/asset-panel/actions/action-button";
import { SectionList } from "src/components/form/fields";
import {
  SectionWrapper,
  TextRow,
} from "src/components/panels/asset-panel/ui-components";

export function PressureLoggerPanel() {
  const selection = useAtomValue(selectionAtom);
  const hydraulicModel = useAtomValue(stagingModelAtom);
  const translate = useTranslate();
  const zoomTo = useZoomTo();

  const pressureLogger =
    selection.type === "singlePressureLogger"
      ? hydraulicModel.pressureLoggers.get(selection.id)
      : undefined;

  const coordinates = useMemo(() => {
    if (!pressureLogger) return null;
    const [lng, lat] = pressureLogger.coordinates;
    return {
      longitude: String(lng),
      latitude: String(lat),
    };
  }, [pressureLogger]);

  if (!pressureLogger || !coordinates) return null;

  return (
    <div className="flex flex-col flex-grow overflow-hidden">
      <div className="px-3 pt-4 pb-3 relative">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold p-1 truncate">
            {pressureLogger.label}
          </span>
          <div className="flex gap-1 h-8 shrink-0">
            <ActionButton
              action={{
                icon: <ZoomToIcon />,
                applicable: true,
                label: translate("zoomTo"),
                onSelect: function doZoomTo() {
                  const [lng, lat] = pressureLogger.coordinates;
                  return Promise.resolve(
                    zoomTo(Maybe.of([lng, lat, lng, lat] as BBox)),
                  );
                },
              }}
            />
          </div>
        </div>
        <span className="text-sm text-gray-500 pl-1">
          {translate("pressureLogger")}
        </span>
      </div>
      <SectionList gap={3} padding={4}>
        <SectionWrapper
          title={translate("coordinates")}
          section="modelAttributes"
        >
          <TextRow name="longitude" value={coordinates.longitude} />
          <TextRow name="latitude" value={coordinates.latitude} />
        </SectionWrapper>
      </SectionList>
    </div>
  );
}
