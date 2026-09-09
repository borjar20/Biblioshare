// PRNG del combate (Parte I §16.1): xoshiro128** sembrado con 128 bits. Sin
// Math.random en ningún sitio del motor. Cada tirada tiene un orden documentado
// (contrato C2): añadir una exige subir RULESET.version.

export interface PrngState {
  /** Cuatro palabras uint32; nunca las cuatro a cero. */
  s: [number, number, number, number];
}

const SEED_RE = /^[0-9a-f]{32}$/;

export function isSeed(x: unknown): x is string {
  return typeof x === "string" && SEED_RE.test(x);
}

/** 32 hex → estado (big-endian por palabra). Lanza INVALID_SEED si no es hex o es todo ceros. */
export function seedFromHex(seed: string): PrngState {
  if (!isSeed(seed)) throw new Error("INVALID_SEED");
  const s = [0, 1, 2, 3].map((i) => parseInt(seed.slice(i * 8, i * 8 + 8), 16) >>> 0) as [
    number,
    number,
    number,
    number,
  ];
  if (s.every((w) => w === 0)) throw new Error("INVALID_SEED");
  return { s };
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** Referencia (Blackman & Vigna): result = rotl(s1·5, 7)·9; t = s1 << 9;
 *  s2 ^= s0; s3 ^= s1; s1 ^= s2; s0 ^= s3; s2 ^= t; s3 = rotl(s3, 11). */
export function nextU32(st: PrngState): number {
  const s = st.s;
  const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
  const t = (s[1] << 9) >>> 0;
  s[2] = (s[2] ^ s[0]) >>> 0;
  s[3] = (s[3] ^ s[1]) >>> 0;
  s[1] = (s[1] ^ s[2]) >>> 0;
  s[0] = (s[0] ^ s[3]) >>> 0;
  s[2] = (s[2] ^ t) >>> 0;
  s[3] = rotl(s[3], 11);
  return result;
}

/** Entero en [lo, hi], ambos incluidos. Módulo directo a propósito: el sesgo es
 *  despreciable con rangos < 2^16 y la simplicidad es parte del contrato. */
export function nextInt(st: PrngState, lo: number, hi: number): number {
  return lo + (nextU32(st) % (hi - lo + 1));
}

/** Puntos básicos 0..9999, para comparar con probabilidades enteras. */
export function nextBp(st: PrngState): number {
  return nextU32(st) % 10_000;
}

function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

/** Sub-flujo derivado de (seed, etiqueta, tick): mismo triple → misma secuencia,
 *  independiente del flujo principal. Para instancias de minijuego (§16.3). */
export function subStream(seed: string, label: string, tick: number): PrngState {
  const base = seedFromHex(seed).s;
  const mix = splitmix32((fnv1a32(label) ^ (tick >>> 0)) >>> 0);
  const s = base.map((w) => (w ^ mix()) >>> 0) as [number, number, number, number];
  if (s.every((w) => w === 0)) s[0] = 1;
  return { s };
}

/** Seeds reproducibles para tests y calibración: el i-ésimo siempre es el mismo. */
export function seedFromIndex(i: number): string {
  const mix = splitmix32(i >>> 0);
  let hex = "";
  for (let k = 0; k < 4; k++) hex += mix().toString(16).padStart(8, "0");
  return hex === "0".repeat(32) ? seedFromIndex(i + 1) : hex;
}
