import {
  pumpDefinitionSchema,
  type PumpDefinition,
  type PumpDefinitionHeadType,
} from "@epanet-js/model-schema";
import type { CurvePoint } from "./curves";

export {
  pumpDefinitionHeadTypes,
  pumpDefinitionEfficiencyTypes,
} from "@epanet-js/model-schema";
export type {
  PumpDefinition,
  PumpDefinitionHeadType,
  PumpDefinitionEfficiencyType,
} from "@epanet-js/model-schema";

export type PumpDefinitionErrorCode =
  | "required"
  | "positive"
  | "percentage"
  | "pointCount"
  | "flowOrder"
  | "headOrder"
  | "shutoffFlow"
  | "extendedFlow"
  | "bepMaxFlow"
  | "name"
  | "curveFit"
  | "invalidNumber";

export type PumpDefinitionError = {
  path: string;
  code: PumpDefinitionErrorCode;
};

export type PumpDefinitionHeadCoefficients = {
  a: number;
  b: number;
  c: number;
};

export const createDefaultPumpDefinition = (
  id: string,
  name: string,
): PumpDefinition => ({
  id,
  name,
  head: {
    type: "standard",
    power: 10,
    points: [
      { x: 0, y: 50 },
      { x: 10, y: 40 },
      { x: 20, y: 10 },
    ],
  },
  efficiency: {
    type: "constant",
    value: 75,
    bepFlow: 10,
    points: [
      { x: 0, y: 50 },
      { x: 10, y: 75 },
      { x: 20, y: 50 },
    ],
  },
  motor: {
    efficiency: 95,
    variableSpeedDrive: false,
    points: [
      { x: 0.5, y: 90 },
      { x: 1, y: 95 },
    ],
  },
  notes: "",
});

export const clonePumpDefinition = (
  definition: PumpDefinition,
): PumpDefinition => ({
  ...definition,
  head: {
    ...definition.head,
    points: definition.head.points.map((point) => ({ ...point })),
  },
  efficiency: {
    ...definition.efficiency,
    points: definition.efficiency.points.map((point) => ({ ...point })),
  },
  motor: {
    ...definition.motor,
    points: definition.motor.points.map((point) => ({ ...point })),
  },
});

export const changePumpDefinitionHeadType = (
  definition: PumpDefinition,
  type: PumpDefinitionHeadType,
): PumpDefinition => {
  const changed = clonePumpDefinition(definition);
  const previousType = changed.head.type;
  const points = changed.head.points;
  const design =
    previousType === "designPoint"
      ? points[0]
      : points[Math.floor(points.length / 2)];
  const validDesign =
    design && design.x > 0 && design.y > 0 ? design : { x: 10, y: 40 };
  if (type === "designPoint") {
    changed.head.points = [{ ...validDesign }];
  } else if (type !== "power") {
    if (points.length < 3 || previousType === "designPoint") {
      changed.head.points = [
        { x: 0, y: validDesign.y * 1.33334 },
        { ...validDesign },
        { x: validDesign.x * 2, y: 0 },
      ];
    } else if (type !== "multiplePoint") {
      changed.head.points = [
        { x: 0, y: points[0].y },
        { ...validDesign },
        { ...points[points.length - 1] },
      ];
    }
    if (type === "customExtended") {
      const last = changed.head.points[2];
      if (last.y === 0) last.y = validDesign.y * 0.25;
      if (!(changed.head.extendedFlow! > last.x)) {
        changed.head.extendedFlow = last.x * 1.25;
      }
    }
  }
  changed.head.type = type;
  return changed;
};

