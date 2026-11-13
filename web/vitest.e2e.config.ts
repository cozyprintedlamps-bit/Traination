import { defineConfig } from "vitest/config";

// Browser tests: they need the built app (`npm run build`) and Chrome. Run with `npm run test:e2e`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
