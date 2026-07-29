import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Los worktrees de agente son copias completas del repo, con su propio
    // .next dentro. Los patrones de arriba están anclados a la raíz, así que
    // no los cubren: sin esta línea, un solo worktree con build hecho mete
    // ~1000 errores de código generado en `npm run lint` y tapa los reales.
    ".claude/**",
  ]),
]);

export default eslintConfig;
