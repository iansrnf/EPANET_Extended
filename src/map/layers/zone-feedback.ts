import type { LineLayer } from "mapbox-gl";
import { assetFeedbackStrokes } from "../feedback-style";

export const makeZoneFeedbackLayers = (): LineLayer[] =>
  (["selected", "hover"] as const).flatMap((kind) =>
    assetFeedbackStrokes.map(
      ({ suffix, color, width, opacity }): LineLayer => ({
        id: `zones-${kind}-${suffix === "ring" ? "outline" : suffix}`,
        type: "line",
        source: "zones",
        filter: ["in", ["get", "id"], ["literal", []]],
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: {
          "line-color": color,
          "line-width": width,
          "line-opacity": opacity,
        },
      }),
    ),
  );
