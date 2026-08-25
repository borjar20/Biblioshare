import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetEmojiSupportCacheForTests,
  isEmojiSupported,
  UNASSIGNED_REFERENCE_CHAR,
  WIDTH_REFERENCE_CHAR,
  type GlyphMeasurer,
  type WidthMeasurer,
} from "./emoji-support";

// Puro: sin canvas real (Vitest no lo trae), el medidor se inyecta. Lo que se
// prueba es la lógica de caché y de comparación, no el canvas del navegador
// (eso no es testeable sin uno de verdad, y no es lo que puede romperse aquí).
describe("isEmojiSupported", () => {
  beforeEach(() => {
    __resetEmojiSupportCacheForTests();
  });

  it("considera soportado un glifo cuya firma difiere de la del tofu", () => {
    const measure: GlyphMeasurer = (text) => (text === "😀" ? "firma-glifo" : "firma-tofu");
    expect(isEmojiSupported("😀", measure)).toBe(true);
  });

  it("considera NO soportado un glifo cuyos píxeles coinciden con los del tofu", () => {
    // Mismo resultado para cualquier texto: como si el sistema pintara el
    // mismo cuadradito tanto para el emoji como para la referencia.
    const measure: GlyphMeasurer = () => "mismos-pixeles-siempre";
    expect(isEmojiSupported("🫠", measure)).toBe(false);
  });

  it("degrada a soportado si el medidor no puede pintar (sin canvas/contexto)", () => {
    const measure: GlyphMeasurer = () => null;
    expect(isEmojiSupported("🫠", measure)).toBe(true);
  });

  it("degrada a soportado si no se puede obtener la firma de referencia del tofu", () => {
    const measure: GlyphMeasurer = (text) => (text === UNASSIGNED_REFERENCE_CHAR ? null : "firma-glifo");
    expect(isEmojiSupported("🎉", measure)).toBe(true);
  });

  it("cachea: el mismo emoji no se mide dos veces", () => {
    let calls = 0;
    const measure: GlyphMeasurer = (text) => {
      calls += 1;
      return text === "🎉" ? "firma-glifo" : "firma-tofu";
    };

    isEmojiSupported("🎉", measure);
    const callsAfterFirst = calls;
    expect(callsAfterFirst).toBeGreaterThan(0);

    isEmojiSupported("🎉", measure);
    expect(calls).toBe(callsAfterFirst);
  });

  it("cachea la firma de referencia del tofu entre emojis distintos", () => {
    let referenceCalls = 0;
    const measure: GlyphMeasurer = (text) => {
      if (text === UNASSIGNED_REFERENCE_CHAR) {
        referenceCalls += 1;
        return "firma-tofu";
      }
      return text === "🎉" ? "firma-a" : "firma-b";
    };

    isEmojiSupported("🎉", measure);
    isEmojiSupported("🎈", measure);

    expect(referenceCalls).toBe(1);
  });

  it("filtra una lista mixta soportados/no soportados", () => {
    // Sin ZWJ a propósito: esta prueba es de la rama de píxeles. La rama de
    // ancho para secuencias ZWJ tiene su propio describe más abajo.
    const unsupported = new Set(["🥲", "🫨"]);
    const measure: GlyphMeasurer = (text) => (unsupported.has(text) ? "tofu" : `glifo-${text}`);
    // La referencia debe devolver "tofu" también, para que la comparación cuadre.
    const measureWithReference: GlyphMeasurer = (text) =>
      text === UNASSIGNED_REFERENCE_CHAR ? "tofu" : measure(text);

    const candidates = ["😀", "🥲", "🎉", "🫨"];
    const supported = candidates.filter((e) => isEmojiSupported(e, measureWithReference));

    expect(supported).toEqual(["😀", "🎉"]);
  });
});

// Secuencias ZWJ (U+200D): el sistema puede DIBUJAR algo para ellas aunque no
// sepa fusionarlas — por eso no pasan por la comparación de píxeles contra el
// tofu (verían algo distinto del tofu y saldrían "soportadas" por error), sino
// por una comparación de ANCHO contra un emoji de referencia de una pieza.
describe("isEmojiSupported — secuencias ZWJ (rama de ancho)", () => {
  beforeEach(() => {
    __resetEmojiSupportCacheForTests();
  });

  it("acepta una secuencia ZWJ cuyo ancho iguala al de un emoji de referencia (fusionada)", () => {
    const widthMeasure: WidthMeasurer = () => 20; // mismo ancho para cualquier texto: una sola pieza.
    // "😶‍🌫️" — cara entre las nubes, una de las cuatro reportadas.
    expect(isEmojiSupported("😶‍🌫️", undefined, widthMeasure)).toBe(true);
  });

  it("rechaza una secuencia ZWJ cuyo ancho dobla al de referencia (piezas sin fusionar)", () => {
    const widthMeasure: WidthMeasurer = (text) => (text === WIDTH_REFERENCE_CHAR ? 20 : 40);
    // "😮‍💨" — cara exhalando, otra de las cuatro reportadas.
    expect(isEmojiSupported("😮‍💨", undefined, widthMeasure)).toBe(false);
  });

  it("degrada a soportada si no se puede medir el ancho", () => {
    const widthMeasure: WidthMeasurer = () => null;
    expect(isEmojiSupported("🙂‍↔️", undefined, widthMeasure)).toBe(true);
  });

  it("un emoji simple (sin ZWJ) no pasa por la rama de ancho", () => {
    let widthCalls = 0;
    const widthMeasure: WidthMeasurer = () => {
      widthCalls += 1;
      return 20;
    };
    const pixelMeasure: GlyphMeasurer = (text) => (text === "😀" ? "firma-glifo" : "firma-tofu");

    expect(isEmojiSupported("😀", pixelMeasure, widthMeasure)).toBe(true);
    expect(widthCalls).toBe(0);
  });
});