export const getPumpDefinitionErrors = (
  definition: PumpDefinition,
): PumpDefinitionError[] => {
  const parsed = pumpDefinitionSchema.safeParse(definition);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      code: issue.code === "invalid_type" ? "required" : "invalidNumber",
    }));
  }
  const errors: PumpDefinitionError[] = [];
  if (!definition.name.trim()) errors.push({ path: "name", code: "name" });
  errors.push(...getHeadErrors(definition));
  const efficiency = definition.efficiency;
  if (efficiency.type === "multiplePoint") {
    errors.push(
      ...getEfficiencyPointErrors(efficiency.points, "efficiency.points"),
    );
  } else {
    if (!(efficiency.value > 0 && efficiency.value <= 100)) {
      errors.push({ path: "efficiency.value", code: "percentage" });
    }
    if (efficiency.type === "bep") {
      if (efficiency.bepFlow <= 0) {
        errors.push({ path: "efficiency.bepFlow", code: "positive" });
      }
      if (
        efficiency.maxFlow !== undefined &&
        efficiency.maxFlow <= efficiency.bepFlow
      ) {
        errors.push({ path: "efficiency.maxFlow", code: "bepMaxFlow" });
      }
    }
  }
  if (definition.motor.variableSpeedDrive) {
    errors.push(
      ...getEfficiencyPointErrors(definition.motor.points, "motor.points"),
    );
  }
  if (!(
    definition.motor.efficiency > 0 && definition.motor.efficiency <= 100
  )) {
    errors.push({ path: "motor.efficiency", code: "percentage" });
  }
  return errors;
};

export const getPumpDefinitionHeadCoefficients = (
  definition: PumpDefinition,
): PumpDefinitionHeadCoefficients | null => {
  if (!pumpDefinitionSchema.safeParse(definition).success) return null;
  if (getHeadErrors(definition).length) return null;
  const { head } = definition;
  if (head.type === "power") return null;
  if (head.type === "multiplePoint") {
    return head.interpolation === "fitted"
      ? fitMultiplePointHeadCurve(head.points)
      : null;
  }
  return fitHeadCurve(
    head.type === "designPoint"
      ? [
          { x: 0, y: head.points[0].y * 1.33334 },
          head.points[0],
          { x: head.points[0].x * 2, y: 0 },
        ]
      : head.points,
  );
};

export const getPumpDefinitionHeadPoints = (
  definition: PumpDefinition,
  speed = 1,
): CurvePoint[] => {
  if (!Number.isFinite(speed) || speed <= 0) return [];
  if (!pumpDefinitionSchema.safeParse(definition).success) return [];
  if (getHeadErrors(definition).length > 0) return [];
  const { head } = definition;
  if (head.type === "power") return [];
  if (head.type === "multiplePoint") {
    if (head.interpolation === "fitted") {
      const coefficients = fitMultiplePointHeadCurve(head.points);
      return coefficients
        ? sampleFittedHeadCurve(
            coefficients,
            head.points[head.points.length - 1].x,
          ).map((point) => ({
            x: point.x * speed,
            y: point.y * speed * speed,
          }))
        : [];
    }
    const points = head.points.map((point) => ({ ...point }));
    if (points.length === 3) {
      points.splice(1, 0, {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
      });
    }
    return points.map((point) => ({
      x: point.x * speed,
      y: point.y * speed * speed,
    }));
  }
  const points =
    head.type === "designPoint"
      ? [
          { x: 0, y: head.points[0].y * 1.33334 },
          head.points[0],
          { x: head.points[0].x * 2, y: 0 },
        ]
      : head.points;
  const coefficients = fitHeadCurve(points);
  if (!coefficients) return [];
  const normalized = sampleHeadCurve(points, coefficients);
  if (head.type === "customExtended") {
    normalized.push({ x: head.extendedFlow!, y: 0 });
  } else if (head.type === "standardExtended") {
    const zeroFlow = Math.pow(
      coefficients.a / coefficients.b,
      1 / coefficients.c,
    );
    const last = points[2];
    if (zeroFlow > last.x * (1 + 1e-10)) {
      for (let index = 1; index <= 12; index++) {
        const x = last.x + ((zeroFlow - last.x) * index) / 12;
        normalized.push({
          x,
          y: index === 12 ? 0 : evaluateHead(coefficients, x),
        });
      }
    }
  }
  return normalized.map((point) => ({
    x: point.x * speed,
    y: point.y * speed * speed,
  }));
};

