import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Auditoría 2026-08, hallazgo F4-022 (issue #815): axe sacaba `color-contrast`
// con severidad *serious* en las 17 rutas, de 7 a 71 nodos por página. No eran
// 17 problemas: eran DOS tokens, y cada uno pedía un arreglo distinto.
//
//   --muted-foreground  3,41:1 sobre --background, 836 usos  -> se cambia el valor
//   --foreground-faint  2,25:1 sobre --background,  59 usos  -> se saca del TEXTO
//
// Por qué al segundo no le vale un valor nuevo, que es lo que proponía la
// auditoría: sobre papel (#f3ece1) cualquier color que llegue a 4,5:1 cae en
// L* 42, y ahí es donde ya está --muted-foreground (L* 42,0 contra 42,6). O sea
// que "oscurecer --foreground-faint hasta AA" es exactamente lo mismo que
// borrarlo: el peldaño que justifica que exista desaparece. Se decidió sacarlo
// del texto y dejarlo solo para objetos decorativos.
//
// Este test defiende las dos mitades, y lee el CSS y el código REALES en vez de
// copiar los valores: duplicarlos es lo que deja que la doc y el color se
// separen sin que nadie se entere. Mismo patrón que `mark-accent.test.ts`, que
// nació de un fallo de contraste que un valor duplicado a mano dejó pasar.

const globalsCss = readFileSync("src/app/globals.css", "utf8");

/** Recorta el bloque `{ … }` que sigue a `selector`, contando llaves. */
function extraerBloque(css: string, selector: RegExp): string {
  const inicio = selector.exec(css);
  if (!inicio) throw new Error(`No se encontró el selector ${selector} en globals.css`);
  let profundidad = 1;
  const desde = inicio.index + inicio[0].length;
  for (let i = desde; i < css.length; i++) {
    if (css[i] === "{") profundidad++;
    else if (css[i] === "}") {
      profundidad--;
      if (profundidad === 0) return css.slice(desde, i);
    }
  }
  throw new Error(`No se encontró el cierre del bloque de ${selector} en globals.css`);
}

/** `--token: #rrggbb;` -> { token: "#rrggbb" }. Ignora rgba() y var(). */
function extraerTokens(bloque: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  const re = /--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bloque))) tokens[m[1]] = m[2];
  return tokens;
}

function luminanciaRelativa(hex: string): number {
  const canal = (c: number) => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * canal(parseInt(hex.slice(1, 3), 16)) +
    0.7152 * canal(parseInt(hex.slice(3, 5), 16)) +
    0.0722 * canal(parseInt(hex.slice(5, 7), 16))
  );
}

function contraste(a: string, b: string): number {
  const lA = luminanciaRelativa(a);
  const lB = luminanciaRelativa(b);
  return (Math.max(lA, lB) + 0.05) / (Math.min(lA, lB) + 0.05);
}

const bloqueMedia = extraerBloque(globalsCss, /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/);

// Los TRES bloques de tema, no dos. El tercero es el oscuro de quien nunca ha
// tocado el interruptor —el caso por defecto— y es el que se olvida al espejar.
const TEMAS = [
  ["claro", extraerTokens(extraerBloque(globalsCss, /:root\s*\{/))],
  ["oscuro (.dark)", extraerTokens(extraerBloque(globalsCss, /\.dark\s*\{/))],
  [
    "oscuro (@media prefers-color-scheme)",
    extraerTokens(extraerBloque(bloqueMedia, /:root:not\(\.light\):not\(\.dark\)\s*\{/)),
  ],
] as const;

// Los tres fondos sobre los que se pinta TEXTO. `--surface-3` queda fuera a
// propósito: ahí no hay prosa, solo el icono de quitar género del editor de
// catálogo, y un icono se rige por 1.4.11 (3:1), no por 1.4.3.
const FONDOS_DE_TEXTO = ["background", "surface", "surface-muted"] as const;
const TOKENS_DE_TEXTO = ["foreground", "foreground-soft", "muted-foreground"] as const;

const UMBRAL_TEXTO = 4.5;
const UMBRAL_OBJETO_GRAFICO = 3;

describe("contraste de los tokens de texto (F4-022)", () => {
  for (const [tema, tokens] of TEMAS) {
    for (const nombre of TOKENS_DE_TEXTO) {
      for (const fondo of FONDOS_DE_TEXTO) {
        it(`${tema}: --${nombre} sobre --${fondo} llega a AA`, () => {
          const color = tokens[nombre];
          const papel = tokens[fondo];
          expect(color, `--${nombre} no está en el bloque "${tema}"`).toBeDefined();
          expect(papel, `--${fondo} no está en el bloque "${tema}"`).toBeDefined();
          expect(contraste(color, papel)).toBeGreaterThanOrEqual(UMBRAL_TEXTO);
        });
      }
    }
  }

  // El único sitio donde --muted-foreground cae sobre --surface-3 es un icono
  // de 10px, así que aquí el listón es el de objeto gráfico. Se comprueba igual:
  // con el valor viejo (#877e70) daba 2,81 y no pasaba ni ese.
  for (const [tema, tokens] of TEMAS) {
    it(`${tema}: --muted-foreground sobre --surface-3 llega a 3:1 (icono)`, () => {
      expect(contraste(tokens["muted-foreground"], tokens["surface-3"])).toBeGreaterThanOrEqual(
        UMBRAL_OBJETO_GRAFICO,
      );
    });
  }
});

describe("--foreground-faint no colorea texto (F4-022)", () => {
  // La mitad que NO se arregla con un valor. Si vuelve a aparecer un
  // `text-foreground-faint`, vuelve el hallazgo: 2,25:1 en claro y 2,16:1 en
  // oscuro, muy por debajo de AA en los dos temas.
  it("no queda ningún `text-foreground-faint` en src/", () => {
    // Los ficheros de test quedan fuera: este mismo escribe la clase prohibida
    // en su mensaje de error, y sin excluirlos el test se acusa a sí mismo.
    function recorrer(dir: string, acc: string[] = []): string[] {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) recorrer(p, acc);
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) acc.push(p);
      }
      return acc;
    }
    const culpables = recorrer("src").filter((f) =>
      readFileSync(f, "utf8").includes("text-foreground-faint"),
    );
    expect(
      culpables,
      "--foreground-faint no llega a AA en ningún tema y no se puede subir sin fundirlo con --muted-foreground: para texto va `text-muted-foreground`",
    ).toEqual([]);
  });

  it("el token sigue existiendo en los tres temas, que para objetos decorativos vale", () => {
    for (const [tema, tokens] of TEMAS) {
      expect(tokens["foreground-faint"], `falta --foreground-faint en "${tema}"`).toBeDefined();
    }
  });
});
