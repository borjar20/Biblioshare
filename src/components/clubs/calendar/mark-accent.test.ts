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

  // Las otras dos filas ya tenían su orden clavado; esta no, y la asimetría
  // invitaba a pensar que el suyo daba igual. Da lo mismo que las demás: la
  // leyenda se lee de izquierda a derecha y reordenarla sin querer (al insertar
  // una clave nueva en el Record) mueve dos muestras de sitio.
  it("la fila de eventos va encuentro, fecha destacada", () => {
    const esperado: MarkAccentKey[] = ["encuentro", "fecha_destacada"];
    expect(LEYENDA_EVENTOS).toEqual(esperado);
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

// Regresión de DOS fallos de contraste, con DOS umbrales distintos:
//
//   1. `encuentro` con `--spine`: 2.27:1 contra --surface en claro, por debajo
//      del 3:1 que WCAG 1.4.1 exige a un OBJETO GRÁFICO (aquí, el punto del
//      chip y la muestra de la leyenda, que van en `bar`).
//   2. `encuentro` con el primer `--event-meetup` (#94825c): 3.32:1 contra su
//      propio tinte, por debajo del 4.5:1 que WCAG 1.4.3 exige al TEXTO. El
//      `text` de una clase no colorea solo iconos: colorea la etiqueta del chip
//      de agenda-list.tsx (9px, mayúsculas) y el subtítulo de la tira "Próximo"
//      de club-summary.tsx (12px), ambos sobre `bgSoft` -- el mismo token al
//      10% compuesto sobre --surface. Medir solo el 3:1 dejó pasar ese fallo.
//
// El test lee el CSS REAL de globals.css en vez de duplicar los valores a mano
// (duplicarlos es justo lo que dejó pasar el fallo original), y lo hace en los
// TRES bloques de tema, no en dos: `:root`, `.dark` y el
// `@media (prefers-color-scheme: dark)`. Ese tercero es el tema oscuro de quien
// no ha tocado el interruptor -- el caso por defecto, no un borde-- y antes no
// se parseaba: una edición que cambiara `.dark` y olvidara espejar el @media no
// la cazaba nada. Que es exactamente la deriva contra la que existe este test.
describe("contraste de las clases de MARK_ACCENT", () => {
  // Vitest corre con environment: "node" en este repo (vitest.config.ts), así
  // que node:fs está disponible.
  const globalsCss = readFileSync("src/app/globals.css", "utf8");

  /**
   * Recorta el bloque `{ ... }` que sigue a `selector`, CONTANDO LLAVES. El
   * recorte anterior buscaba el primer "\n}" y por eso no podía entrar en el
   * `@media`, cuyo bloque interno cierra indentado ("\n  }") y cuyo bloque
   * externo contiene otro anidado.
   */
  function extraerBloque(css: string, selector: RegExp): string {
    const inicio = selector.exec(css);
    if (!inicio) {
      throw new Error(`No se encontró el selector ${selector} en globals.css`);
    }
    // `selector` incluye la llave de apertura: se empieza a contar en 1.
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

  // Bloque claro: la primera declaración `:root {` (el patrón exige la llave
  // pegada, así que no casa con el ":root:not(.light):not(.dark)" del @media).
  const tokensClaro = extraerTokens(extraerBloque(globalsCss, /:root\s*\{/));
  // Oscuro manual: el que impone el interruptor del tema.
  const tokensOscuroManual = extraerTokens(extraerBloque(globalsCss, /\.dark\s*\{/));
  // Oscuro por preferencia del sistema: el DEFECTO de quien no ha tocado el
  // interruptor. Se extrae el @media entero y de ahí su :root anidado.
  const bloqueMedia = extraerBloque(
    globalsCss,
    /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/,
  );
  const tokensOscuroSistema = extraerTokens(
    extraerBloque(bloqueMedia, /:root:not\(\.light\):not\(\.dark\)\s*\{/),
  );

  const TEMAS = [
    ["claro", tokensClaro],
    ["oscuro (.dark)", tokensOscuroManual],
    ["oscuro (@media prefers-color-scheme)", tokensOscuroSistema],
  ] as const;

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

  /**
   * El color que se VE cuando se pinta `bg-<token>/10` sobre --surface. La
   * composición va en sRGB, canal a canal y a 8 bits, que es lo que hace el
   * compositor del navegador con el resultado de `color-mix(..., transparent)`
   * que genera el modificador de opacidad de Tailwind v4.
   */
  function componer(token: string, fondo: string, alfa = 0.1): string {
    const canal = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
    let salida = "#";
    for (let i = 1; i < 7; i += 2) {
      const v = Math.round(alfa * canal(token, i) + (1 - alfa) * canal(fondo, i));
      salida += v.toString(16).padStart(2, "0");
    }
    return salida;
  }

  /** "bg-event-meetup" / "text-event-meetup" -> "event-meetup" (sin prefijo ni `/NN`). */
  function nombreDeToken(clase: string): string {
    return clase.replace(/^(bg|text|border)-/, "").split("/")[0];
  }

  function valorDelToken(tokens: Record<string, string>, nombre: string, tema: string): string {
    const color = tokens[nombre];
    expect(color, `--${nombre} no aparece en el bloque de tema "${tema}" de globals.css`).toBeDefined();
    return color as string;
  }

  const UMBRAL_OBJETO_GRAFICO = 3;
  const UMBRAL_TEXTO = 4.5;

  const TODAS_LAS_CLAVES = Object.keys(MARK_ACCENT) as MarkAccentKey[];

  // ── Exclusiones. Ninguna es muda: cada una lleva su motivo y su issue. ──
  //
  // `cierre` usa --gold, que da 2.89:1 contra --surface en tema claro. Falla
  // desde ANTES de esta rama y no se corrige aquí: oscurecer --gold pide
  // revisar su blast radius fuera del calendario (--gold-ink existe justo por
  // eso, para texto sobre tinte dorado). Issue #577.
  const EXCLUIDAS_OBJETO_GRAFICO = new Set<MarkAccentKey>(["cierre"]);

  // Para el umbral de TEXTO se excluyen las claves que apuntan a un token
  // COMPARTIDO con el resto de la app, que no se puede mover sin restilar media
  // aplicación -- a diferencia de --event-meetup y --event-highlight, que solo
  // consume MARK_ACCENT y por eso sí se ajustaron hasta pasar:
  //   - `cierre` -> --gold, 2.64:1 en claro. Issue #577.
  //   - `hito`   -> --accent (el terracota de marca), 4.35:1 en claro. Issue #586.
  // Los `type-*` de lanzamiento NO se excluyen: pasan, aunque type-book quede
  // al filo (4.51:1 en claro). Si algún día dejaran de pasar, la salida es la
  // misma que la de #586 (un token `-ink` para texto), no relajar el umbral.
  const EXCLUIDAS_TEXTO_TOKEN_COMPARTIDO = new Set<MarkAccentKey>(["cierre", "hito"]);

  // El espejo del @media es un invariante por sí mismo, aparte del contraste:
  // si alguien cambia `.dark` y olvida el @media, el tema oscuro por defecto
  // del sistema se queda con el valor viejo y NINGUNA aserción de contraste lo
  // notaría (ambos bloques pasarían, cada uno con su color).
  it("el @media (prefers-color-scheme: dark) espeja .dark token a token", () => {
    const nombres = new Set(
      TODAS_LAS_CLAVES.flatMap((clave) => [
        nombreDeToken(MARK_ACCENT[clave].bar),
        nombreDeToken(MARK_ACCENT[clave].text),
      ]).concat("surface"),
    );
    for (const nombre of nombres) {
      expect(
        tokensOscuroSistema[nombre],
        `--${nombre} difiere entre .dark y el @media prefers-color-scheme`,
      ).toBe(tokensOscuroManual[nombre]);
    }
  });

  describe.each(TEMAS)("tema %s", (tema, tokens) => {
    // Objeto gráfico (WCAG 1.4.1): el punto del chip y la muestra de leyenda,
    // que van en `bar`, sobre el --surface de la tarjeta.
    const clavesGrafico = TODAS_LAS_CLAVES.filter((c) => !EXCLUIDAS_OBJETO_GRAFICO.has(c));
    it.each(clavesGrafico)("%s: `bar` pasa 3:1 contra --surface", (clave) => {
      const color = valorDelToken(tokens, nombreDeToken(MARK_ACCENT[clave].bar), tema);
      const surface = valorDelToken(tokens, "surface", tema);
      expect(contraste(color, surface)).toBeGreaterThanOrEqual(UMBRAL_OBJETO_GRAFICO);
    });

    // Texto (WCAG 1.4.3): la etiqueta del chip de agenda-list.tsx y el
    // subtítulo de la tira "Próximo" de club-summary.tsx, ambos con `text`
    // sobre `bgSoft` -- el MISMO token al 10% compuesto sobre --surface, no
    // sobre --surface a secas. Medirlo contra --surface daría un número mejor
    // que el real y volvería a dejar pasar el fallo.
    const clavesTexto = TODAS_LAS_CLAVES.filter((c) => !EXCLUIDAS_TEXTO_TOKEN_COMPARTIDO.has(c));
    it.each(clavesTexto)("%s: `text` pasa 4.5:1 contra su propio `bgSoft`", (clave) => {
      const accent = MARK_ACCENT[clave];
      // El token de `text` y el de `bgSoft` son el mismo por construcción, pero
      // se leen por separado: si alguien los desparea, el test debe medir lo
      // que se pinta de verdad, no lo que suponemos.
      const colorTexto = valorDelToken(tokens, nombreDeToken(accent.text), tema);
      const colorTinte = valorDelToken(tokens, nombreDeToken(accent.bgSoft), tema);
      const surface = valorDelToken(tokens, "surface", tema);
      const tinte = componer(colorTinte, surface);
      expect(contraste(colorTexto, tinte)).toBeGreaterThanOrEqual(UMBRAL_TEXTO);
    });
  });
});

