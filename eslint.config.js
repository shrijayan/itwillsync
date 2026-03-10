import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Terminal tool — ANSI escape sequences are fundamental
      "no-control-regex": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["packages/web-client/src/**/*.ts", "packages/hub/src/dashboard/**/*.ts", "packages/landing/src/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    ignores: [
      "**/dist/",
      "**/node_modules/",
      "**/*.js",
      "**/*.mjs",
      "**/*.cjs",
      "reference/",
      "docs/",
    ],
  },
);