export const getPumpDefinitionEfficiencyPoints = (
  definition: PumpDefinition,
  speed = 1,
): CurvePoint[] => {
  if (!Number.isFinite(speed) || speed <= 0) return [];
  if (!pumpDefinitionSchema.safeParse(definition).success) return [];
  const efficiency = definition.efficiency;
  if (efficiency.type === "multiplePoint") {
    return getEfficiencyPointErrors(efficiency.points, "efficiency.points")
      .length
      ? []
      : efficiency.points.map((point) => ({ x: point.x * speed, y: point.y }));
  }
  if (!(efficiency.value > 0 && efficiency.value <= 100)) return [];
  if (efficiency.type === "constant") {
    const headPoints = getPumpDefinitionHeadPoints(definition);
    const maximum = headPoints.at(-1)?.x ?? Math.max(efficiency.bepFlow * 2, 1);
    return [
      { x: 0, y: efficiency.value },
      { x: maximum * speed, y: efficiency.value },
    ];
  }
  const maximum = efficiency.maxFlow ?? efficiency.bepFlow * 2;
  if (!(efficiency.bepFlow > 0 && maximum > efficiency.bepFlow)) return [];
  const points: CurvePoint[] = [];
  for (let index = 0; index <= 24; index++) {
    const x = (efficiency.bepFlow * index) / 24;
    points.push({
      x,
      y:
        efficiency.value *
        (1 - Math.pow((x - efficiency.bepFlow) / efficiency.bepFlow, 2)),
    });
  }
  for (let index = 1; index <= 24; index++) {
    const x =
      efficiency.bepFlow + ((maximum - efficiency.bepFlow) * index) / 24;
    points.push({
      x,
      y:
        index === 24
          ? 0
          : efficiency.value *
            (1 -
              Math.pow(
                (x - efficiency.bepFlow) / (maximum - efficiency.bepFlow),
                2,
              )),
    });
  }
  return points.map((point) => ({ x: point.x * speed, y: point.y }));
};

export const getPumpDefinitionWireEfficiencyPoints = (
  definition: PumpDefinition,
  speed = 1,
): CurvePoint[] => {
  if (!Number.isFinite(speed) || speed <= 0) return [];
  if (!pumpDefinitionSchema.safeParse(definition).success) return [];
  const motor = definition.motor;
  if (
    motor.variableSpeedDrive &&
    getEfficiencyPointErrors(motor.points, "motor.points").length
  ) {
    return [];
  }
  const driveEfficiency = motor.variableSpeedDrive
    ? interpolateEfficiency(motor.points, speed)
    : 100;
  if (!(motor.efficiency > 0 && motor.efficiency <= 100)) return [];
  if (!(driveEfficiency > 0 && driveEfficiency <= 100)) return [];
  return getPumpDefinitionEfficiencyPoints(definition, speed).map((point) => ({
    x: point.x,
    y: (point.y * motor.efficiency * driveEfficiency) / 10000,
  }));
};

export const getPumpDefinitionEpanetEfficiencyPoints = (
  definition: PumpDefinition,
  speed = 1,
): CurvePoint[] =>
  getPumpDefinitionWireEfficiencyPoints(definition, speed).map((point) => ({
    x: point.x / speed,
    y: Math.max(
      1,
      Math.min(
        100,
        100 -
          (100 - Math.max(1, Math.min(100, point.y))) * Math.pow(speed, 0.1),
      ),
    ),
  }));

type HeadCoefficients = PumpDefinitionHeadCoefficients;

const getHeadErrors = (definition: PumpDefinition): PumpDefinitionError[] => {
  const { head } = definition;
  if (head.type === "power") {
    return head.power > 0 ? [] : [{ path: "head.power", code: "positive" }];
  }
  const errors: PumpDefinitionError[] = [];
  const expected =
    head.type === "designPoint"
      ? 1
      : head.type === "multiplePoint"
        ? undefined
        : 3;
  if (
    (expected && head.points.length !== expected) ||
    head.points.length < (expected ?? (head.interpolation === "fitted" ? 3 : 2))
  ) {
    return [{ path: "head.points", code: "pointCount" }];
  }
  head.points.forEach((point, index) => {
    if (point.x < 0 || (head.type === "designPoint" && point.x === 0)) {
      errors.push({ path: `head.points.${index}.x`, code: "positive" });
    }
    if (
      point.y < 0 ||
      (index < head.points.length - 1 && point.y === 0) ||
      (head.type === "designPoint" && point.y === 0)
    ) {
      errors.push({ path: `head.points.${index}.y`, code: "positive" });
    }
    if (index > 0) {
      if (point.x <= head.points[index - 1].x)
        errors.push({ path: `head.points.${index}.x`, code: "flowOrder" });
      if (point.y >= head.points[index - 1].y)
        errors.push({ path: `head.points.${index}.y`, code: "headOrder" });
    }
  });
  if (head.type !== "designPoint" && head.type !== "multiplePoint") {
    if (head.points[0].x !== 0)
      errors.push({ path: "head.points.0.x", code: "shutoffFlow" });
    if (!errors.length && !fitHeadCurve(head.points))
      errors.push({ path: "head.points", code: "curveFit" });
  }
  if (
    head.type === "multiplePoint" &&
    head.interpolation === "fitted" &&
    !errors.length &&
    !fitMultiplePointHeadCurve(head.points)
  ) {
    errors.push({ path: "head.points", code: "curveFit" });
  }
  if (head.type === "customExtended") {
    const last = head.points[head.points.length - 1];
    if (!(head.extendedFlow !== undefined && head.extendedFlow > last.x)) {
      errors.push({ path: "head.extendedFlow", code: "extendedFlow" });
    }
    if (last.y <= 0)
      errors.push({
        path: `head.points.${head.points.length - 1}.y`,
        code: "positive",
      });
  }
  return errors;
};

