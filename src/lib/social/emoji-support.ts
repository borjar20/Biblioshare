// Detección de soporte real de un emoji EN ESTE DISPOSITIVO.
//
// Por qué existe: el catálogo trae Unicode 16.0 entero (emoji-catalog.data.ts),
// pero la fuente de emoji del sistema puede ir por detrás (p.ej. Segoe UI Emoji
// en Windows 10 llega sobre Unicode 13.1). Lo que la fuente no sabe pintar sale
// como "tofu" (un cuadradito) o un glifo genérico. La decisión es NO recortar
// el catálogo por versión: se filtra en el cliente, según lo que ESE navegador
// pueda pintar de verdad — en Android moderno los mismos emojis se ven bien.
//
// Técnica: dibujar el glifo en un <canvas> y comparar los píxeles resultantes
// con los de un carácter que con certeza no existe en ninguna fuente (un
// "noncharacter" Unicode, reservado para siempre sin asignar). Si coinciden
// píxel a píxel, es que el sistema pintó el mismo tofu para ambos: no soporta
// el emoji. Comparar solo el ANCHO del texto no vale — todos los tofu miden
// igual entre sí, y también miden igual muchos emojis distintos que sí están
// soportados (mismo ancho, glifo distinto).
//
// Excepción: las secuencias ZWJ (U+200D) rotas NO son tofu. Cuando el sistema
// no sabe fusionar las piezas de una secuencia (p. ej. "cara" + ZWJ + "entre
// las nubes"), SÍ dibuja algo — cada pieza por separado, una detrás de otra —
// así que la comparación de píxeles contra el tofu las deja pasar: se ven
// distintas del tofu, luego "soportadas". Lo que las delata es el ANCHO: una
// secuencia fusionada correctamente mide lo mismo que cualquier otro emoji de
// una pieza; una rota mide aproximadamente la suma de sus piezas. Por eso
// estas dos técnicas conviven: píxeles para "¿se dibujó algo?", ancho para
// "¿se dibujó FUNDIDO?" — y cada una se aplica solo donde tiene sentido (ver
// `isEmojiSupported`).

/**
 * Dibuja `text` y devuelve una firma de los píxeles resultantes, o `null` si
 * no se pudo medir (sin canvas, sin contexto 2D...). Inyectable para poder
 * testear la lógica de caché y filtrado sin un canvas real (Vitest no trae
 * uno). La implementación por defecto, más abajo, es la que usa canvas.
 */
export type GlyphMeasurer = (text: string) => string | null;

// U+10FFFF es el último punto de código del espacio Unicode: un "noncharacter"
// reservado que la especificación garantiza que NUNCA se asignará a un
// carácter. Ninguna fuente del mundo puede tener un glifo legítimo para él,
// así que sirve como referencia fija de "esto es tofu".
export const UNASSIGNED_REFERENCE_CHAR = String.fromCodePoint(0x10ffff);

const CANVAS_SIZE = 24;

let cachedContext: CanvasRenderingContext2D | null | undefined;

/** Crea el canvas de medida una sola vez, de forma perezosa. */
function getMeasuringContext(): CanvasRenderingContext2D | null {
  if (cachedContext !== undefined) return cachedContext;
  try {
    if (typeof document === "undefined") {
      cachedContext = null;
      return cachedContext;
    }
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    cachedContext = canvas.getContext("2d");
  } catch {
    cachedContext = null;
  }
  return cachedContext;
}

/**
 * Medidor por defecto: pinta `text` centrado en el canvas compartido y
 * devuelve los píxeles como firma (string). Si no hay canvas o contexto 2D
 * disponible, devuelve `null` — quien llama debe degradar a "soportado".
 */
export const defaultGlyphMeasurer: GlyphMeasurer = (text) => {
  const ctx = getMeasuringContext();
  if (!ctx) return null;
  try {
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.font = `${Math.floor(CANVAS_SIZE * 0.75)}px sans-serif`;
    ctx.fillText(text, CANVAS_SIZE / 2, CANVAS_SIZE / 2);
    const { data } = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    // Firma exacta (no un hash con riesgo de colisión): con un canvas de 24×24
    // son solo ~2.300 números, y esto se ejecuta una vez por emoji gracias a
    // la caché de abajo — no por cada render.
    return Array.from(data).join(",");
  } catch {
    return null;
  }
};

/**
 * Mide el ancho renderizado de `text`, o `null` si no se pudo medir. Igual
 * que `GlyphMeasurer`, inyectable para testear sin canvas real.
 */
export type WidthMeasurer = (text: string) => number | null;

const ZERO_WIDTH_JOINER = "‍";

// Referencia de ancho: un emoji simple, sin ZWJ, presente en cualquier fuente
// de emoji medianamente moderna (cara sonriente, Unicode 6.1 — anterior
// incluso a Windows 8.1). Sirve para saber cuánto mide UN glifo de emoji "de
// una pieza" en esta fuente, sea cual sea.
export const WIDTH_REFERENCE_CHAR = "😀";

