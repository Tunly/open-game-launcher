import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const DIST_DIR = resolve(process.cwd(), "dist");
const MANIFEST_PATH = resolve(DIST_DIR, ".vite", "manifest.json");
const budgets = {
  initialEntryBytes: Number(process.env.OG_BUNDLE_INITIAL_ENTRY_MAX_BYTES ?? 275_000),
  maxChunkBytes: Number(process.env.OG_BUNDLE_MAX_CHUNK_BYTES ?? 275_000),
  totalJavaScriptBytes: Number(process.env.OG_BUNDLE_TOTAL_JS_MAX_BYTES ?? 2_700_000),
};

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

async function fileSize(file) {
  return (await stat(resolve(DIST_DIR, file))).size;
}

function collectStaticImports(manifest, key, collected = new Set()) {
  if (collected.has(key)) return collected;
  collected.add(key);
  for (const dependency of manifest[key]?.imports ?? []) {
    collectStaticImports(manifest, dependency, collected);
  }
  return collected;
}

const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
const entry = Object.entries(manifest).find(
  ([, value]) => value.isEntry && value.src === "index.html",
);

if (!entry) {
  throw new Error("Bundle budget: Vite manifest has no index.html entry.");
}

const requiredWindowEntries = [
  "src/app/App.tsx",
  "src/app/FpsHudWindowApp.tsx",
  "src/app/OverlayWindowApp.tsx",
];
const missingWindowEntries = requiredWindowEntries.filter(
  (source) => !entry[1].dynamicImports?.includes(source),
);
if (missingWindowEntries.length > 0) {
  throw new Error(
    `Bundle budget: window bootstrap entries must stay dynamic (${missingWindowEntries.join(", ")}).`,
  );
}

const javaScriptFiles = [
  ...new Set(
    Object.values(manifest)
      .map((value) => value.file)
      .filter((file) => file.endsWith(".js")),
  ),
];
const chunkSizes = await Promise.all(
  javaScriptFiles.map(async (file) => ({ file, size: await fileSize(file) })),
);
const initialKeys = collectStaticImports(manifest, entry[0]);
const initialFiles = [
  ...new Set(
    [...initialKeys]
      .map((key) => manifest[key]?.file)
      .filter((file) => typeof file === "string" && file.endsWith(".js")),
  ),
];
const initialEntryBytes = (await Promise.all(initialFiles.map((file) => fileSize(file)))).reduce(
  (sum, size) => sum + size,
  0,
);
const maxChunk = chunkSizes.reduce(
  (largest, chunk) => (chunk.size > largest.size ? chunk : largest),
  { file: "none", size: 0 },
);
const totalJavaScriptBytes = chunkSizes.reduce((sum, chunk) => sum + chunk.size, 0);

const measurements = {
  initialEntryBytes,
  maxChunkBytes: maxChunk.size,
  totalJavaScriptBytes,
};
const failures = Object.entries(measurements).filter(([key, size]) => size > budgets[key]);

console.log(
  `Bundle budget: initial ${formatBytes(initialEntryBytes)} (${initialFiles.join(", ")})`,
);
console.log(`Bundle budget: largest ${formatBytes(maxChunk.size)} (${maxChunk.file})`);
console.log(
  `Bundle budget: total JS ${formatBytes(totalJavaScriptBytes)} across ${chunkSizes.length} chunks`,
);

if (failures.length > 0) {
  for (const [key, size] of failures) {
    console.error(
      `Bundle budget exceeded: ${key} ${formatBytes(size)} > ${formatBytes(budgets[key])}`,
    );
  }
  process.exitCode = 1;
}
