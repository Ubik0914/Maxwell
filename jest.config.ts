import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "node",
  testPathIgnorePatterns: [
    "<rootDir>/.next/",
    "<rootDir>/node_modules/",
    "<rootDir>/e2e/",
    // The mail's tests run on Vitest (vitest.config.mts).
    "<rootDir>/src/mail/",
    "<rootDir>/mobile/",
  ],
  modulePathIgnorePatterns: [
    "<rootDir>/mobile/",
  ],
};

export default createJestConfig(config);
