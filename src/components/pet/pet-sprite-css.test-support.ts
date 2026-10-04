import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transform, type StyleSheet } from "lightningcss";
import { parse } from "postcss";

// Frontera del loader CSS, sólo para estas pruebas: compila el fichero real con
// el parser instalado. No interpreta la cascada ni simula un navegador.
export function compilePetSpriteCss() {
  const filename = resolve("src/components/pet/pet-sprite.module.css");
  const result = transform({
    filename,
    code: readFileSync(filename),
    cssModules: true,
    errorRecovery: false,
  });
  if (result.warnings.length) throw new Error("PetSprite CSS produjo advertencias");
  const names = Object.fromEntries(
    Object.entries(result.exports ?? {}).map(([name, entry]) => [name, entry.name]),
  );
  const css = result.code.toString();
  let ast: StyleSheet | undefined;
  transform({
    filename: "compiled-pet-sprite.css",
    code: result.code,
    errorRecovery: false,
    visitor: { StyleSheet(sheet) { ast = sheet; } },
  });
  if (!ast) throw new Error("PetSprite CSS no produjo AST");
  return { css, names, ast, root: parse(css) };
}
