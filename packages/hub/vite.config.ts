import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: "src/dashboard",
  build: {
    outDir: "../../dist/dashboard",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "src/dashboard/index.html"),
    },
  },
});
