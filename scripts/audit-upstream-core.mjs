import { execFileSync } from "node:child_process";
import { isUtf8 } from "node:buffer";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const destination = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceArgument = process.argv[2];

if (!sourceArgument) {
  console.error(
    "Usage: node scripts/audit-upstream-core.mjs <source-repository> [report.json]",
  );
  process.exit(1);
}

const source = resolve(sourceArgument);
const reportPath = resolve(
  destination,
  process.argv[3] ?? "logs/upstream-core-audit.json",
);
const reportRelativePath = relative(destination, reportPath);

if (reportRelativePath.startsWith("..") || isAbsolute(reportRelativePath)) {
  throw new Error(
    "The audit report must be written inside the destination repository.",
  );
}

const sourceFiles = git(source, ["ls-files", "-z"])
  .split("\0")
  .filter(
    (file) => file.startsWith("apps/app/src/") || file.startsWith("libs/"),
  );
const destinationFiles = git(destination, [
  "ls-files",
  "--cached",
  "--others",
  "--exclude-standard",
  "-z",
])
  .split("\0")
  .filter((file) => file.startsWith("src/") || file.startsWith("libs/"))
  .filter((file) => existsSync(resolve(destination, file)));
const mappedFiles = new Set();
const differences = [];
let matchingFiles = 0;

for (const sourceFile of sourceFiles) {
  const destinationFile = sourceFile.replace(/^apps\/app\//, "");
  mappedFiles.add(destinationFile);
  const sourcePath = resolve(source, sourceFile);
  const destinationPath = resolve(destination, destinationFile);
  const sourceExists = existsSync(sourcePath);
  const destinationExists = existsSync(destinationPath);
  if (!sourceExists || !destinationExists) {
    differences.push({
      source: sourceFile,
      destination: destinationFile,
      status: sourceExists ? "upstream-only" : "missing-upstream-file",
    });
  } else if (fingerprint(sourcePath) !== fingerprint(destinationPath)) {
    differences.push({
      source: sourceFile,
      destination: destinationFile,
      status: "different",
    });
  } else {
    matchingFiles += 1;
  }
}

const destinationOnly = destinationFiles
  .filter((file) => !mappedFiles.has(file))
  .sort();
const report = {
  source,
  sourceHead: git(source, ["rev-parse", "HEAD"]).trim(),
  sourceWorkingChanges: git(source, ["status", "--short"]).trim(),
  destination,
  destinationHead: git(destination, ["rev-parse", "HEAD"]).trim(),
  matchingFiles,
  differences,
  destinationOnly,
  recentSourceCommits: git(source, ["log", "-150", "--format=%H%x09%aI%x09%s"])
    .trim()
    .split("\n")
    .map((line) => {
      const [commit, date, ...subject] = line.split("\t");
      return { commit, date, subject: subject.join("\t") };
    }),
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Compared ${sourceFiles.length} upstream files: ${matchingFiles} match, ${differences.length} differ, ${destinationOnly.length} destination-only files.`,
);
console.log(`Report: ${reportPath}`);

function git(repository, args) {
  return execFileSync(
    "git",
    [
      "-c",
      `safe.directory=${repository.replace(/\\/g, "/")}`,
      "-C",
      repository,
      ...args,
    ],
    {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    },
  );
}

function fingerprint(file) {
  const bytes = readFileSync(file);
  const contents =
    !bytes.includes(0) && isUtf8(bytes)
      ? bytes.toString("utf8").replace(/\r\n/g, "\n")
      : bytes;
  return createHash("sha256").update(contents).digest("hex");
}
