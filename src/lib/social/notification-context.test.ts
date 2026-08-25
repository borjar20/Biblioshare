import { describe, expect, it } from "vitest";
import {
  buildExcerpt,
  buildSubject,
  commentContext,
  EXCERPT_MAX_CHARS,
  SUBJECT_MAX_CHARS,
} from "./notification-context";

describe("buildExcerpt", () => {
  it("deja intacto lo que ya es corto", () => {
    expect(buildExcerpt("Lo terminé anoche")).toBe("Lo terminé anoche");
  });

  it("recorta por palabras y remata con puntos suspensivos", () => {
    const largo = "palabra ".repeat(40).trim();
    const corto = buildExcerpt(largo);
    expect(corto.length).toBeLessThanOrEqual(EXCERPT_MAX_CHARS + 1);
    expect(corto.endsWith("…")).toBe(true);
    // No parte una palabra por la mitad.
    expect(corto.slice(0, -1).trim().endsWith("palabra")).toBe(true);
  });

  // El caso que se rompe con slice() a pelo: un emoji ocupa varias unidades de
  // código, y cortar por el medio deja medio carácter roto en pantalla.
  //
  // OJO con cómo se afirma esto. Comprobar `not.toContain("\uD83D")` es un test
  // MAL ESCRITO que suspende al código correcto: 👨‍👩‍👧 está formado por pares
  // suplentes, y el primero de 👨 (U+1F468) ES \uD83D — o sea, un emoji bien
  // conservado contiene esa unidad. Lo que hay que afirmar es que el emoji
  // sobrevive ENTERO y que no queda ningún suplente suelto.
  it("no parte un emoji al recortar", () => {
    const conEmoji = `${"a".repeat(EXCERPT_MAX_CHARS - 1)}👨‍👩‍👧 final`;
    const corto = buildExcerpt(conEmoji);
    expect(corto).toContain("👨‍👩‍👧");
    // Un suplente alto sin su pareja, o una baja sin la suya: eso es un corte
    // por el medio.
    const suplenteSuelto = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    expect(suplenteSuelto.test(corto)).toBe(false);
  });

  it("colapsa saltos de línea y espacios repetidos", () => {
    expect(buildExcerpt("uno\n\n  dos   tres")).toBe("uno dos tres");
  });

  it("de un cuerpo vacío o solo espacios saca cadena vacía", () => {
    expect(buildExcerpt("")).toBe("");
    expect(buildExcerpt("   \n  ")).toBe("");
  });
});

describe("buildSubject", () => {
  it("deja intacto un título corto", () => {
    expect(buildSubject("Dune")).toBe("Dune");
  });

  it("tiene un tope más corto que el del excerpt", () => {
    expect(SUBJECT_MAX_CHARS).toBeLessThan(EXCERPT_MAX_CHARS);
  });

  // El caso real de dev: un books.title de 166 caracteres. No hipotético (ver
  // issue de la revisión final) -- el título de una obra se pinta entero en
  // la campana y en el cuerpo del push si no se acota al escribir.
  it("recorta un título largo sin partir palabras, por grafemas", () => {
    const largo = "palabra ".repeat(30).trim(); // 30 * 8 - 1 = 239 caracteres
    const corto = buildSubject(largo);
    expect(corto.length).toBeLessThanOrEqual(SUBJECT_MAX_CHARS + 1);
    expect(corto.endsWith("…")).toBe(true);
    expect(corto.slice(0, -1).trim().endsWith("palabra")).toBe(true);
  });

  it("no parte un emoji al recortar", () => {
    const conEmoji = `${"a".repeat(SUBJECT_MAX_CHARS - 1)}👨‍👩‍👧 final`;
    const corto = buildSubject(conEmoji);
    expect(corto).toContain("👨‍👩‍👧");
  });

  it("de un título vacío o solo espacios saca cadena vacía", () => {
    expect(buildSubject("")).toBe("");
    expect(buildSubject("   \n  ")).toBe("");
  });
});

describe("commentContext", () => {
  it("de un comentario normal saca el extracto", () => {
    expect(commentContext("Lo terminé anoche", false)).toEqual({
      excerpt: "Lo terminé anoche",
    });
  });

  // Regla dura del spec: el texto de un spoiler NO se guarda. Si se guardara,
  // se escaparía luego por el push, por una exportación o por un lector nuevo.
  it("de un spoiler NO saca extracto, solo la marca", () => {
    expect(commentContext("Muere el protagonista", true)).toEqual({ spoiler: true });
  });

  it("de un cuerpo vacío saca un contexto vacío, no un extracto vacío", () => {
    expect(commentContext("   ", false)).toEqual({});
  });
});
