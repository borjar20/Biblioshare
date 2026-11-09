import { cacheLife } from "next/cache";
import sharp from "sharp";
import { hashTitleHue, hueFromPixels } from "./work-hue-core";

const TIMEOUT_MS = 2000;
const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

// Solo los orígenes de images.remotePatterns: la URL sale del catálogo y el
// servidor no debe descargar de cualquier sitio.
function isAllowedCover(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  if (["image.tmdb.org", "covers.openlibrary.org", "books.google.com", "books.googleusercontent.com"].includes(url.hostname)) {
    return true;
  }
  return url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/storage/v1/object/public/");
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
    const location = res.headers.get("location");
    if (!location) throw new Error(`getWorkHue: redirección sin destino (HTTP ${res.status})`);
    const next = new URL(location, target);
    if (!isAllowedRedirect(next)) throw new Error(`getWorkHue: redirección no permitida a ${next.hostname}`);
    target = next.href;
  }
  throw new Error("getWorkHue: demasiadas redirecciones");
}

// El tono depende solo de la imagen: igual para un anónimo, el dueño y un tercero
// (regla #437). `null` es un resultado válido (portada sin color). Un fallo LANZA:
// así no se guarda en caché y la siguiente visita lo reintenta.
export async function getWorkHue(coverUrl: string): Promise<number | null> {
  "use cache";
  cacheLife("max");

  const url = new URL(coverUrl);
  if (!isAllowedCover(url)) throw new Error(`getWorkHue: origen no permitido ${url.hostname}`);

  const res = await fetchCover(smallCoverUrl(coverUrl));
  if (!res.ok) throw new Error(`getWorkHue: HTTP ${res.status}`);
  const input = Buffer.from(await res.arrayBuffer());
  if (input.length > MAX_BYTES) throw new Error("getWorkHue: imagen demasiado grande");

  const pixels = await sharp(input).resize(24, 36, { fit: "fill" }).removeAlpha().raw().toBuffer();
  return hueFromPixels(pixels);
}

export async function resolveWorkHue({
  coverUrl,
  title,
}: {
  coverUrl: string | null;
  title: string;
}): Promise<number> {
  if (!coverUrl) return hashTitleHue(title);
  try {
    return (await getWorkHue(coverUrl)) ?? hashTitleHue(title);
  } catch (error) {
    console.error("resolveWorkHue", error);
    return hashTitleHue(title);
  }
}
