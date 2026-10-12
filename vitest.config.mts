import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/*
 * The mail client's tests (src/mail, formerly Synedge) run on Vitest, as
 * they always have; everything else stays on Jest (jest.config.ts skips
 * src/mail). `npm test` runs both.
 */
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/mail/testing-server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/mail/**/*.test.ts", "src/mail/**/*.test.tsx"],
    environment: "node",
  },
});
