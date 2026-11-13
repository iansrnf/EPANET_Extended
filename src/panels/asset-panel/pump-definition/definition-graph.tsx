import type { CurvePoint } from "@epanet-js/hydraulic-model";
import { LineGraph } from "src/components/graphs/line-graph";
import { useTranslate } from "src/hooks/use-translate";
import { DefinitionCard } from "./definition-fields";

export const DefinitionGraph = ({
  title,
  description,
  points,
  linePoints,
  xLabel,
  yLabel,
}: {
  title: string;
  description?: string;
  points: CurvePoint[];
  linePoints: CurvePoint[];
  xLabel: string;
  yLabel: string;
}) => {
  const translate = useTranslate();
  const visiblePoints = points.filter(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
  );

  return (
    <DefinitionCard title={title} description={description}>
      <div
        role="group"
        aria-label={`${title}: ${xLabel}, ${yLabel}`}
        className="h-72 min-w-0"
      >
        {linePoints.length > 0 ? (
          <LineGraph
            points={visiblePoints.length > 0 ? visiblePoints : linePoints}
            linePoints={linePoints}
            xAxisLabel={xLabel}
            yAxisLabel={yLabel}
            zoomable
            resetZoomLabel={translate("pumpDefinitionEditor.resetZoom")}
            zoomInstructions={translate(
              "pumpDefinitionEditor.zoomInstructions",
            )}
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded-md bg-panel p-4 text-center text-size-base text-subtle">
            {translate("pumpDefinitionEditor.graphUnavailable")}
          </div>
        )}
      </div>
    </DefinitionCard>
  );
};
