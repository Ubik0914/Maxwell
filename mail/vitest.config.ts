import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/mail-core",
      "packages/database",
      "packages/ui",
      "apps/web",
      "apps/mcp",
      "apps/worker",
    ],
  },
});
