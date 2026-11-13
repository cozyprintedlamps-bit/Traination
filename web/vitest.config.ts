import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"], // the browser tests have their own config
    // the first test loads the WebAssembly module and builds geometry
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // `npm run render` draws pictures of the geometry (tests/render.test.ts)
    env: mode === "render" ? { TRAINATION_RENDER: "1" } : {},
  },
}));
