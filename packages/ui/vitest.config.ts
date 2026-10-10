import { defineProject } from "vitest/config";

export default defineProject({
  esbuild: { jsx: "automatic" },
  test: {
    name: "ui",
    environment: "jsdom",
    include: ["src/**/*.test.tsx"],
    setupFiles: ["./src/test-setup.ts"],
  },
});
