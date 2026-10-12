import { defineConfig } from "tsup";

// ワークスペース内パッケージ（TypeScriptソース）を同梱し、外部依存は node_modules から読む
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  noExternal: [/^@synedge\//],
  sourcemap: true,
  clean: true,
});
