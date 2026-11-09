import "server-only";
import { cacheLife } from "next/cache";
import { after } from "next/server";
import sharp from "sharp";
import { hashTitleHue, hueFromPixels } from "./work-hue-core";

// Límite de la descarga, no de la ficha (eso es REQUEST_BUDGET_MS): OpenLibrary
// tarda ~2,1 s con sus redirecciones, así que con 2 s fallaba siempre.
const TIMEOUT_MS = 5000;
// El mismo tope que `uploadCover` (edit-actions.ts): una portada subida a Storage
// que pasó ese límite nunca se rechaza aquí.
const MAX_BYTES = 2 * 1024 * 1024;
// Un JPEG/PNG pequeño en bytes puede declarar dimensiones enormes y reventar la
// memoria al decodificarse. Ninguna portada real se acerca a 16 Mpx.
const MAX_INPUT_PIXELS = 16_000_000;
const MAX_REDIRECTS = 3;
// Lo más que un fallo de caché puede retener la ficha: medido, TMDB tarda
// 40–270 ms y OpenLibrary 1–2,2 s, que se queda fuera y entra en la siguiente visita.
const REQUEST_BUDGET_MS = 800;
// Next deja al `set` de la caché fuera de `waitUntil` cuando el valor se genera
// dentro de un <Suspense> (`executeRevalidates` lee las escrituras pendientes al
// emitir el shell). Sin este margen, Vercel podría congelar la función entre el
// final de la extracción y el final de la escritura remota.
const CACHE_WRITE_GRACE_MS = 500;

// Solo los orígenes de images.remotePatterns: la URL sale del catálogo y el
// servidor no debe descargar de cualquier sitio.
function isAllowedCover(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  if (["image.tmdb.org", "covers.openlibrary.org", "books.google.com", "books.googleusercontent.com"].includes(url.hostname)) {
    return true;
  }
  return url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/storage/v1/object/public/");
}

function isAllowedCoverUrl(coverUrl: string): boolean {
  try {
    return isAllowedCover(new URL(coverUrl));
  } catch {
    return false;
  }
}

// OpenLibrary responde 302 a archive.org y este a un nodo `iaNNN.us.archive.org`
// (comprobado con covers.openlibrary.org/b/id/10724357-S.jpg). Solo se admite
// como destino de una redirección, nunca como origen de una portada.
function isAllowedRedirect(url: URL): boolean {
  return (
    isAllowedCover(url) ||
    (url.protocol === "https:" && (url.hostname === "archive.org" || url.hostname.endsWith(".archive.org")))
  );
}

export function smallCoverUrl(coverUrl: string): string {
  return coverUrl
    .replace(/^(https:\/\/image\.tmdb\.org\/t\/p\/)w\d+\//, "$1w92/")
    .replace(/^(https:\/\/covers\.openlibrary\.org\/[ab]\/id\/\d+)-[SML]\.jpg$/, "$1-S.jpg");
}

// Redirecciones a mano: cada salto se valida ANTES de pedirlo.
async function fetchCover(startUrl: string): Promise<Response> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let target = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(target, { signal, redirect: "manual" });
    if (res.status < 300 || res.status >= 400) return res;
    await res.body?.cancel();
    const location = res.headers.get("location");
    if (!location) throw new Error(`getWorkHue: redirección sin destino (HTTP ${res.status})`);
    const next = new URL(location, target);
    if (!isAllowedRedirect(next)) throw new Error(`getWorkHue: redirección no permitida a ${next.hostname}`);
    target = next.href;
  }
  throw new Error("getWorkHue: demasiadas redirecciones");
}

async function extractHue(coverUrl: string): Promise<number | null> {
  if (!isAllowedCoverUrl(coverUrl)) throw new Error("getWorkHue: origen no permitido");

  const res = await fetchCover(smallCoverUrl(coverUrl));
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`getWorkHue: HTTP ${res.status}`);
  }
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) {
    await res.body?.cancel();
    throw new Error("getWorkHue: imagen demasiado grande");
  }
  const input = Buffer.from(await res.arrayBuffer());
  if (input.length > MAX_BYTES) throw new Error("getWorkHue: imagen demasiado grande");

  const pixels = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize(24, 36, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();
  return hueFromPixels(pixels);
}

// El tono depende solo de la imagen: igual para un anónimo, el dueño y un tercero
// (regla #437). Un argumento escalar, sin Supabase, cookies ni headers.
//
// `use cache: remote` y no `use cache`: las fichas leen sesión y el tono se pide en
// tiempo de petición, donde la memoria de cada instancia serverless no se comparte.
//
// `null` es un resultado válido (portada sin color) y dura lo que el tono. Un fallo
// se cachea poco tiempo como `"failed"`: frena los reintentos contra un origen caído
// sin dejar a la obra sin color. Es el único sitio que registra el fallo, así que
// hay un log por extracción real y ninguno por acierto de caché.
export async function getWorkHue(coverUrl: string): Promise<number | null | "failed"> {
  "use cache: remote";
  try {
    const hue = await extractHue(coverUrl);
    cacheLife("max");
    return hue;
  } catch (error) {
    cacheLife("minutes");
    console.error("getWorkHue", error);
    return "failed";
  }
}

const LATE = Symbol("late");

// Mantiene viva la función hasta que el valor llegue a la caché: la respuesta ya
// se habrá enviado con el tono de respaldo y la siguiente visita verá el real.
function keepAliveUntilStored(extraction: Promise<unknown>) {
  after(async () => {
    await extraction.catch((error) => console.error("resolveWorkHue", error));
    await new Promise((resolve) => setTimeout(resolve, CACHE_WRITE_GRACE_MS));
  });
}

// Nunca rechaza: las fichas la lanzan sin await para no sumarla en serie a sus lecturas.
export async function resolveWorkHue({
  coverUrl,
  title,
}: {
  coverUrl: string | null;
  title: string;
}): Promise<number> {
  const fallback = hashTitleHue(title);
  if (!coverUrl || !isAllowedCoverUrl(coverUrl)) return fallback;
  try {
    const extraction = getWorkHue(coverUrl);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const budget = new Promise<typeof LATE>((resolve) => {
      timer = setTimeout(() => resolve(LATE), REQUEST_BUDGET_MS);
    });
    const hue = await Promise.race([extraction, budget]);
    clearTimeout(timer);
    if (hue === LATE) {
      keepAliveUntilStored(extraction);
      return fallback;
    }
    return typeof hue === "number" ? hue : fallback;
  } catch (error) {
    console.error("resolveWorkHue", error);
    return fallback;
  }
}
