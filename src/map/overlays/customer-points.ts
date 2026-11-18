import { LineLayer, PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import { PathStyleExtension } from "@deck.gl/extensions";
import {
  CustomerPoint,
  CustomerPoints,
  Pipe,
} from "@epanet-js/hydraulic-model";
import { hexToArray } from "src/lib/color";
import { strokeColorFor } from "@epanet-js/map";
import { colors } from "src/lib/constants";
import { Position } from "src/types";
import { AssetsMap } from "src/hydraulic-model";
import { EphemeralMoveCustomerPoint } from "src/state/drawing";
import { assetFeedbackStrokes } from "../feedback-style";

interface ConnectionLineData {
  sourcePosition: [number, number];
  targetPosition: [number, number];
  customerPointId: number;
}

interface CustomerPointData {
  id: number;
  coordinates: Position;
  snapPosition: Position | null;
  isActive: boolean;
}

const fillColor = hexToArray(colors.gray500);
const strokeColor = hexToArray(strokeColorFor(colors.gray500));
const connectionLineColor = hexToArray(colors.gray300);

const disabledFillColor = hexToArray(colors.gray300);
const disabledStrokeColor = hexToArray(colors.gray400);
const disabledConnectionLineColor = hexToArray(colors.gray300);

const highlightFillColor = hexToArray(colors.cyan500);
const previewLineColor = hexToArray(colors.indigo500);
const oldConnectionLineColor = hexToArray(colors.indigo500, 0.4) as [
  number,
  number,
  number,
  number,
];
const haloFillColor = hexToArray(colors.cyan300, 0.8) as [
  number,
  number,
  number,
  number,
];

const selectionStrokeColor = hexToArray("#ffffff");
const selectionContrastColor = hexToArray(colors.indigo900, 0.4);

export type CustomerPointsLayer = ScatterplotLayer | LineLayer | PathLayer;
export type CustomerPointsOverlay = CustomerPointsLayer[];

const SELECTED_LINE_WIDTH = 2.5;
const EMPTY_SELECTION: ReadonlySet<number> = new Set();

const customerPointFillColor = (d: CustomerPointData) =>
  d.isActive ? fillColor : disabledFillColor;

const customerPointLineColor =
  (selectedIds: ReadonlySet<number>) => (d: CustomerPointData) => {
    if (selectedIds.has(d.id)) {
      return selectionStrokeColor;
    }
    return d.isActive ? strokeColor : disabledStrokeColor;
  };

const customerPointLineWidth =
  (selectedIds: ReadonlySet<number>) => (d: CustomerPointData) =>
    selectedIds.has(d.id) ? SELECTED_LINE_WIDTH : 1;

export const shouldShowOvelay = (zoom: number) => zoom >= 14;

export const updateCustomerPointsOverlayVisibility = (
  overlay: CustomerPointsOverlay,
  zoom: number,
) => {
  return overlay.map(
    (layer) =>
      layer.clone({ visible: shouldShowOvelay(zoom) }) as CustomerPointsLayer,
  );
};

export const buildCustomerPointsOverlay = (
  customerPoints: CustomerPoints,
  assets: AssetsMap,
  zoom: number,
  excludedCustomerPointIds?: Set<number>,
  selectedIds: ReadonlySet<number> = EMPTY_SELECTION,
  selectionToken: unknown = null,
): CustomerPointsOverlay => {
  const customerPointsData: CustomerPointData[] = [];
  const connectionLinesData: Array<ConnectionLineData & { isActive: boolean }> =
    [];

  for (const customerPoint of customerPoints.values()) {
    if (excludedCustomerPointIds?.has(customerPoint.id)) {
      continue;
    }

    let isActive = false;

    if (customerPoint.connection) {
      const pipe = assets.get(customerPoint.connection.pipeId) as
        Pipe | undefined;
      isActive = pipe?.isActive ?? false;
    }

    customerPointsData.push({
      id: customerPoint.id,
      coordinates: customerPoint.coordinates,
      snapPosition: customerPoint.snapPosition,
      isActive,
    });

    const snapPosition = customerPoint.snapPosition;
    if (snapPosition) {
      connectionLinesData.push({
        sourcePosition: customerPoint.coordinates as [number, number],
        targetPosition: snapPosition as [number, number],
        customerPointId: customerPoint.id,
        isActive,
      });
    }
  }

  const isVisible = shouldShowOvelay(zoom);

  const connectionLinesLayer = new LineLayer({
    id: "customer-connection-lines-layer",
    beforeId: "main-features-pipes",
    data: connectionLinesData,
    getSourcePosition: (d: ConnectionLineData) => d.sourcePosition,
    getTargetPosition: (d: ConnectionLineData) => d.targetPosition,

    widthUnits: "meters",
    getWidth: 0.8,
    widthMinPixels: 0,
    widthMaxPixels: 2,

    getColor: (d) =>
      d.isActive ? connectionLineColor : disabledConnectionLineColor,
    antialiasing: true,
    visible: isVisible,
  });

  const scatterLayer = new ScatterplotLayer({
    id: "customer-points-layer",
    beforeId: "ephemeral-junction-highlight",
    data: customerPointsData,
    getPosition: (d) => d.coordinates as [number, number],

    radiusUnits: "meters",
    getRadius: 1.5,
    radiusMinPixels: 0,
    radiusMaxPixels: 4,

    getFillColor: customerPointFillColor,
    stroked: true,
    getLineColor: customerPointLineColor(selectedIds),
    getLineWidth: customerPointLineWidth(selectedIds),
    lineWidthUnits: "pixels",
    lineWidthMinPixels: 1,
    lineWidthMaxPixels: 3,
    updateTriggers: {
      getLineColor: selectionToken,
      getLineWidth: selectionToken,
    },
    antialiasing: true,
    visible: isVisible,
    pickable: true,
  });

  return [connectionLinesLayer, scatterLayer];
};

// Re-applies fill/stroke styling to an existing overlay without rebuilding.
export const applyCustomerPointsStyles = (
  overlay: CustomerPointsOverlay,
  selectedIds: ReadonlySet<number>,
  stylesToken: unknown,
): CustomerPointsOverlay =>
  overlay.map((layer) => {
    if (layer.id !== "customer-points-layer") return layer;
    return layer.clone({
      getLineColor: customerPointLineColor(selectedIds),
      getLineWidth: customerPointLineWidth(selectedIds),
      updateTriggers: {
        getLineColor: stylesToken,
        getLineWidth: stylesToken,
      },
    }) as CustomerPointsLayer;
  });

export const buildCustomerPointHoverOverlay = (
  customerPoint: CustomerPoint | undefined,
  zoom: number,
  selectedCustomerPoint?: CustomerPoint,
): CustomerPointsOverlay => {
  const data = selectedCustomerPoint ? [selectedCustomerPoint] : [];
  if (customerPoint && customerPoint.id !== selectedCustomerPoint?.id) {
    data.push(customerPoint);
  }
  if (data.length === 0) return [];

  return assetFeedbackStrokes.map(
    ({ suffix, color, width, opacity }) =>
      new ScatterplotLayer<CustomerPoint, { beforeId: string }>({
        id: `customer-point-hover-${suffix}`,
        beforeId: "ephemeral-junction-highlight",
        data,
        getPosition: (point) => point.coordinates as [number, number],
        radiusUnits: "meters",
        getRadius: 3,
        radiusMinPixels: 4,
        radiusMaxPixels: 8,
        filled: false,
        stroked: true,
        getLineColor: hexToArray(color, opacity),
        getLineWidth: width,
        lineWidthUnits: "pixels",
        visible: shouldShowOvelay(zoom),
        pickable: false,
      }),
  );
};

export const buildCustomerPointsHighlightOverlay = (
  highlightedPoints: CustomerPoint[],
  zoom: number,
): CustomerPointsOverlay => {
  if (highlightedPoints.length === 0) {
    return [];
  }

  const isVisible = shouldShowOvelay(zoom);

  const haloLayer = new ScatterplotLayer({
    id: "customer-points-halo-layer",
    beforeId: "ephemeral-junction-highlight",
    data: highlightedPoints,
    getPosition: (d: CustomerPoint) => d.coordinates as [number, number],

    radiusUnits: "meters",
    getRadius: 3,
    radiusMinPixels: 0,
    radiusMaxPixels: 6,

    getFillColor: haloFillColor,
    antialiasing: true,
    visible: isVisible,
  });

  const highlightLayer = new ScatterplotLayer({
    id: "customer-points-highlight-layer",
    beforeId: "ephemeral-junction-highlight",
    data: highlightedPoints,
    getPosition: (d: CustomerPoint) => d.coordinates as [number, number],

    radiusUnits: "meters",
    getRadius: 1.5,
    radiusMinPixels: 0,
    radiusMaxPixels: 4,

    getFillColor: highlightFillColor,
    stroked: true,
    getLineColor: haloFillColor,
    getLineWidth: 1,
    lineWidthUnits: "pixels",
    lineWidthMinPixels: 1,
    lineWidthMaxPixels: 2,
    antialiasing: true,
    visible: isVisible,
  });

  return [haloLayer, highlightLayer];
};

export const buildCustomerPointsSelectionOverlay = (
  selectedPoints: CustomerPoint[],
  isActive: boolean,
  zoom: number,
): CustomerPointsOverlay => {
  if (selectedPoints.length === 0) {
    return [];
  }

  const isVisible = shouldShowOvelay(zoom);

  const haloLayer = new ScatterplotLayer({
    id: "customer-points-selection-halo-layer",
    beforeId: "ephemeral-junction-highlight",
    data: selectedPoints,
    getPosition: (d: CustomerPoint) => d.coordinates as [number, number],

    radiusUnits: "meters",
    getRadius: 3,
    radiusMinPixels: 0,
    radiusMaxPixels: 6,

    filled: false,
    stroked: true,
    getLineColor: selectionContrastColor,
    getLineWidth: 3.5,
    lineWidthUnits: "pixels",
    antialiasing: true,
    visible: isVisible,
  });

  const selectionLayer = new ScatterplotLayer({
    id: "customer-points-selection-layer",
    beforeId: "ephemeral-junction-highlight",
    data: selectedPoints,
    getPosition: (d: CustomerPoint) => d.coordinates as [number, number],

    radiusUnits: "meters",
    getRadius: 1.5,
    radiusMinPixels: 0,
    radiusMaxPixels: 4,

    getFillColor: isActive ? fillColor : disabledFillColor,
    stroked: true,
    getLineColor: selectionStrokeColor,
    getLineWidth: SELECTED_LINE_WIDTH,
    lineWidthUnits: "pixels",
    lineWidthMinPixels: 1,
    lineWidthMaxPixels: 3,
    antialiasing: true,
    visible: isVisible,
  });

  return [haloLayer, selectionLayer];
};

export const buildConnectCustomerPointsPreviewOverlay = (
  customerPoints: CustomerPoint[],
  snapPoints: Position[],
  zoom: number,
  mode: "highlight" | "quiet" = "highlight",
): CustomerPointsOverlay => {
  if (customerPoints.length === 0) {
    return [];
  }

  const isVisible = shouldShowOvelay(zoom);
  const isQuietMode = mode === "quiet";

  const oldConnectionLines: ConnectionLineData[] = [];
  for (const customerPoint of customerPoints) {
    if (customerPoint.snapPosition) {
      oldConnectionLines.push({
        sourcePosition: customerPoint.coordinates as [number, number],
        targetPosition: customerPoint.snapPosition as [number, number],
        customerPointId: customerPoint.id,
      });
    }
  }

  const oldConnectionLinesLayer = new LineLayer({
    id: "customer-connect-old-lines-layer",
    beforeId: "main-features-pipes",
    data: oldConnectionLines,
    getSourcePosition: (d: ConnectionLineData) => d.sourcePosition,
    getTargetPosition: (d: ConnectionLineData) => d.targetPosition,
    widthUnits: "meters",
    getWidth: 0.8,
    widthMinPixels: 0,
    widthMaxPixels: 2,
    getColor: oldConnectionLineColor,
    antialiasing: true,
    visible: isVisible,
  });

  if (snapPoints.length === 0) {
    return [oldConnectionLinesLayer];
  }

  const connectionLines: ConnectionLineData[] = [];
  for (let i = 0; i < customerPoints.length && i < snapPoints.length; i++) {
    connectionLines.push({
      sourcePosition: customerPoints[i].coordinates as [number, number],
      targetPosition: snapPoints[i] as [number, number],
      customerPointId: customerPoints[i].id,
    });
  }

  const lineColor = isQuietMode ? connectionLineColor : previewLineColor;

  const previewConnectionLinesLayer = new PathLayer({
    id: "customer-connect-preview-lines-layer",
    beforeId: "main-features-pipes",
    data: connectionLines,
    getPath: (d: ConnectionLineData) => [d.sourcePosition, d.targetPosition],
    widthUnits: "meters",
    getWidth: 0.8,
    widthMinPixels: 1,
    widthMaxPixels: 3,
    getColor: lineColor,
    getDashArray: [5, 3],
    dashJustified: true,
    extensions: [new PathStyleExtension({ dash: true })],
    antialiasing: true,
    visible: isVisible,
  });

  return [oldConnectionLinesLayer, previewConnectionLinesLayer];
};

export const buildMovingCustomerPointOverlay = (
  ephemeralState: EphemeralMoveCustomerPoint,
  zoom: number,
  assets?: AssetsMap,
): CustomerPointsOverlay => {
  const isVisible = shouldShowOvelay(zoom);
  const layers: CustomerPointsOverlay = [];
  const connection = ephemeralState.customerPoint.connection;
  const isActive = connection
    ? (assets?.get(connection.pipeId)?.isActive ?? false)
    : false;
  const movingPoints = [{ coordinates: ephemeralState.movedCoordinates }];

  const snapPosition = ephemeralState.customerPoint.snapPosition;
  if (snapPosition) {
    const connectionLineData: ConnectionLineData[] = [
      {
        sourcePosition: ephemeralState.movedCoordinates as [number, number],
        targetPosition: snapPosition as [number, number],
        customerPointId: ephemeralState.customerPoint.id,
      },
    ];

    layers.push(
      new LineLayer({
        id: "moving-customer-connection-line-layer",
        beforeId: "main-features-pipes",
        data: connectionLineData,
        getSourcePosition: (d: ConnectionLineData) => d.sourcePosition,
        getTargetPosition: (d: ConnectionLineData) => d.targetPosition,
        widthUnits: "meters",
        getWidth: 0.8,
        widthMinPixels: 0,
        widthMaxPixels: 2,
        getColor: connectionLineColor,
        antialiasing: true,
        visible: isVisible,
      }),
    );
  }

  for (const { suffix, color, width, opacity } of assetFeedbackStrokes) {
    layers.push(
      new ScatterplotLayer({
        id: `moving-customer-point-${suffix}-layer`,
        beforeId: "ephemeral-junction-highlight",
        data: movingPoints,
        getPosition: (d: { coordinates: Position }) =>
          d.coordinates as [number, number],
        radiusUnits: "meters",
        getRadius: 3,
        radiusMinPixels: 4,
        radiusMaxPixels: 8,
        filled: false,
        stroked: true,
        getLineColor: hexToArray(color, opacity),
        getLineWidth: width,
        lineWidthUnits: "pixels",
        antialiasing: true,
        visible: isVisible,
        pickable: false,
      }),
    );
  }

  layers.push(
    new ScatterplotLayer({
      id: "moving-customer-point-layer",
      beforeId: "ephemeral-junction-highlight",
      data: movingPoints,
      getPosition: (d: { coordinates: Position }) =>
        d.coordinates as [number, number],
      radiusUnits: "meters",
      getRadius: 1.5,
      radiusMinPixels: 0,
      radiusMaxPixels: 4,
      getFillColor: isActive ? fillColor : disabledFillColor,
      stroked: true,
      getLineColor: isActive ? strokeColor : disabledStrokeColor,
      getLineWidth: 1,
      lineWidthUnits: "pixels",
      lineWidthMinPixels: 1,
      lineWidthMaxPixels: 2,
      antialiasing: true,
      visible: isVisible,
    }),
  );

  return layers;
};
