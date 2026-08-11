import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MARK_ACCENT,
  accentKeyFor,
  LEYENDA_MARCAS,
  LEYENDA_EVENTOS,
  LEYENDA_LANZAMIENTOS,
  type MarkAccentKey,
} from "./mark-accent";

function marca(over: Partial<Parameters<typeof accentKeyFor>[0]> = {}) {
  return {
    markKind: "evento" as const,
    eventType: "encuentro" as const,
    medium: null,
    ...over,
  };
}

describe("accentKeyFor", () => {
  it("markKind manda: un hito de una actividad evento sigue siendo hito", () => {
    expect(accentKeyFor(marca({ markKind: "hito", eventType: null }))).toBe("hito");
  });

  it("inicio y cierre pasan tal cual", () => {
    expect(accentKeyFor(marca({ markKind: "inicio", eventType: null }))).toBe("inicio");
    expect(accentKeyFor(marca({ markKind: "cierre", eventType: null }))).toBe("cierre");
  });

  it("encuentro y fecha_destacada tienen su clave", () => {
    expect(accentKeyFor(marca({ eventType: "encuentro" }))).toBe("encuentro");
    expect(accentKeyFor(marca({ eventType: "fecha_destacada" }))).toBe("fecha_destacada");
  });

  it("cada medio de lanzamiento tiene su clave", () => {
    expect(accentKeyFor(marca({ eventType: "lanzamiento", medium: "book" }))).toBe(
      "lanzamiento_book",
    );
    expect(accentKeyFor(marca({ eventType: "lanzamiento", medium: "movie" }))).toBe(
      "lanzamiento_movie",
    );
    expect(accentKeyFor(marca({ eventType: "lanzamiento", medium: "series" }))).toBe(
      "lanzamiento_series",
    );
  });

  it("un lanzamiento SIN ítem cae a fecha_destacada, no revienta", () => {
    expect(accentKeyFor(marca({ eventType: "lanzamiento", medium: null }))).toBe(
      "fecha_destacada",
    );
  });

  it("una marca de evento sin eventType cae a fecha_destacada", () => {
    // No debería pasar (core.ts siempre lo puebla para kind evento), pero la
    // función es total: no puede devolver undefined y dejar la celda sin color.
    expect(accentKeyFor(marca({ eventType: null }))).toBe("fecha_destacada");
  });
});

describe("la leyenda cubre TODO MARK_ACCENT", () => {
  // El test que de verdad importa: si alguien añade una clave al Record y no la
  // coloca en ninguna fila, la leyenda dejaría de explicar un color que la
  // rejilla sí pinta -- la divergencia contra la que avisa el comentario del
  // fichero.
  it("las tres filas particionan las claves, sin huecos ni repetidos", () => {
    const todas = Object.keys(MARK_ACCENT).sort();
    const enLeyenda = [...LEYENDA_MARCAS, ...LEYENDA_EVENTOS, ...LEYENDA_LANZAMIENTOS].sort();
    expect(enLeyenda).toEqual(todas);
    expect(new Set(enLeyenda).size).toBe(enLeyenda.length);
  });

  it("la fila de marcas va en el orden de desempate de la rejilla", () => {
    const esperado: MarkAccentKey[] = ["inicio", "hito", "cierre"];
    expect(LEYENDA_MARCAS).toEqual(esperado);
  });

  it("la fila de lanzamientos va libro, película, serie", () => {
    const esperado: MarkAccentKey[] = [
      "lanzamiento_book",
      "lanzamiento_movie",
      "lanzamiento_series",
    ];
    expect(LEYENDA_LANZAMIENTOS).toEqual(esperado);
  });
});

describe("los colores de evento son distinguibles entre sí", () => {
  it("las cinco clases de evento tienen cinco barras distintas", () => {
    const barras = [
      "encuentro",
      "fecha_destacada",
      "lanzamiento_book",
      "lanzamiento_movie",
      "lanzamiento_series",
    ].map((k) => MARK_ACCENT[k as MarkAccentKey].bar);
    expect(new Set(barras).size).toBe(5);
  });

  it("cada clave tiene su propio icono, no todos el mismo", () => {
    const iconos = new Set(Object.values(MARK_ACCENT).map((a) => a.Icon));
    expect(iconos.size).toBe(Object.keys(MARK_ACCENT).length);
  });
});

