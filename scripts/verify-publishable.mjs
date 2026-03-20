#!/usr/bin/env node

/**
 * Post-build verification: ensures the CLI package is safe to publish to npm.
 * Run after `pnpm build` — catches issues that unit tests cannot.
 *
 * Usage: node scripts/verify-publishable.mjs
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const rootDir = join(import.meta.dirname, "..");
const cliDir = join(rootDir, "packages", "cli");
let failed = false;

function fail(message) {
  console.error(`FAIL: ${message}`);
  failed = true;
}

function pass(message) {
  console.log(`  OK: ${message}`);
}

console.log("Verifying CLI package is publishable...\n");

// 1. Check package.json dependencies for workspace: protocol
const pkgJson = JSON.parse(readFileSync(join(cliDir, "package.json"), "utf-8"));
const deps = pkgJson.dependencies || {};
for (const [name, version] of Object.entries(deps)) {
  if (version.includes("workspace:")) {
    fail(
      `dependencies["${name}"] = "${version}" — workspace: protocol cannot be published to npm`
    );
  }
}
if (!failed) {
  pass("No workspace: references in dependencies");
}

// 2. Check built JS files for unresolved workspace package imports
const filesToCheck = [
  "dist/index.js",
  "dist/hub/daemon.js",
];

for (const file of filesToCheck) {
  const filePath = join(cliDir, file);
  try {
    const content = readFileSync(filePath, "utf-8");
    // Match import/require of @itwillsync/* packages (should be bundled, not external)
    const matches = content.match(
      /(?:import|require)\s*(?:\(.*?|.*?from\s+)["'](@itwillsync\/[^"']+)["']/g
    );
    if (matches) {
      fail(`${file} has unbundled workspace imports:\n${matches.map((m) => `    ${m}`).join("\n")}`);
    } else {
      pass(`${file} — no unbundled workspace imports`);
    }
  } catch {
    fail(`${file} — file not found (build may have failed)`);
  }
}

// Result
console.log("");
if (failed) {
  console.error(
    "Publish verification FAILED. Fix the issues above before publishing."
  );
  process.exit(1);
} else {
  console.log("All checks passed — safe to publish.");
}
