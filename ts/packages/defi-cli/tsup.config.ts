import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/main.ts"],
  format: ["esm"],
  dts: false,
  sourcemap: true,
  clean: true,
  target: "node22",
  splitting: false,
  // Bundle workspace packages into the output so npx works
  noExternal: ["@hypurrquant/defi-core", "@hypurrquant/defi-protocols"],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