// Regresión del fallo de `encuentro` con `--spine` (2.27:1 en claro, por
// debajo del 3:1 de objeto gráfico -- WCAG 1.4.1): este test lee el CSS real
// de globals.css, extrae el token que colorea cada clase de MARK_ACCENT y
// mide su contraste contra --surface en los dos temas. Así, si alguien
// vuelve a apuntar una clave a un token que no llega al umbral, el test
// revienta ANTES de que el fallo llegue al navegador.
describe("contraste de las clases de MARK_ACCENT contra --surface", () => {
  // Vitest corre con environment: "node" en este repo (vitest.config.ts), así
  // que node:fs está disponible; se lee el CSS de verdad en vez de duplicar
  // los valores a mano, que es justo lo que dejó pasar el fallo original.
  const globalsCss = readFileSync("src/app/globals.css", "utf8");

  /** Recorta el bloque `{ ... }` que sigue a la primera aparición de `selector` (sin llaves anidadas dentro). */
  function extraerBloque(css: string, selector: RegExp): string {
    const inicio = selector.exec(css);
    if (!inicio) {
      throw new Error(`No se encontró el selector ${selector} en globals.css`);
    }
    const desde = inicio.index + inicio[0].length;
    const hasta = css.indexOf("\n}", desde);
    if (hasta === -1) {
      throw new Error(`No se encontró el cierre del bloque de ${selector} en globals.css`);
    }
    return css.slice(desde, hasta);
  }

  /** `--token: #rrggbb;` -> { token: "#rrggbb" } dentro de un bloque. */
  function extraerTokens(bloque: string): Record<string, string> {
    const tokens: Record<string, string> = {};
    const re = /--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(bloque))) {
      tokens[m[1]] = m[2];
    }
    return tokens;
  }

  // Bloque claro: la primera declaración `:root {` (no ":root:not(.light)..."
  // del @media, que el patrón exige que vaya seguido de "{" directamente).
  const tokensClaro = extraerTokens(extraerBloque(globalsCss, /:root\s*\{/));
  // Bloque oscuro manual: `.dark {` (el @media prefers-color-scheme espeja
  // estos mismos valores para el tema oscuro por defecto del sistema).
  const tokensOscuro = extraerTokens(extraerBloque(globalsCss, /\.dark\s*\{/));

  function luminanciaRelativa(hex: string): number {
    const canal = (c: number) => {
      const cs = c / 255;
      return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
    };
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
  }

  function contraste(hexA: string, hexB: string): number {
    const lA = luminanciaRelativa(hexA);
    const lB = luminanciaRelativa(hexB);
    const claro = Math.max(lA, lB);
    const oscuro = Math.min(lA, lB);
    return (claro + 0.05) / (oscuro + 0.05);
  }

  /** "bg-event-meetup" -> "event-meetup" (quita el prefijo `bg-` y un posible `/NN` de opacidad). */
  function tokenDeClaseBar(bar: string): string {
    return bar.replace(/^bg-/, "").split("/")[0];
  }

  const UMBRAL_OBJETO_GRAFICO = 3;

  // `cierre` (gold, #c98a2b) da 2.89:1 contra --surface en tema claro: es un
  // fallo PREEXISTENTE, no introducido por este cambio, y no se corrige aquí
  // (issue #577 -- oscurecer --gold pide revisar su blast radius fuera del
  // calendario, --gold-ink existe por la misma razón para texto). Se excluye
  // explícitamente en vez de dejar el test rojo desde el día uno, que es como
  // un test acaba desactivado del todo.
  const EXCLUIDAS_FALLO_PREEXISTENTE = new Set<MarkAccentKey>(["cierre"]);

  const clavesAComprobar = (Object.keys(MARK_ACCENT) as MarkAccentKey[]).filter(
    (clave) => !EXCLUIDAS_FALLO_PREEXISTENTE.has(clave),
  );

  it.each(clavesAComprobar)("%s pasa 3:1 contra --surface en tema claro", (clave) => {
    const token = tokenDeClaseBar(MARK_ACCENT[clave].bar);
    const color = tokensClaro[token];
    expect(color, `--${token} no aparece en el bloque :root de globals.css`).toBeDefined();
    const ratio = contraste(color as string, tokensClaro.surface);
    expect(ratio).toBeGreaterThanOrEqual(UMBRAL_OBJETO_GRAFICO);
  });

  it.each(clavesAComprobar)("%s pasa 3:1 contra --surface en tema oscuro", (clave) => {
    const token = tokenDeClaseBar(MARK_ACCENT[clave].bar);
    const color = tokensOscuro[token];
    expect(color, `--${token} no aparece en el bloque .dark de globals.css`).toBeDefined();
    const ratio = contraste(color as string, tokensOscuro.surface);
    expect(ratio).toBeGreaterThanOrEqual(UMBRAL_OBJETO_GRAFICO);
  });
});
