import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  transformCoordinates,
  isPointInBbox,
  sampleElevation,
  extractGeoTiffMetadata,
} from "./geotiff-utils";
import type { GeoTiffTile } from "./elevation-source-types";

function loadFixtureAsFile(filename: string): File {
  const buffer = fs.readFileSync(path.join(__dirname, filename));
  return new File([new Uint8Array(buffer)], filename, { type: "image/tiff" });
}

async function loadFixtureTile(): Promise<GeoTiffTile> {
  const file = loadFixtureAsFile("elevation.fixture.tif");
  const metadata = await extractGeoTiffMetadata(file);
  return { id: "test", ...metadata };
}

describe("transformCoordinates", () => {
  const identityMatrix = [0, 1, 0, 0, 0, 1];

  it("applies identity matrix", () => {
    expect(transformCoordinates(5, 10, identityMatrix)).toEqual([5, 10]);
  });

  it("applies scale and offset", () => {
    const matrix = [100, 0.5, 0, 200, 0, -0.5];
    expect(transformCoordinates(3, 4, matrix)).toEqual([101.5, 198]);
  });

  it("rounds to integer when requested", () => {
    const matrix = [0.5, 1, 0, 0.7, 0, 1];
    expect(transformCoordinates(2, 3, matrix, true)).toEqual([2, 3]);
  });

  it("handles shear terms", () => {
    const matrix = [0, 1, 0.5, 0, 0.5, 1];
    expect(transformCoordinates(2, 3, matrix)).toEqual([3.5, 4]);
  });
});

describe("isPointInBbox", () => {
  const bbox: [number, number, number, number] = [-4, 55, -3, 56];

  it("returns true for a point inside", () => {
    expect(isPointInBbox(-3.5, 55.5, bbox)).toBe(true);
  });

  it("returns true for a point on the edge", () => {
    expect(isPointInBbox(-4, 55, bbox)).toBe(true);
    expect(isPointInBbox(-3, 56, bbox)).toBe(true);
  });

  it("returns false for a point outside", () => {
    expect(isPointInBbox(-5, 55.5, bbox)).toBe(false);
    expect(isPointInBbox(-3.5, 57, bbox)).toBe(false);
  });
});

describe("extractGeoTiffMetadata", () => {
  it("extracts correct metadata from a GeoTIFF file", async () => {
    const file = loadFixtureAsFile("elevation.fixture.tif");
    const metadata = await extractGeoTiffMetadata(file);

    expect(metadata.width).toBe(4);
    expect(metadata.height).toBe(4);
    expect(metadata.bbox).toEqual([-4, 55, -3, 56]);
    expect(metadata.noDataValue).toBe(-9999);
    expect(metadata.file).toBe(file);
    expect(metadata.image).toBeDefined();
  });
});

describe("sampleElevation", () => {
  it("returns the elevation value for a valid pixel", async () => {
    const tile = await loadFixtureTile();

    expect(await sampleElevation(tile, -3.875, 55.875)).toBe(100);
    expect(await sampleElevation(tile, -3.625, 55.625)).toBe(115);
    expect(await sampleElevation(tile, -3.125, 55.125)).toBe(145);
  });

  it("returns null for nodata pixels", async () => {
    const tile = await loadFixtureTile();
    expect(await sampleElevation(tile, -3.375, 55.375)).toBeNull();
  });

  it("returns null when pixel is out of bounds", async () => {
    const tile = await loadFixtureTile();

    expect(await sampleElevation(tile, -5, 55.5)).toBeNull();
    expect(await sampleElevation(tile, -3.5, 57)).toBeNull();
  });
});
