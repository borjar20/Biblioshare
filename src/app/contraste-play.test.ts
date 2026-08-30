import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Hermano de `contraste-tokens.test.ts`, para la familia de BiblioPlay (#931).
// Mismo planteamiento y por el mismo motivo: lee el CSS REAL en vez de copiar los
// valores, porque duplicarlos es lo que deja que la doc y el color se separen sin
// que nadie se entere.
//
// Los colores de asiento pintan DOS cosas con umbrales distintos: la barra del
// asiento y la mitad teñida al pulsar son objeto gráfico (3:1, WCAG 1.4.11); el
// número de vidas se pinta sobre el panel, no sobre el color, así que no cae aquí.
// Lo que este test defiende es lo que de verdad se puede romper sin darse cuenta:
// que un asiento se funda con el fieltro de la mesa en alguno de los tres temas.
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

// «Se distinguen dos colores entre sí» NO es la razón de contraste de WCAG: esa
// mide LUMINANCIA, y dos tonos de la misma claridad y distinto tono (un ámbar y un
// carmesí) la suspenden aunque a simple vista no se parezcan en nada. Para eso
// sirve la distancia en CIELAB, que sí separa tono y claridad. La primera versión
// de este test usaba la razón de contraste y suspendía a la paleta corregida.
function lab(hex: string): [number, number, number] {
  const canal = (c: number) => {
    const cs = c / 255;
    return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  };
  const r = canal(parseInt(hex.slice(1, 3), 16));
  const g = canal(parseInt(hex.slice(3, 5), 16));
  const b = canal(parseInt(hex.slice(5, 7), 16));
  // sRGB -> XYZ (D65) -> Lab
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** Distancia CIE76. Referencias medidas: la colisión vieja daba 4,6; el par corregido, 32. */
function distancia(a: string, b: string): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

const bloqueMedia = extraerBloque(globalsCss, /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/);

// Los TRES bloques de tema, no dos. El tercero es el oscuro de quien nunca ha
// tocado el interruptor -- el caso por defecto, y el que se olvida al espejar.
const TEMAS = [
  ["claro", extraerTokens(extraerBloque(globalsCss, /:root\s*\{/))],
  ["oscuro (.dark)", extraerTokens(extraerBloque(globalsCss, /\.dark\s*\{/))],
  [
    "oscuro (@media prefers-color-scheme)",
    extraerTokens(extraerBloque(bloqueMedia, /:root:not\(\.light\):not\(\.dark\)\s*\{/)),
  ],
] as const;

const ASIENTOS = [1, 2, 3, 4, 5, 6] as const;
const UMBRAL_OBJETO_GRAFICO = 3;

describe("tokens de BiblioPlay (#931)", () => {
  for (const [tema, tokens] of TEMAS) {
    it(`${tema}: los seis asientos existen y se distinguen del fieltro`, () => {
      for (const n of ASIENTOS) {
        const color = tokens[`play-seat-${n}`];
        expect(color, `falta --play-seat-${n} en "${tema}"`).toBeDefined();
        expect(
          contraste(color, tokens["play-felt"]),
          `--play-seat-${n} sobre --play-felt en "${tema}"`,
        ).toBeGreaterThanOrEqual(UMBRAL_OBJETO_GRAFICO);
      }
    });

    // El par que este test existe para vigilar: el óxido del asiento 1 y el rojo de
    // "condición cumplida" eran #b0492f contra #a6432f -- ΔE 4,6, indistinguibles a
    // metro y medio de la mesa. Separados son 32. El estado letal lleva ADEMÁS
    // rayado y una regla bajo el número (WCAG 1.4.1: el color nunca es el único
    // medio), pero eso no excusa que los dos tonos vuelvan a juntarse.
    it(`${tema}: el peligro no se confunde con el óxido del asiento 1`, () => {
      expect(tokens["play-danger"], `falta --play-danger en "${tema}"`).toBeDefined();
      expect(distancia(tokens["play-danger"], tokens["play-seat-1"])).toBeGreaterThanOrEqual(25);
    });

    // Seis colores parecidos se leen mejor que cuatro repetidos con un rayado
    // (decisión del canvas), pero «parecidos» tiene suelo. Los pares más juntos son
    // óxido/ámbar en claro (ΔE 19,1) y ciruela/índigo en oscuro (22,0): el umbral
    // deja pasar eso a propósito y caza una colisión de verdad como la de arriba.
    it(`${tema}: ningún par de asientos colapsa en el mismo color`, () => {
      for (let i = 0; i < ASIENTOS.length; i++) {
        for (let j = i + 1; j < ASIENTOS.length; j++) {
          const a = tokens[`play-seat-${ASIENTOS[i]}`];
          const b = tokens[`play-seat-${ASIENTOS[j]}`];
          expect(
            distancia(a, b),
            `asientos ${ASIENTOS[i]} y ${ASIENTOS[j]} en "${tema}"`,
          ).toBeGreaterThanOrEqual(15);
        }
      }
    });

    it(`${tema}: el fieltro existe y no es el papel del resto de la app`, () => {
      expect(tokens["play-felt"], `falta --play-felt en "${tema}"`).toBeDefined();
      expect(tokens["play-felt"]).not.toBe(tokens["background"]);
    });
  }
});
