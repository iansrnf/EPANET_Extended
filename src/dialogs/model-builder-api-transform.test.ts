import type { FeatureCollection } from "geojson";
import { buildApiNetworkPreview } from "./model-builder-api-transform";

describe("buildApiNetworkPreview", () => {
  it("builds pipes and deduplicated junctions from line features", () => {
    const geoJson: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "pipe.1",
          geometry: {
            type: "LineString",
            coordinates: [
              [125.0, 7.0],
              [125.1, 7.1],
            ],
          },
          properties: {
            pipe_name: "P-100",
            dia_mm: "250",
            rough: 120,
            elev_m: 33,
          },
        },
        {
          type: "Feature",
          id: "pipe.2",
          geometry: {
            type: "LineString",
            coordinates: [
              [125.1, 7.1],
              [125.2, 7.2],
            ],
          },
          properties: {
            pipe_name: "P-200",
            dia_mm: 300,
            rough: 110,
            elev_m: 34,
          },
        },
      ],
    };

    const preview = buildApiNetworkPreview(geoJson, {
      pipe: {
        labelField: "pipe_name",
        diameterField: "dia_mm",
        defaultDiameter: 100,
        roughnessField: "rough",
        defaultRoughness: 130,
        minorLossField: null,
        defaultMinorLoss: 0,
        statusField: null,
        defaultStatus: "open",
        lengthMode: "constant",
        lengthField: null,
        defaultLength: 999,
      },
      junction: {
        labelField: null,
        elevationField: "elev_m",
        defaultElevation: 0,
        emitterCoefficientField: null,
        defaultEmitterCoefficient: 0,
      },
    });

    expect(preview.pipes).toHaveLength(2);
    expect(preview.junctions).toHaveLength(3);
    expect(preview.skippedFeatures).toBe(0);
    expect(preview.pipes[0]).toMatchObject({
      label: "P-100",
      startJunctionLabel: "J1",
      endJunctionLabel: "J2",
      diameter: 250,
      roughness: 120,
      length: 999,
    });
    expect(preview.pipes[1]).toMatchObject({
      label: "P-200",
      startJunctionLabel: "J2",
      endJunctionLabel: "J3",
      diameter: 300,
      roughness: 110,
      length: 999,
    });
  });

  it("falls back to defaults and skips unsupported geometry", () => {
    const geoJson: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [125, 7],
          },
          properties: {},
        },
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [125.0, 7.0],
              [125.01, 7.01],
            ],
          },
          properties: {
            status: "closed",
            custom_length: "456",
          },
        },
      ],
    };

    const preview = buildApiNetworkPreview(geoJson, {
      pipe: {
        labelField: null,
        diameterField: null,
        defaultDiameter: 150,
        roughnessField: null,
        defaultRoughness: 100,
        minorLossField: null,
        defaultMinorLoss: 1,
        statusField: "status",
        defaultStatus: "open",
        lengthMode: "attribute",
        lengthField: "custom_length",
        defaultLength: 999,
      },
      junction: {
        labelField: null,
        elevationField: null,
        defaultElevation: 10,
        emitterCoefficientField: null,
        defaultEmitterCoefficient: 0.5,
      },
    });

    expect(preview.skippedFeatures).toBe(1);
    expect(preview.pipes[0]).toMatchObject({
      diameter: 150,
      roughness: 100,
      minorLoss: 1,
      initialStatus: "closed",
      length: 456,
    });
    expect(preview.junctions[0]).toMatchObject({
      elevation: 10,
      emitterCoefficient: 0.5,
    });
  });
});
