import type { SourceFile } from "@epanet-js/converters";
import { strToU8, zipSync } from "fflate";
import { expandGisFiles, groupGisFiles } from "./source-files";

describe("expandGisFiles", () => {
  it("keeps archive folders and ignores hidden metadata", async () => {
    const files = await expandGisFiles([
      aZip("network.zip", {
        "north/mains.shp": strToU8("north geometry"),
        "south/mains.shp": strToU8("south geometry"),
        "__MACOSX/._mains.shp": strToU8("metadata"),
        ".hidden/mains.shp": strToU8("hidden"),
        "north/.DS_Store": strToU8("metadata"),
        "north/": new Uint8Array(),
      }),
    ]);

    expect(files.map((file) => file.name)).toEqual([
      "network.zip/north/mains.shp",
      "network.zip/south/mains.shp",
    ]);
    expect(new TextDecoder().decode(await files[0].arrayBuffer())).toBe(
      "north geometry",
    );
  });

  it("expands one nested archive without flattening its identity", async () => {
    const inner = zipSync({ "points.csv": strToU8("x,y\n1,2") });
    const files = await expandGisFiles([
      aZip("network.zip", { "data/points.zip": inner }),
    ]);

    expect(files.map((file) => file.name)).toEqual([
      "network.zip/data/points.zip/points.csv",
    ]);
    expect(new TextDecoder().decode(await files[0].arrayBuffer())).toBe(
      "x,y\n1,2",
    );
  });

  it("rejects deeper nesting", async () => {
    const deepest = zipSync({ "points.csv": strToU8("x,y\n1,2") });
    const inner = zipSync({ "again.zip": deepest });

    await expect(
      expandGisFiles([aZip("network.zip", { "inner.zip": inner })]),
    ).rejects.toThrow("only one nested ZIP archive");
  });

  it("checks declared sizes against the expansion budget", async () => {
    const archive = aZip("large.zip", {
      "mains.geojson": new Uint8Array(1024),
    });

    await expect(
      expandGisFiles([archive], { maxExpandedBytes: 100 }),
    ).rejects.toThrow("expanded files exceed the 100 bytes limit");
  });

  it("shares the budget across separate archives", async () => {
    const files = [
      aZip("north.zip", { "mains.geojson": new Uint8Array(300) }),
      aZip("south.zip", { "mains.geojson": new Uint8Array(300) }),
    ];

    await expect(
      expandGisFiles(files, { maxExpandedBytes: 500 }),
    ).rejects.toThrow("expanded files exceed");
  });

  it("rejects encrypted entries before expanding", async () => {
    const bytes = zipSync({ "mains.geojson": strToU8("{}") });
    const view = new DataView(bytes.buffer);
    const centralOffset = view.getUint32(bytes.byteLength - 22 + 16, true);
    view.setUint16(
      centralOffset + 8,
      view.getUint16(centralOffset + 8, true) | 1,
      true,
    );

    await expect(
      expandGisFiles([aFile("encrypted.zip", bytes)]),
    ).rejects.toThrow("encrypted ZIP archives");
  });

  it("rejects malformed archives", async () => {
    await expect(
      expandGisFiles([aFile("broken.zip", strToU8("not a zip"))]),
    ).rejects.toThrow(
      'Cannot expand "broken.zip": unreadable or corrupted ZIP archive',
    );
  });

  it("rejects corrupted stored content", async () => {
    const bytes = zipSync({ "mains.geojson": strToU8("{}") }, { level: 0 });
    const view = new DataView(bytes.buffer);
    const dataOffset = 30 + view.getUint16(26, true) + view.getUint16(28, true);
    bytes[dataOffset] ^= 1;

    await expect(
      expandGisFiles([aFile("corrupted.zip", bytes)]),
    ).rejects.toThrow("unreadable or corrupted ZIP archive");
  });

  it("rejects traversal entries without normalizing them onto another layer", async () => {
    const file = aZip("network.zip", { "../mains.shp": strToU8("geometry") });

    await expect(expandGisFiles([file])).rejects.toThrow(
      "unreadable or corrupted ZIP archive",
    );
  });

  it("accepts current-directory archive prefixes", async () => {
    const files = await expandGisFiles([
      aZip("network.zip", { "./mains.geojson": strToU8("{}") }),
    ]);

    expect(files.map((file) => file.name)).toEqual([
      "network.zip/mains.geojson",
    ]);
  });

  it("stops after an input read is cancelled", async () => {
    const controller = new AbortController();
    const source: SourceFile = {
      name: "network.zip",
      arrayBuffer: () => {
        controller.abort();
        return Promise.resolve(
          zipSync({ "mains.geojson": strToU8("{}") }).buffer,
        );
      },
    };

    await expect(
      expandGisFiles([source], { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("passes through loose files without reading them", async () => {
    const source: SourceFile = { name: "mains.geojson", arrayBuffer: vi.fn() };

    expect(await expandGisFiles([source])).toEqual([source]);
    expect(source.arrayBuffer).not.toHaveBeenCalled();
  });
});

describe("groupGisFiles", () => {
  it("groups matching shapefile parts without mixing folders", () => {
    const files = [
      "north/mains.shp",
      "north/MAINS.dbf",
      "south/mains.shp",
      "south/mains.prj",
      "north/mains.shx",
    ].map((name) => aFile(name));

    expect(
      groupGisFiles(files).map(({ name, files: parts }) => ({
        name,
        parts: parts.map((part) => part.name),
      })),
    ).toEqual([
      {
        name: "north/mains.shp",
        parts: ["north/mains.shp", "north/MAINS.dbf", "north/mains.shx"],
      },
      {
        name: "south/mains.shp",
        parts: ["south/mains.shp", "south/mains.prj"],
      },
    ]);
  });

  it("keeps sidecars pending under the eventual shapefile name", () => {
    const pending = groupGisFiles([aFile("mains.dbf"), aFile("mains.prj")]);
    const complete = groupGisFiles([...pending[0].files, aFile("mains.shp")]);

    expect(pending[0].name).toBe("mains.shp");
    expect(complete[0].name).toBe(pending[0].name);
    expect(complete[0].files.map((file) => file.name)).toEqual([
      "mains.dbf",
      "mains.prj",
      "mains.shp",
    ]);
  });

  it("uses the last copy of a shapefile part", () => {
    const original = aFile("mains.dbf", strToU8("old"));
    const updated = aFile("MAINS.DBF", strToU8("new"));
    const groups = groupGisFiles([aFile("mains.shp"), original, updated]);

    expect(groups[0].files).toEqual([
      expect.objectContaining({ name: "mains.shp" }),
      updated,
    ]);
  });

  it("keeps different recognized formats separate and ignores unsupported files", () => {
    const files = [
      "mains.geojson",
      "mains.csv",
      "mains.dxf",
      "mains.geojsonl",
      "readme.txt",
      "customers.qmd",
      ".hidden.geojson",
    ].map((name) => aFile(name));

    expect(groupGisFiles(files).map((group) => group.name)).toEqual([
      "mains.geojson",
      "mains.csv",
      "mains.dxf",
      "mains.geojsonl",
    ]);
  });

  it("keeps separate archives with matching layer names separate", async () => {
    const files = await expandGisFiles([
      aZip("north.zip", {
        "mains.shp": strToU8("north"),
        "mains.dbf": strToU8("north attributes"),
      }),
      aZip("south.zip", {
        "mains.shp": strToU8("south"),
        "mains.dbf": strToU8("south attributes"),
      }),
    ]);

    expect(groupGisFiles(files).map((group) => group.name)).toEqual([
      "north.zip/mains.shp",
      "south.zip/mains.shp",
    ]);
  });
});

const aFile = (name: string, bytes = new Uint8Array()): SourceFile => ({
  name,
  arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer),
});

const aZip = (name: string, files: Record<string, Uint8Array>) =>
  aFile(name, zipSync(files));
