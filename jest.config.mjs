import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

/**
 * Single config so `next/jest`'s SWC transform applies everywhere.
 * Server-side suites opt into the node environment with a
 * `@jest-environment node` docblock.
 */
/** @type {import('jest').Config} */
const config = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["<rootDir>/tests/**/*.test.ts?(x)"],
  moduleNameMapper: {
    "^@frontend/ui$": "<rootDir>/src/frontend/ui/index.ts",
    "^@frontend/ui/(.*)$": "<rootDir>/src/frontend/ui/$1",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

export default createJestConfig(config);
