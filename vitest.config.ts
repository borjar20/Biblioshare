import { defineConfig } from "vitest/config";

// Unit tests only — pure functions (parsers, matchers, formatters). No DB or
// network. The `@/` alias is resolved natively from tsconfig.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
