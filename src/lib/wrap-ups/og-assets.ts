import "server-only";
// Recursos de la imagen 9:16 (spec 2026-10-06 §5): fuentes empaquetadas, sprites
// recortados al primer frame y portadas. TODO sale del disco salvo las portadas,
// que son externas: `fetch` con 3 s de tiempo y, si falla, `null` (la imagen
// pinta la carta con el título, nunca un hueco).
//
// Los sprites se recortan y escalan AQUÍ con `sharp` (vecino más cercano): Satori
// no recorta un strip con `background-position` de forma fiable y Resvg escala
// las <img> con filtro suave, que emborrona el píxel. Se entregan ya a su tamaño
// final, así que Satori los pinta 1:1.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { acornEntry, sheetEntry } from "@/lib/pet/manifest";
import { narratorSheet } from "./narrator";
import { COVER_CARD, type WrapUpImageAssets } from "./og-image";
import type { ItemRef, NarratorVariant, OwnPet, ShareSummary } from "./types";

const ASSETS = join(process.cwd(), "src/lib/wrap-ups/assets");
const PUBLIC = join(process.cwd(), "public");

export type WrapUpFonts = { pixel: ArrayBuffer; semibold: ArrayBuffer; bold: ArrayBuffer };

const toArrayBuffer = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

// Las fuentes no dependen de la petición: una lectura por instancia.
let fontsPromise: Promise<WrapUpFonts> | null = null;
export function loadFonts(): Promise<WrapUpFonts> {
  fontsPromise ??= Promise.all(
    ["Tiny5-Regular.ttf", "Geist-SemiBold.ttf", "Geist-Bold.ttf"].map((f) => readFile(join(ASSETS, f))),
  ).then(([pixel, semibold, bold]) => ({ pixel: toArrayBuffer(pixel), semibold: toArrayBuffer(semibold), bold: toArrayBuffer(bold) }))
    .catch((e) => { fontsPromise = null; throw e; });
  return fontsPromise;
}

export type Sprite = { src: string; width: number; height: number };

/**
 * Primer frame de una celda del sheet, sin el relleno transparente de la celda
 * (30-40 % en PixelLab) y escalado por un ENTERO —el mayor que cabe en `target`
 * px— con vecino más cercano: cada píxel del sprite queda como un bloque igual.
 */
async function spriteFrame(file: string, top: number, cell: number, target: number): Promise<Sprite> {
  const frame = await sharp(file).extract({ left: 0, top, width: cell, height: cell }).png().toBuffer();
  const { data, info } = await sharp(frame).trim().png().toBuffer({ resolveWithObject: true });
  const scale = Math.max(1, Math.floor(target / Math.max(info.width, info.height)));
  const width = info.width * scale;
  const height = info.height * scale;
  const png = await sharp(data).resize(width, height, { kernel: "nearest" }).png().toBuffer();
  return { src: `data:image/png;base64,${png.toString("base64")}`, width, height };
}

/** Lado máximo (px) de los sprites en la imagen de 1080 de ancho. */
export const NARRATOR_TARGET = 230;
export const PET_TARGET = 210;

export async function narratorPng(v: NarratorVariant): Promise<Sprite> {
  const { cell } = narratorSheet(v);
  return spriteFrame(join(PUBLIC, "pet/wrap-ups/narrator", `${v}.png`), 0, cell, NARRATOR_TARGET);
}

export async function petPng(pet: OwnPet | null): Promise<Sprite | null> {
  if (!pet) return null;
  try {
    const entry = pet.stage === "acorn" ? acornEntry() : sheetEntry(pet.stage, pet.petClass);
    const file = pet.stage === "acorn"
      ? join(PUBLIC, "pet/sheets/acorn.png")
      : join(PUBLIC, "pet/sheets", pet.stage, `${pet.petClass}.png`);
    return await spriteFrame(file, entry.anims.idle.row * entry.cell, entry.cell, PET_TARGET);
  } catch {
    // Un sheet que falta no tumba la imagen: la ardilla es opcional.
    return null;
  }
}

// Orígenes de portada válidos: los de images.remotePatterns de next.config.ts,
// pero Supabase SOLO con el host de ESTE proyecto (un `*.supabase.co` aceptaría
// el bucket público de cualquiera). El servidor no pide URLs arbitrarias que el
// usuario haya podido guardar (SSRF), ni tampoco a donde le redirijan: cada salto
// se vuelve a validar. OpenLibrary redirige SIEMPRE (comprobado con curl,
// 2026-10-06): covers.openlibrary.org → archive.org/download/… → iaNNNNNN.us.archive.org
// (nodo de datos del Internet Archive); por eso esos dos, y solo esos.
const COVER_HOSTS = [/^books\.google\.com$/, /^books\.googleusercontent\.com$/, /^image\.tmdb\.org$/,
  /^covers\.openlibrary\.org$/, /^archive\.org$/, /^ia\d+\.us\.archive\.org$/];
const MAX_COVER_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 3;
export const COVER_TIMEOUT_MS = 3000;

function ownSupabaseHost(): string | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname || null;
  } catch {
    return null;
  }
}

export function isAllowedCoverUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return u.hostname === ownSupabaseHost() || COVER_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

/** Portada recortada a `w`×`h` como data URI JPEG, o `null` si no hay, no se permite o falla. */
export async function coverJpeg(item: ItemRef, w: number, h: number, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!item.coverUrl || !isAllowedCoverUrl(item.coverUrl)) return null;
  try {
    // Un solo plazo para toda la cadena de saltos.
    const signal = AbortSignal.timeout(COVER_TIMEOUT_MS);
    let url = item.coverUrl;
    let res = await fetchImpl(url, { signal, redirect: "manual" });
    for (let hop = 0; res.status >= 300 && res.status < 400; hop++) {
      const location = res.headers.get("location");
      if (hop >= MAX_REDIRECTS || !location) return null;
      url = new URL(location, url).toString();
      if (!isAllowedCoverUrl(url)) return null;
      res = await fetchImpl(url, { signal, redirect: "manual" });
    }
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_COVER_BYTES) return null;
    // sharp normaliza cualquier formato (Satori no lee WebP) y lo deja al tamaño de la carta.
    const jpg = await sharp(buf).resize(w, h, { fit: "cover" }).jpeg({ quality: 85 }).toBuffer();
    return `data:image/jpeg;base64,${jpg.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Todo lo que necesita `wrapUpImage`, en paralelo. Las portadas nunca lanzan. */
export async function loadWrapUpImageAssets(summary: ShareSummary): Promise<WrapUpImageAssets> {
  const [fonts, narrator, pet, covers] = await Promise.all([
    loadFonts(),
    narratorPng(summary.narrator),
    petPng(summary.pet),
    Promise.all(summary.covers.slice(0, 4).map((c) => coverJpeg(c, COVER_CARD.width, COVER_CARD.height))),
  ]);
  return { fonts, narrator, pet, covers };
}