// Umbral: 1.5× el ancho de referencia. Las fuentes de emoji color dan a cada
// glifo — simple o secuencia ZWJ fusionada, da igual cuántas piezas lleve
// dentro — un avance fijo (es cómo funciona la sustitución de glifos de esas
// fuentes), así que una secuencia bien fusionada mide ~1×. Si el sistema NO
// fusiona, dibuja las piezas por separado y el ancho es ~la SUMA de esas
// piezas: el caso roto más pequeño que nos interesa (cara + ZWJ + un símbolo,
// como las cuatro reportadas) ya son dos piezas, así que arranca en ~2×.
// 1.5 cae limpio a medio camino: dejar el umbral cerca de 1 (p. ej. 1.1)
// tumbaría secuencias legítimas por el ruido normal de métricas de fuente
// (kerning, redondeo de subpíxel); dejarlo cerca de 2 (p. ej. 1.9) dejaría
// pasar estas cuatro si el sistema las funde a medias. Y no hace falta acertar
// el número exacto de piezas rotas: una familia de cuatro personas rota
// mediría ~4×, muy por encima igualmente.
const ZWJ_WIDTH_THRESHOLD = 1.5;

/**
 * Medidor de ancho por defecto: usa el mismo canvas compartido que
 * `defaultGlyphMeasurer`. Si no hay canvas o contexto 2D, devuelve `null`.
 */
export const defaultWidthMeasurer: WidthMeasurer = (text) => {
  const ctx = getMeasuringContext();
  if (!ctx) return null;
  try {
    ctx.font = `${Math.floor(CANVAS_SIZE * 0.75)}px sans-serif`;
    return ctx.measureText(text).width;
  } catch {
    return null;
  }
};

/** Caché a nivel de módulo: cada emoji se mide como mucho una vez. */
const supportCache = new Map<string, boolean>();

/**
 * Caché de la firma de referencia (el tofu) y del ancho de referencia, por
 * medidor. Con `WeakMap` no hace falta limpiarla a mano y no interfiere entre
 * el medidor por defecto y los medidores inyectados en tests.
 */
const referenceSignatureCache = new WeakMap<GlyphMeasurer, string | null>();
const referenceWidthCache = new WeakMap<WidthMeasurer, number | null>();

function getReferenceSignature(measure: GlyphMeasurer): string | null {
  if (referenceSignatureCache.has(measure)) {
    return referenceSignatureCache.get(measure) ?? null;
  }
  const signature = measure(UNASSIGNED_REFERENCE_CHAR);
  referenceSignatureCache.set(measure, signature);
  return signature;
}

function getReferenceWidth(measureWidth: WidthMeasurer): number | null {
  if (referenceWidthCache.has(measureWidth)) {
    return referenceWidthCache.get(measureWidth) ?? null;
  }
  const width = measureWidth(WIDTH_REFERENCE_CHAR);
  referenceWidthCache.set(measureWidth, width);
  return width;
}

/** Rama de píxeles: ¿se dibujó el mismo tofu que la referencia sin asignar? */
function isGlyphPainted(emoji: string, measure: GlyphMeasurer): boolean {
  const glyphSignature = measure(emoji);
  if (glyphSignature === null) {
    // No se pudo medir: no hay forma de saber si es tofu, así que no se filtra.
    return true;
  }
  const referenceSignature = getReferenceSignature(measure);
  // Si tampoco se pudo obtener la referencia, no hay con qué comparar.
  return referenceSignature === null || glyphSignature !== referenceSignature;
}

/** Rama de ancho: ¿se dibujó la secuencia ZWJ fusionada, o pieza a pieza? */
function isZwjSequenceFused(emoji: string, measureWidth: WidthMeasurer): boolean {
  const width = measureWidth(emoji);
  if (width === null) return true; // no se pudo medir: no se filtra.
  const referenceWidth = getReferenceWidth(measureWidth);
  if (referenceWidth === null || referenceWidth <= 0) return true;
  return width <= referenceWidth * ZWJ_WIDTH_THRESHOLD;
}

/**
 * ¿Este dispositivo pinta `emoji` de verdad?
 *
 * Dos técnicas, cada una donde tiene sentido: comparación de píxeles contra
 * un tofu de referencia para la mayoría de emojis (detecta "no se dibujó
 * nada reconocible"), y comparación de ANCHO contra un emoji de una pieza
 * para las secuencias ZWJ (detecta "se dibujó, pero sin fusionar" — un caso
 * que la comparación de píxeles no puede cazar, porque una secuencia rota
 * SÍ pinta algo distinto del tofu).
 *
 * Degrada a `true` (se considera soportado) siempre que no se pueda decidir:
 * sin canvas, sin contexto 2D, o sin referencia. Es preferible enseñar un
 * emoji de más (en el peor caso, un tofu o una secuencia sin fusionar sueltos)
 * que vaciar el selector entero por un fallo de detección.
 */
export function isEmojiSupported(
  emoji: string,
  measure: GlyphMeasurer = defaultGlyphMeasurer,
  measureWidth: WidthMeasurer = defaultWidthMeasurer,
): boolean {
  const cached = supportCache.get(emoji);
  if (cached !== undefined) return cached;

  const supported = emoji.includes(ZERO_WIDTH_JOINER)
    ? isZwjSequenceFused(emoji, measureWidth)
    : isGlyphPainted(emoji, measure);

  supportCache.set(emoji, supported);
  return supported;
}

/**
 * Solo para tests: vacía la caché de soporte para que cada caso empiece
 * limpio, sin depender del orden de ejecución. No se usa en producción.
 */
export function __resetEmojiSupportCacheForTests(): void {
  supportCache.clear();
}
