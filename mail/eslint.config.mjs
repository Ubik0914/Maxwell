import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "apps/mobile/android/**",
      "apps/mobile/www/**",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["**/*.tsx", "apps/web/src/**/*.ts"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // UIはGmail API・DB・トークンに触れない（仕様4章）
    files: ["packages/ui/**", "apps/web/src/components/**", "apps/web/src/features/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@synedge/database", "@synedge/database/*"], message: "UI層からDBへ直接アクセスしない" },
            { group: ["@synedge/mail-core/server", "@synedge/mail-core/server/*"], message: "UI層からサーバー専用コードを読まない" },
            { group: ["**/server/**"], message: "UI層からサーバー専用コードを読まない" },
          ],
        },
      ],
    },
  },
);