const getEfficiencyPointErrors = (
  points: CurvePoint[],
  path: string,
): PumpDefinitionError[] => {
  if (points.length < 2) return [{ path, code: "pointCount" }];
  const errors: PumpDefinitionError[] = [];
  points.forEach((point, index) => {
    if (point.x < 0)
      errors.push({ path: `${path}.${index}.x`, code: "positive" });
    if (!(point.y > 0 && point.y <= 100))
      errors.push({ path: `${path}.${index}.y`, code: "percentage" });
    if (index && point.x <= points[index - 1].x)
      errors.push({ path: `${path}.${index}.x`, code: "flowOrder" });
  });
  return errors;
};

const fitHeadCurve = (points: CurvePoint[]): HeadCoefficients | null => {
  const [shutoff, design, maximum] = points;
  if (!shutoff || !design || !maximum || shutoff.x !== 0) return null;
  const c =
    Math.log((shutoff.y - maximum.y) / (shutoff.y - design.y)) /
    Math.log(maximum.x / design.x);
  const b = (shutoff.y - design.y) / Math.pow(design.x, c);
  const zeroFlow = Math.pow(shutoff.y / b, 1 / c);
  return Number.isFinite(c) &&
    c > 0 &&
    c <= 20 &&
    Number.isFinite(b) &&
    b > 0 &&
    Number.isFinite(zeroFlow)
    ? { a: shutoff.y, b, c }
    : null;
};

const evaluateHead = (coefficients: HeadCoefficients, flow: number) =>
  Math.max(0, coefficients.a - coefficients.b * Math.pow(flow, coefficients.c));

type HeadFitCandidate = {
  coefficients: HeadCoefficients;
  squaredError: number;
};

const fitMultiplePointHeadCurve = (
  points: CurvePoint[],
): HeadCoefficients | null => {
  if (points.length < 3) return null;
  const maximumFlow = points[points.length - 1].x;
  const maximumHead = points[0].y;
  if (!(maximumFlow > 0 && maximumHead > 0)) return null;
  const normalized = points.map((point) => ({
    x: point.x / maximumFlow,
    y: point.y / maximumHead,
  }));
  const candidates = Array.from({ length: 65 }, (_, index) => {
    const exponent = 0.05 * Math.pow(400, index / 64);
    return {
      exponent,
      fit: regressHeadAtExponent(
        normalized,
        exponent,
        maximumFlow,
        maximumHead,
      ),
    };
  });
  let bestIndex = -1;
  let best: HeadFitCandidate | null = null;
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index].fit;
    if (candidate && (!best || candidate.squaredError < best.squaredError)) {
      best = candidate;
      bestIndex = index;
    }
  }
  if (!best) return null;
  let lower = candidates[Math.max(0, bestIndex - 1)].exponent;
  let upper =
    candidates[Math.min(candidates.length - 1, bestIndex + 1)].exponent;
  const ratio = (Math.sqrt(5) - 1) / 2;
  let left = upper - ratio * (upper - lower);
  let right = lower + ratio * (upper - lower);
  let leftFit = regressHeadAtExponent(
    normalized,
    left,
    maximumFlow,
    maximumHead,
  );
  let rightFit = regressHeadAtExponent(
    normalized,
    right,
    maximumFlow,
    maximumHead,
  );
  for (let iteration = 0; iteration < 64; iteration++) {
    for (const candidate of [leftFit, rightFit]) {
      if (candidate && candidate.squaredError < best.squaredError)
        best = candidate;
    }
    if (
      (leftFit?.squaredError ?? Infinity) <=
      (rightFit?.squaredError ?? Infinity)
    ) {
      upper = right;
      right = left;
      rightFit = leftFit;
      left = upper - ratio * (upper - lower);
      leftFit = regressHeadAtExponent(
        normalized,
        left,
        maximumFlow,
        maximumHead,
      );
    } else {
      lower = left;
      left = right;
      leftFit = rightFit;
      right = lower + ratio * (upper - lower);
      rightFit = regressHeadAtExponent(
        normalized,
        right,
        maximumFlow,
        maximumHead,
      );
    }
  }
  return best.coefficients;
};

