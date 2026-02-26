import { defineConfig } from "tsup";
import { cpSync } from "node:fs";
import { resolve } from "node:path";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  banner: {
    js: '#!/usr/bin/env node\nimport{createRequire}from"module";const require=createRequire(import.meta.url);',
  },
  external: ["node-pty", "qrcode-terminal"],
  noExternal: ["ws"],
  onSuccess: async () => {
    // Copy built web client into CLI dist
    const src = resolve("../web-client/dist");
    const dest = resolve("dist/web-client");
    cpSync(src, dest, { recursive: true });
    console.log("Copied web-client dist → dist/web-client");
  },
});
