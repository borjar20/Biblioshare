import { defineConfig } from "vitest/config";

// Unit tests — pure functions (parsers, matchers, formatters) and, desde los
// gráficos del muro de estadísticas, algún componente renderizado. No DB ni red.
// The `@/` alias is resolved natively from tsconfig.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    // `node` sigue siendo el entorno por defecto de TODO el proyecto: son ~190
    // ficheros de lógica pura que no quieren un DOM. Los pocos tests que
    // renderizan piden el suyo con `// @vitest-environment jsdom` en su primera
    // línea. Ponerlo global daría `window` a los tests de servidor, que es justo
    // lo que deja pasar un import que luego revienta en producción.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