const regressHeadAtExponent = (
  points: CurvePoint[],
  exponent: number,
  maximumFlow: number,
  maximumHead: number,
): HeadFitCandidate | null => {
  const transformed = points.map((point) => Math.pow(point.x, exponent));
  const meanX = transformed.reduce(
    (sum, value) => sum + value / points.length,
    0,
  );
  const meanY = points.reduce((sum, point) => sum + point.y / points.length, 0);
  let covariance = 0;
  let variance = 0;
  for (let index = 0; index < points.length; index++) {
    const deltaX = transformed[index] - meanX;
    covariance += deltaX * (points[index].y - meanY);
    variance += deltaX * deltaX;
  }
  if (!(variance > 0)) return null;
  const normalizedB = -covariance / variance;
  const normalizedA = meanY + normalizedB * meanX;
  const coefficients = {
    a: normalizedA * maximumHead,
    b: (normalizedB * maximumHead) / Math.pow(maximumFlow, exponent),
    c: exponent,
  };
  if (
    !Object.values(coefficients).every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    return null;
  const squaredError = points.reduce((sum, point, index) => {
    const error = point.y - (normalizedA - normalizedB * transformed[index]);
    return sum + error * error;
  }, 0);
  return Number.isFinite(squaredError) ? { coefficients, squaredError } : null;
};

const sampleFittedHeadCurve = (
  coefficients: HeadCoefficients,
  maximumFlow: number,
): CurvePoint[] => {
  const zeroFlow = Math.pow(
    coefficients.a / coefficients.b,
    1 / coefficients.c,
  );
  const throughFlow = Number.isFinite(zeroFlow)
    ? Math.min(maximumFlow, zeroFlow)
    : maximumFlow;
  const points: CurvePoint[] = [{ x: 0, y: coefficients.a }];
  for (let index = 1; index <= 48; index++) {
    const x = (throughFlow * index) / 48;
    const y = x >= zeroFlow ? 0 : evaluateHead(coefficients, x);
    if (y < points[points.length - 1].y) points.push({ x, y });
  }
  if (Number.isFinite(zeroFlow) && zeroFlow > maximumFlow) {
    for (let index = 1; index <= 12; index++) {
      const x = maximumFlow + ((zeroFlow - maximumFlow) * index) / 12;
      const y = index === 12 ? 0 : evaluateHead(coefficients, x);
      if (y < points[points.length - 1].y) points.push({ x, y });
    }
  }
  return points;
};

const sampleHeadCurve = (
  points: CurvePoint[],
  coefficients: HeadCoefficients,
): CurvePoint[] => {
  const normalized = [{ ...points[0] }];
  for (let segment = 1; segment < points.length; segment++) {
    for (let index = 1; index <= 12; index++) {
      const x =
        points[segment - 1].x +
        ((points[segment].x - points[segment - 1].x) * index) / 12;
      const point =
        index === 12
          ? { ...points[segment] }
          : { x, y: evaluateHead(coefficients, x) };
      if (point.y < normalized[normalized.length - 1].y) normalized.push(point);
    }
  }
  return normalized;
};

const interpolateEfficiency = (points: CurvePoint[], value: number): number => {
  if (value <= points[0].x) return points[0].y;
  for (let index = 1; index < points.length; index++) {
    const right = points[index];
    if (value <= right.x) {
      const left = points[index - 1];
      return (
        left.y + ((value - left.x) * (right.y - left.y)) / (right.x - left.x)
      );
    }
  }
  return points[points.length - 1].y;
};
