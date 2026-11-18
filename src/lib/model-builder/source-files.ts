import type { SourceFile } from "@epanet-js/converters";
import { gisFormatOf } from "@epanet-js/gis-importers";
import crc32 from "crc/calculators/crc32";
import { strFromU8, unzip } from "fflate";
import { createTimeSlicer } from "src/infra/yield-to-main";

type ExpandGisFilesOptions = {
  signal?: AbortSignal;
  maxExpandedBytes?: number;
};

type SourceFileGroup = {
  name: string;
  files: SourceFile[];
};

type ArchiveEntry = {
  name: string;
  originalName: string;
  size: number;
  checksum: number;
  ignored: boolean;
};

const DEFAULT_MAX_EXPANDED_BYTES = 256 * 1024 * 1024;
const MAX_ARCHIVE_LEVELS = 2;
const ZIP_END_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;

export const expandGisFiles = async (
  files: SourceFile[],
  {
    signal,
    maxExpandedBytes = DEFAULT_MAX_EXPANDED_BYTES,
  }: ExpandGisFilesOptions = {},
): Promise<SourceFile[]> => {
  if (!Number.isSafeInteger(maxExpandedBytes) || maxExpandedBytes <= 0) {
    throw new Error("The expanded file limit must be a positive integer.");
  }

  let expandedBytes = 0;
  const expandedFiles: SourceFile[] = [];
  const yieldIfNeeded = createTimeSlicer();

  const expand = async (
    file: SourceFile,
    archiveLevel: number,
  ): Promise<void> => {
    checkAborted(signal);
    const name = normalizePath(file.name);
    if (isIgnoredPath(name)) return;
    if (!name.toLowerCase().endsWith(".zip")) {
      expandedFiles.push(file);
      return;
    }
    if (archiveLevel >= MAX_ARCHIVE_LEVELS) {
      throw new Error(
        `Cannot expand "${name}": only one nested ZIP archive is supported.`,
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    checkAborted(signal);
    const entries = readArchiveEntries(bytes, name);
    const selectedEntries = entries.filter((entry) => !entry.ignored);
    for (const entry of selectedEntries) {
      expandedBytes += entry.size;
      if (expandedBytes > maxExpandedBytes) {
        throw new Error(
          `Cannot expand "${name}": expanded files exceed the ${formatBytes(maxExpandedBytes)} limit.`,
        );
      }
    }

    const contents = await unzipArchive(bytes, name, entries, signal);
    for (const entry of selectedEntries) {
      checkAborted(signal);
      await yieldIfNeeded();
      const content = contents[entry.originalName];
      if (
        content === undefined ||
        content.byteLength !== entry.size ||
        (await checksumOf(content, yieldIfNeeded, signal)) !== entry.checksum
      ) {
        throw malformedArchive(name);
      }
      await expand(
        sourceFileOf(`${name}/${entry.name}`, content),
        archiveLevel + 1,
      );
    }
  };

  for (const file of files) await expand(file, 0);
  checkAborted(signal);
  return expandedFiles;
};

export const groupGisFiles = (files: SourceFile[]): SourceFileGroup[] => {
  const groups = new Map<string, SourceFileGroup>();
  const auxiliaryFiles: { key: string; file: SourceFile }[] = [];
  const shapefileFormat = gisFormatOf("source.shp");
  const shapefileParts = shapefileFormat?.sidecarExtensions ?? [];
  const shapefileAuxiliaries = shapefileFormat?.auxiliaryExtensions ?? [];

  for (const file of files) {
    const name = normalizePath(file.name);
    if (isIgnoredPath(name)) continue;
    const format = gisFormatOf(name);
    const extension = extensionOf(name);
    const isShapefile =
      format?.id === "shapefile" || shapefileParts.includes(extension);
    const isAuxiliary = shapefileAuxiliaries.includes(extension);
    if (isShapefile || isAuxiliary) {
      const stem = withoutExtension(name).replace(/\.shp$/i, "");
      const key = `shapefile:${groupKeyOf(stem)}`;
      if (isAuxiliary) {
        auxiliaryFiles.push({ key, file });
        continue;
      }
      const group = groups.get(key) ?? { name: `${stem}.shp`, files: [] };
      addOrReplaceFile(group, file);
      groups.set(key, group);
    } else if (format !== null) {
      const key = `source:${groupKeyOf(name)}`;
      groups.set(key, { name, files: [file] });
    }
  }

  for (const { key, file } of auxiliaryFiles) {
    const group = groups.get(key);
    if (group) addOrReplaceFile(group, file);
  }
  return [...groups.values()];
};

const readArchiveEntries = (
  bytes: Uint8Array,
  archiveName: string,
): ArchiveEntry[] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findArchiveEnd(view);
  if (endOffset === null) throw malformedArchive(archiveName);
  const disk = view.getUint16(endOffset + 4, true);
  const centralDisk = view.getUint16(endOffset + 6, true);
  const diskEntries = view.getUint16(endOffset + 8, true);
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  if (
    entryCount === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff
  ) {
    throw new Error(
      `Cannot expand "${archiveName}": ZIP64 archives are not supported.`,
    );
  }
  if (
    disk !== 0 ||
    centralDisk !== 0 ||
    diskEntries !== entryCount ||
    centralOffset + centralSize > endOffset
  ) {
    throw malformedArchive(archiveName);
  }

  const entries: ArchiveEntry[] = [];
  const names = new Set<string>();
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index++) {
    if (
      offset + 46 > centralOffset + centralSize ||
      view.getUint32(offset, true) !== ZIP_CENTRAL_SIGNATURE
    ) {
      throw malformedArchive(archiveName);
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const checksum = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameSize = view.getUint16(offset + 28, true);
    const extraSize = view.getUint16(offset + 30, true);
    const commentSize = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const nextOffset = offset + 46 + nameSize + extraSize + commentSize;
    if (
      nextOffset > centralOffset + centralSize ||
      localOffset + 30 > centralOffset ||
      view.getUint32(localOffset, true) !== ZIP_LOCAL_SIGNATURE
    ) {
      throw malformedArchive(archiveName);
    }
    const localFlags = view.getUint16(localOffset + 6, true);
    if ((flags | localFlags) & 0x41 || method === 99) {
      throw new Error(
        `Cannot expand "${archiveName}": encrypted ZIP archives are not supported.`,
      );
    }
    const dataOffset =
      localOffset +
      30 +
      view.getUint16(localOffset + 26, true) +
      view.getUint16(localOffset + 28, true);
    if (
      size === 0xffffffff ||
      compressedSize === 0xffffffff ||
      dataOffset + compressedSize > centralOffset ||
      view.getUint16(localOffset + 8, true) !== method ||
      (method !== 0 && method !== 8) ||
      (method === 0 && compressedSize !== size)
    ) {
      throw malformedArchive(archiveName);
    }
    const originalName = decodeArchiveName(
      bytes.subarray(offset + 46, offset + 46 + nameSize),
      flags,
      archiveName,
    );
    const name = normalizePath(originalName);
    if (!isRelativeArchivePath(name) || names.has(name))
      throw malformedArchive(archiveName);
    names.add(name);
    entries.push({
      name,
      originalName,
      size,
      checksum,
      ignored: isIgnoredPath(name),
    });
    offset = nextOffset;
  }
  if (offset !== centralOffset + centralSize)
    throw malformedArchive(archiveName);
  return entries;
};

const findArchiveEnd = (view: DataView): number | null => {
  const firstOffset = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let offset = view.byteLength - 22; offset >= firstOffset; offset--) {
    if (
      view.getUint32(offset, true) === ZIP_END_SIGNATURE &&
      offset + 22 + view.getUint16(offset + 20, true) === view.byteLength
    ) {
      return offset;
    }
  }
  return null;
};

