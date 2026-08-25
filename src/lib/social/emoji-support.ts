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

/** Caché a nivel de módulo: cada emoji se mide como mucho una vez. */
const supportCache = new Map<string, boolean>();

/**
 * Caché de la firma de referencia (el tofu), por medidor. Con `WeakMap` no
 * hace falta limpiarla a mano y no interfiere entre el medidor por defecto y
 * los medidores inyectados en tests.
 */
const referenceSignatureCache = new WeakMap<GlyphMeasurer, string | null>();

function getReferenceSignature(measure: GlyphMeasurer): string | null {
  if (referenceSignatureCache.has(measure)) {
    return referenceSignatureCache.get(measure) ?? null;
  }
  const signature = measure(UNASSIGNED_REFERENCE_CHAR);
  referenceSignatureCache.set(measure, signature);
  return signature;
}

/**
 * ¿Este dispositivo pinta `emoji` de verdad, o cae a tofu?
 *
 * Degrada a `true` (se considera soportado) siempre que no se pueda decidir:
 * sin canvas, sin contexto 2D, o sin firma de referencia. Es preferible
 * enseñar un emoji de más (en el peor caso, un tofu suelto) que vaciar el
 * selector entero por un fallo de detección.
 */
export function isEmojiSupported(
  emoji: string,
  measure: GlyphMeasurer = defaultGlyphMeasurer,
): boolean {
  const cached = supportCache.get(emoji);
  if (cached !== undefined) return cached;

  const glyphSignature = measure(emoji);
  let supported: boolean;
  if (glyphSignature === null) {
    // No se pudo medir: no hay forma de saber si es tofu, así que no se filtra.
    supported = true;
  } else {
    const referenceSignature = getReferenceSignature(measure);
    // Si tampoco se pudo obtener la referencia, no hay con qué comparar.
    supported = referenceSignature === null || glyphSignature !== referenceSignature;
  }

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
