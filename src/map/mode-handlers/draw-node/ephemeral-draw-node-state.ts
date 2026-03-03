import { Position } from "src/types";

type NodeType = "junction" | "reservoir" | "tank" | "loggerPoint";

export interface EphemeralDrawNode {
  type: "drawNode";
  nodeType: NodeType;
  pipeSnappingPosition: Position | null;
  pipeId: number | null;
  nodeSnappingId: number | null;
  nodeReplacementId: number | null;
}
