import { Position } from "src/types";
import type { NodeType } from "src/hydraulic-model/asset-types/types";

export interface EphemeralDrawNode {
  type: "drawNode";
  nodeType: NodeType;
  pipeSnappingPosition: Position | null;
  pipeId: number | null;
  nodeSnappingId: number | null;
  nodeReplacementId: number | null;
}
