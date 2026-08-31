#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, ".next", "build-manifest.json");
const maxKb = Number(process.env.MAIN_BUNDLE_KB ?? 500);

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch {
  console.log("::notice title=Bundle budget::build-manifest.json not found; main bundle check skipped");
  process.exit(0);
}

const files = manifest.rootMainFiles ?? [];
let totalBytes = 0;
for (const file of files) {
  const resolved = path.join(root, ".next", file);
  try {
    totalBytes += (await stat(resolved)).size;
  } catch {
    console.error(`::error title=Bundle budget::main bundle entry missing: ${file}`);
    process.exit(1);
  }
}

const totalKb = Math.round(totalBytes / 1024);
console.log(`main bundle: ${totalKb} KB across ${files.length} chunks (budget: ${maxKb} KB)`);
if (totalKb > maxKb) {
  console.error(`::error title=Bundle budget::main bundle at ${totalKb} KB exceeds ${maxKb} KB budget. Lazy-load any newly added client-heavy components.`);
  process.exit(1);
}