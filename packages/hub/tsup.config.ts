import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/daemon.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  splitting: false,
  sourcemap: true,
  clean: false, // vite build runs first, don't wipe dashboard dist
  dts: false,
  banner: {
    js: '#!/usr/bin/env node\nimport{createRequire}from"module";const require=createRequire(import.meta.url);',
  },
  noExternal: ["ws", "@itwillsync/shared"],
  onSuccess: async () => {
    // Dashboard is already built by vite into dist/dashboard — no copy needed
    console.log("Hub daemon built. Dashboard available at dist/dashboard/");
  },
});
