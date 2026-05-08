import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  // Resolve workspace packages to their TypeScript source so vitest's v8
  // coverage instruments the actual implementation files instead of the
  // pre-built dist bundles (which would otherwise read 0% line coverage).
  resolve: {
    alias: {
      "@hypurrquant/defi-core": resolve(__dirname, "packages/defi-core/src/index.ts"),
      "@hypurrquant/defi-protocols": resolve(__dirname, "packages/defi-protocols/src/index.ts"),
    },
  },
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "test/**/*.test.ts",
    ],
    testTimeout: 60000,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary"],
      include: ["packages/*/src/**/*.ts"],
      exclude: [
        "packages/*/src/**/*.test.ts",
        "packages/*/dist/**",
        "**/node_modules/**",
      ],
    },
  },
});
