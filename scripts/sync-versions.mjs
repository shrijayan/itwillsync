#!/usr/bin/env node

/**
 * Syncs the release version to all workspace packages.
 * Called by semantic-release via @semantic-release/exec.
 *
 * Usage: node scripts/sync-versions.mjs <version>
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const version = process.argv[2];
if (!version) {
  console.error("Usage: node scripts/sync-versions.mjs <version>");
  process.exit(1);
}

const packagesDir = join(import.meta.dirname, "..", "packages");
const packages = readdirSync(packagesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const pkg of packages) {
  const pkgJsonPath = join(packagesDir, pkg, "package.json");
  try {
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
    pkgJson.version = version;
    writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + "\n");
    console.log(`Updated ${pkg} to v${version}`);
  } catch {
    // Skip packages without package.json
  }
}
