import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Parte I §16.1 hecho test: el motor no toca azar, reloj, entorno, Supabase ni
// React. Se miran los fuentes sin comentarios, así que los comentarios pueden
// nombrar lo prohibido.
const dir = dirname(fileURLToPath(import.meta.url));
const FORBIDDEN = [/Math\.random/, /new Date\(/, /Date\.now/, /process\.env/, /@supabase\//, /from "react"/, /from "next/];
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("pureza del motor", () => {
  it("ningún módulo del motor importa ni usa lo que lo haría no determinista", () => {
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(files.length).toBeGreaterThanOrEqual(13);
    for (const f of files) {
      const src = stripComments(readFileSync(join(dir, f), "utf8"));
      for (const re of FORBIDDEN) expect(src, `${f} contiene ${re}`).not.toMatch(re);
    }
  });
});