const unzipArchive = (
  bytes: Uint8Array,
  name: string,
  entries: ArchiveEntry[],
  signal?: AbortSignal,
): Promise<Record<string, Uint8Array>> =>
  new Promise((resolve, reject) => {
    const names = new Set(
      entries
        .filter((entry) => !entry.ignored)
        .map((entry) => entry.originalName),
    );
    let terminate = () => {};
    const onAbort = () => {
      terminate();
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      checkAborted(signal);
      terminate = unzip(
        bytes,
        { filter: (entry) => names.has(entry.name) },
        (error, contents) => {
          signal?.removeEventListener("abort", onAbort);
          if (signal?.aborted) reject(abortError());
          else if (error) reject(malformedArchive(name));
          else resolve(contents);
        },
      );
    } catch {
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.aborted ? abortError() : malformedArchive(name));
    }
  });

const sourceFileOf = (name: string, bytes: Uint8Array): SourceFile => ({
  name,
  arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer),
});

const checksumOf = async (
  bytes: Uint8Array,
  yieldIfNeeded: () => Promise<void>,
  signal?: AbortSignal,
) => {
  let checksum: number | undefined;
  for (let offset = 0; offset < bytes.byteLength; offset += 1024 * 1024) {
    checkAborted(signal);
    checksum = crc32(
      bytes.subarray(offset, offset + 1024 * 1024),
      checksum === 0 ? undefined : checksum,
    );
    await yieldIfNeeded();
  }
  return (checksum ?? crc32(bytes)) >>> 0;
};

const decodeArchiveName = (
  bytes: Uint8Array,
  flags: number,
  archiveName: string,
) => {
  try {
    return strFromU8(bytes, !(flags & 0x800));
  } catch {
    throw malformedArchive(archiveName);
  }
};

const addOrReplaceFile = (group: SourceFileGroup, file: SourceFile) => {
  const index = group.files.findIndex(
    (current) => extensionOf(current.name) === extensionOf(file.name),
  );
  if (index < 0) group.files.push(file);
  else group.files[index] = file;
};

const normalizePath = (name: string) =>
  name
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part !== ".")
    .join("/");
const withoutExtension = (name: string) => name.slice(0, name.lastIndexOf("."));
const extensionOf = (name: string) =>
  name.slice(name.lastIndexOf(".")).toLowerCase();
const groupKeyOf = (name: string) => {
  const separator = name.lastIndexOf("/");
  return name.slice(0, separator + 1) + name.slice(separator + 1).toLowerCase();
};
const isIgnoredPath = (name: string) =>
  name.endsWith("/") ||
  name.split("/").some((part) => part.startsWith(".") || part === "__MACOSX");
const isRelativeArchivePath = (name: string) =>
  name.length > 0 &&
  !name.startsWith("/") &&
  !/^[a-z]:/i.test(name) &&
  !name.split("/").includes("..");
const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${bytes} bytes`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
const malformedArchive = (name: string) =>
  new Error(`Cannot expand "${name}": unreadable or corrupted ZIP archive.`);
const abortError = () =>
  new DOMException("File expansion cancelled.", "AbortError");
const checkAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw abortError();
};
