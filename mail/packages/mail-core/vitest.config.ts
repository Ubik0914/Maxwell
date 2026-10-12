import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "mail-core", environment: "node", include: ["src/**/*.test.ts"] },
});
