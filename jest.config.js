// Set dummy environment variables for tests so that config/env.ts parses successfully
process.env.NODE_ENV = "test";
process.env.PORT = "3001";
process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5432/predictify_test";
process.env.JWT_SECRET = "test-secret-with-at-least-32-characters";
process.env.SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";
process.env.HORIZON_URL = "https://horizon-testnet.stellar.org";
process.env.PREDICTIFY_CONTRACT_ID = "CABCDEF1234567890";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/tests/setup.ts"],
  testMatch: ["**/tests/**/*.test.ts"],
  globals: {
    "ts-jest": {
      // Use the test-specific tsconfig so ts-jest can find both src/ and
      // tests/ files, and so unused-parameter errors in mock stubs don't
      // block the test suite.
      tsconfig: "<rootDir>/tsconfig.test.json",
      // Disable full type-checking during test runs — tsc in CI handles
      // that separately.  This lets ts-jest transpile files that have
      // pre-existing type errors in unrelated modules without blocking
      // the test suite.
      diagnostics: false,
    },
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/index.ts",
  ],
  coverageDirectory: "coverage",
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 90,
      statements: 90,
    },
  },
  // Separate E2E tests from unit tests
  testPathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
  ],
  // Increase timeout for E2E tests
  testTimeout: 10000, // 10 seconds default, E2E tests override this
  verbose: true,
};
