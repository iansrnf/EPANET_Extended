import { describe, it, expect } from "vitest";

import { GeoTiffTile } from ".";
import { parseGeoTIFF } from "./parse-geotiff";
import { fetchGeoTiffTileElevation } from "./fetch-elevation";
import { buildFixture } from "src/__helpers__/geotiff-fixture";
import { GeoKey, ModelType, RasterType } from "./spec";

const fetchProj4DefFake = vi.fn().mockResolvedValue("");

// 4x4 float32 grid, origin (-4, 56), pixel size 0.25 degrees, WGS84
// bbox: [-4, 55, -3, 56], nodata: -9999
// Values (pixel centers at integer + 0.5 in pixel coords):
//   (0,0)=100, (1,0)=110, (2,0)=120, (3,0)=130
//   (0,1)=105, (1,1)=115, (2,1)=125, (3,1)=135
//   (0,2)=110, (1,2)=120, (2,2)=-9999, (3,2)=140
//   (0,3)=115, (1,3)=125, (2,3)=135, (3,3)=145
//
// Pixel center coords (lng, lat):
//   pixel (0,0) center -> (-3.875, 55.875)
//   pixel (1,1) center -> (-3.625, 55.625)
//   pixel (3,3) center -> (-3.125, 55.125)
// Midpoint between pixel centers:
//   between (0,0),(1,0),(0,1),(1,1) -> (-3.75, 55.75)

// prettier-ignore
const ELEVATION_RASTER = new Float32Array([
  100, 110, 120,   130,
  105, 115, 125,   135,
  110, 120, -9999, 140,
  115, 125, 135,   145,
]);

function elevationFixture() {
  return buildFixture({
    flatRaster: { data: ELEVATION_RASTER, width: 4, height: 4 },
    noDataValue: -9999,
    tiepoint: [0, 0, 0, -4, 56, 0],
    pixelScale: [0.25, 0.25, 0],
    geoKeys: {
      [GeoKey.GTModelType]: ModelType.Geographic,
      [GeoKey.GTRasterType]: RasterType.PixelIsArea,
      [GeoKey.GeographicType]: 4326,
    },
  });
}

async function loadFixtureTile(
  overrides?: Partial<GeoTiffTile>,
): Promise<GeoTiffTile> {
  const file = elevationFixture();
  const metadata = await parseGeoTIFF(file, fetchProj4DefFake);
  return { id: "test", ...metadata, ...overrides };
}

describe("fetchGeoTiffTileElevation", () => {
  it("returns exact pixel value at pixel center", async () => {
    const tile = await loadFixtureTile();

    expect(await fetchGeoTiffTileElevation(tile, -3.875, 55.875)).toEqual({
      value: 100,
      unit: "m",
    });

    expect(await fetchGeoTiffTileElevation(tile, -3.625, 55.625)).toEqual({
      value: 115,
      unit: "m",
    });

    expect(await fetchGeoTiffTileElevation(tile, -3.125, 55.125)).toEqual({
      value: 145,
      unit: "m",
    });
  });

  it("interpolates between pixel centers", async () => {
    const tile = await loadFixtureTile();

    expect(await fetchGeoTiffTileElevation(tile, -3.75, 55.75)).toEqual({
      value: 107.5,
      unit: "m",
    });
  });

  it("weights the closer neighbor more along X axis", async () => {
    const tile = await loadFixtureTile();

    expect(await fetchGeoTiffTileElevation(tile, -3.8125, 55.875)).toEqual({
      value: 102.5,
      unit: "m",
    });

    expect(await fetchGeoTiffTileElevation(tile, -3.6875, 55.875)).toEqual({
      value: 107.5,
      unit: "m",
    });
  });

  it("weights the closer neighbor more along Y axis", async () => {
    const tile = await loadFixtureTile();

    expect(await fetchGeoTiffTileElevation(tile, -3.875, 55.8125)).toEqual({
      value: 101.25,
      unit: "m",
    });

    expect(await fetchGeoTiffTileElevation(tile, -3.875, 55.6875)).toEqual({
      value: 103.75,
      unit: "m",
    });
  });

  it("renormalizes weights when a neighbor is nodata", async () => {
    const tile = await loadFixtureTile();

    expect(await fetchGeoTiffTileElevation(tile, -3.5, 55.5)).toEqual({
      value: 120,
      unit: "m",
    });
  });

  it("returns null for nodata pixel center", async () => {
    const tile = await loadFixtureTile();

    expect(await fetchGeoTiffTileElevation(tile, -3.375, 55.375)).toBeNull();
  });

  it("returns null when pixel is out of bounds", async () => {
    const tile = await loadFixtureTile();

    expect(await fetchGeoTiffTileElevation(tile, -5, 55.5)).toBeNull();
    expect(await fetchGeoTiffTileElevation(tile, -3.5, 57)).toBeNull();
  });

  it("applies scaleZ to interpolated values", async () => {
    const tile = await loadFixtureTile({ scaleZ: 0.1 });

    expect(await fetchGeoTiffTileElevation(tile, -3.875, 55.875)).toEqual({
      value: 10,
      unit: "m",
    });
  });

  it("applies GDAL scale and offset to interpolated values", async () => {
    const tile = await loadFixtureTile({ gdalScale: 0.1, gdalOffset: -10 });

    expect(await fetchGeoTiffTileElevation(tile, -3.875, 55.875)).toEqual({
      value: 0,
      unit: "m",
    });

    expect(await fetchGeoTiffTileElevation(tile, -3.625, 55.625)).toEqual({
      value: 1.5,
      unit: "m",
    });
  });

  it("applies GDAL offset only when scale is absent", async () => {
    const tile = await loadFixtureTile({ gdalOffset: 50 });

    expect(await fetchGeoTiffTileElevation(tile, -3.875, 55.875)).toEqual({
      value: 150,
      unit: "m",
    });
  });

  it("applies both GDAL scale/offset and scaleZ", async () => {
    const tile = await loadFixtureTile({
      gdalScale: 0.1,
      gdalOffset: 0,
      scaleZ: 2,
    });

    expect(await fetchGeoTiffTileElevation(tile, -3.875, 55.875)).toEqual({
      value: 20,
      unit: "m",
    });
  });

  it("returns units from file", async () => {
    const tile = await loadFixtureTile({ verticalUnit: "ft" });

    const inFeet = await fetchGeoTiffTileElevation(tile, -3.875, 55.875);
    expect(inFeet).toEqual({ value: 100, unit: "ft" });
  });
});
