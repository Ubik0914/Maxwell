import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The mail code (formerly Synedge) names deliberately unused
  // parameters and destructured leftovers with a leading underscore.
  {
    files: ["src/mail/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  // The mail's screens never reach the database, Gmail tokens or other
  // server-only code; the client bundle check (npm run check:mail-bundle)
  // backs this up after a build.
  {
    files: ["src/mail/ui/**/*.{ts,tsx}", "src/mail/components/**/*.{ts,tsx}", "src/mail/client/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/mail/core/server", "@/mail/core/server/*"], message: "UI からサーバー専用コードを import しない" },
            { group: ["@/mail/database", "@/mail/database/*"], message: "UI から DB を import しない" },
            { group: ["@/mail/server/*", "@/mail/worker/*"], message: "UI からサーバー専用コードを import しない" },
          ],
        },
      ],
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The Android shell for the mail (Capacitor) is its own npm package.
    "mobile/**",
  ]),
]);

export default eslintConfig;
