import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LAN_CONVEX_BASELINE,
  LAN_TABLES,
} from "../../lan/migration-manifest.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

function filesUnder(directory) {
  const absolute = join(root, directory);
  return readdirSync(absolute).flatMap((name) => {
    const path = join(absolute, name);
    return statSync(path).isDirectory()
      ? filesUnder(relative(root, path))
      : [path];
  });
}

const sourceFiles = filesUnder("src").filter((file) =>
  /\.[cm]?[jt]sx?$/.test(file),
);
const directReactFiles = sourceFiles.filter((file) =>
  /from\s+["']convex\/react["']/.test(readFileSync(file, "utf8")),
);
const generatedApiFiles = sourceFiles.filter((file) =>
  /convex\/_generated\/api/.test(readFileSync(file, "utf8")),
);

const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const schemaTables = [
  ...schema.matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*):\s*defineTable/gm),
].map((match) => match[1]);
const manifestTables = LAN_TABLES.map((entry) => entry.sourceTable);
const missingFromManifest = schemaTables.filter(
  (table) => !manifestTables.includes(table),
);
const unknownManifestTables = manifestTables.filter(
  (table) => !schemaTables.includes(table),
);
const duplicateManifestTables = manifestTables.filter(
  (table, index) => manifestTables.indexOf(table) !== index,
);

const failures = [];
if (directReactFiles.length > LAN_CONVEX_BASELINE.directReactFiles) {
  failures.push(
    `direct Convex React coupling grew from ${LAN_CONVEX_BASELINE.directReactFiles} to ${directReactFiles.length}`,
  );
}
if (generatedApiFiles.length > LAN_CONVEX_BASELINE.generatedApiFiles) {
  failures.push(
    `generated Convex API coupling grew from ${LAN_CONVEX_BASELINE.generatedApiFiles} to ${generatedApiFiles.length}`,
  );
}
if (schemaTables.length !== LAN_CONVEX_BASELINE.schemaTables) {
  failures.push(
    `Convex schema table count changed from ${LAN_CONVEX_BASELINE.schemaTables} to ${schemaTables.length}; update the LAN manifest deliberately`,
  );
}
if (missingFromManifest.length)
  failures.push(`missing LAN tables: ${missingFromManifest.join(", ")}`);
if (unknownManifestTables.length)
  failures.push(`unknown LAN tables: ${unknownManifestTables.join(", ")}`);
if (duplicateManifestTables.length)
  failures.push(`duplicate LAN tables: ${duplicateManifestTables.join(", ")}`);

if (failures.length) {
  console.error(
    "Windows LAN architecture audit failed:\n" +
      failures.map((item) => `- ${item}`).join("\n"),
  );
  process.exit(1);
}

console.log("Windows LAN architecture audit: PASS");
console.log(
  `Convex React files: ${directReactFiles.length}/${LAN_CONVEX_BASELINE.directReactFiles} maximum`,
);
console.log(
  `Generated API files: ${generatedApiFiles.length}/${LAN_CONVEX_BASELINE.generatedApiFiles} maximum`,
);
console.log(
  `Migration manifest: ${manifestTables.length}/${schemaTables.length} tables covered`,
);
