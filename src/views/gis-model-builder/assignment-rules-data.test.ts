import type { Feature } from "geojson";
import {
  matchesAssignmentPartition,
  type AssignmentPartition,
} from "./assignment-rules-data";

describe("assignment partitions", () => {
  it("assigns overlapping matches only to the first rule", () => {
    const rules: AssignmentPartition["rules"] = [
      {
        name: "Large valves",
        role: "valve",
        conditions: [
          { attribute: "diameter", operator: "greaterOrEquals", value: 100 },
        ],
      },
      {
        name: "All valves",
        role: "valve",
        conditions: [{ attribute: "kind", operator: "equals", value: "valve" }],
      },
    ];
    const feature = aFeature({ diameter: 150, kind: "valve" });

    expect(
      matchesAssignmentPartition(feature, {
        rules,
        index: 0,
        fallbackRole: "junction",
      }),
    ).toBe(true);
    expect(
      matchesAssignmentPartition(feature, {
        rules,
        index: 1,
        fallbackRole: "junction",
      }),
    ).toBe(false);
    expect(
      matchesAssignmentPartition(feature, {
        rules,
        index: "fallback",
        fallbackRole: "junction",
      }),
    ).toBe(false);
  });

  it("requires every condition inside a rule", () => {
    const rules: AssignmentPartition["rules"] = [
      {
        name: "In-service valves",
        role: "valve",
        conditions: [
          { attribute: "kind", operator: "equals", value: "valve" },
          { attribute: "status", operator: "equals", value: "open" },
        ],
      },
    ];
    const feature = aFeature({ kind: "valve", status: "closed" });

    expect(
      matchesAssignmentPartition(feature, {
        rules,
        index: 0,
        fallbackRole: "junction",
      }),
    ).toBe(false);
    expect(
      matchesAssignmentPartition(feature, {
        rules,
        index: "fallback",
        fallbackRole: "junction",
      }),
    ).toBe(true);
  });

  it("excludes unmatched records when otherwise is not assigned", () => {
    const rules: AssignmentPartition["rules"] = [
      {
        name: "Valves",
        role: "valve",
        conditions: [{ attribute: "kind", operator: "equals", value: "valve" }],
      },
    ];

    expect(
      matchesAssignmentPartition(aFeature({ kind: "hydrant" }), {
        rules,
        index: "fallback",
        fallbackRole: null,
      }),
    ).toBe(false);
  });

  it("keeps excluded first matches out of later rules and the fallback", () => {
    const rules: AssignmentPartition["rules"] = [
      {
        name: "Retired assets",
        role: null,
        conditions: [
          { attribute: "status", operator: "equals", value: "retired" },
        ],
      },
      {
        name: "Valves",
        role: "valve",
        conditions: [{ attribute: "kind", operator: "equals", value: "valve" }],
      },
    ];
    const retired = aFeature({ status: "retired", kind: "valve" });

    expect(
      matchesAssignmentPartition(retired, {
        rules,
        index: 0,
        fallbackRole: "junction",
      }),
    ).toBe(false);
    expect(
      matchesAssignmentPartition(retired, {
        rules,
        index: 1,
        fallbackRole: "junction",
      }),
    ).toBe(false);
    expect(
      matchesAssignmentPartition(retired, {
        rules,
        index: "fallback",
        fallbackRole: "junction",
      }),
    ).toBe(false);
    expect(
      matchesAssignmentPartition(
        aFeature({ status: "active", kind: "valve" }),
        { rules, index: 1, fallbackRole: "junction" },
      ),
    ).toBe(true);
  });

  it("does not turn an empty rule into a catch-all", () => {
    const rules: AssignmentPartition["rules"] = [
      { name: "Unfinished", role: "valve", conditions: [] },
    ];
    const feature = aFeature({ kind: "valve" });

    expect(
      matchesAssignmentPartition(feature, {
        rules,
        index: 0,
        fallbackRole: "junction",
      }),
    ).toBe(false);
    expect(
      matchesAssignmentPartition(feature, {
        rules,
        index: "fallback",
        fallbackRole: "junction",
      }),
    ).toBe(true);
  });

  it("supports an inclusive range with two conditions", () => {
    const rules: AssignmentPartition["rules"] = [
      {
        name: "Distribution",
        role: "pipe",
        conditions: [
          { attribute: "diameter", operator: "greaterOrEquals", value: 100 },
          { attribute: "diameter", operator: "lessOrEquals", value: 300 },
        ],
      },
    ];

    expect(
      matchesAssignmentPartition(aFeature({ diameter: 100 }), {
        rules,
        index: 0,
        fallbackRole: null,
      }),
    ).toBe(true);
    expect(
      matchesAssignmentPartition(aFeature({ diameter: 300 }), {
        rules,
        index: 0,
        fallbackRole: null,
      }),
    ).toBe(true);
    expect(
      matchesAssignmentPartition(aFeature({ diameter: 301 }), {
        rules,
        index: 0,
        fallbackRole: null,
      }),
    ).toBe(false);
  });
});

const aFeature = (properties: Record<string, unknown>): Feature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [0, 0] },
  properties,
});
