import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "node",
  testPathIgnorePatterns: [
    "<rootDir>/.next/",
    "<rootDir>/node_modules/",
    "<rootDir>/e2e/",
    // mail/ runs its own tests (vitest) from its own workspace.
    "<rootDir>/mail/",
  ],
  modulePathIgnorePatterns: [
    "<rootDir>/mail/",
  ],
};

export default createJestConfig(config);
