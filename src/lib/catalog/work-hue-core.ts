// Tono de una obra a partir de los píxeles de su portada (spec 2026-11-09). Puro.

const BINS = 24;
const BIN_DEG = 360 / BINS;
// Media de croma sobre TODOS los píxeles por debajo de la cual no hay color
// fiable. Medido: El silencio de los corderos 0,0156; Juego de tronos 0,0004.
const MIN_COLORFUL = 0.01;

const linear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

function toOklch(r8: number, g8: number, b8: number) {
  const r = linear(r8), g = linear(g8), b = linear(b8);
  const l = Math.cbrt(0.4122 * r + 0.5363 * g + 0.0514 * b);
  const m = Math.cbrt(0.2119 * r + 0.6807 * g + 0.1074 * b);
  const s = Math.cbrt(0.0883 * r + 0.2817 * g + 0.63 * b);
  const A = 1.9779 * l - 2.4286 * m + 0.4506 * s;
  const B = 0.0259 * l + 0.7828 * m - 0.8087 * s;
  return {
    L: 0.2104 * l + 0.7936 * m - 0.004 * s,
    C: Math.hypot(A, B),
    H: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360,
  };
}

// Histograma de tonos ponderado por C², descartando sombras, luces y grises.
// Devuelve el centro del tramo mayor, o null si la portada no tiene color.
export function hueFromPixels(data: Uint8Array | Buffer): number | null {
  const bins = new Array<number>(BINS).fill(0);
  const pixels = Math.floor(data.length / 3);
  if (pixels === 0) return null;
  let chromaSum = 0;
  for (let i = 0; i + 2 < data.length; i += 3) {
    const { L, C, H } = toOklch(data[i], data[i + 1], data[i + 2]);
    if (L < 0.12 || L > 0.95 || C < 0.03) continue;
    bins[Math.min(BINS - 1, Math.floor(H / BIN_DEG))] += C * C;
    chromaSum += C;
  }
  if (chromaSum / pixels < MIN_COLORFUL) return null;
  let best = 0;
  bins.forEach((v, i) => { if (v > bins[best]) best = i; });
  return best * BIN_DEG + BIN_DEG / 2;
}

// Tono de respaldo: siempre el mismo para la misma obra.
export function hashTitleHue(title: string): number {
  const text = title.trim().toLowerCase().normalize("NFC");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 360;
}
