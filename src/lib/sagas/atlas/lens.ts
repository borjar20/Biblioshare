import { SAGA_ITEM_ROLES, type SagaItemRole } from "../roles";
import type { Lens } from "./layout";

const LENSES: readonly Lens[] = ["orden", "rol", "publicacion"];

export function parseLens(raw: string | undefined): Lens {
  return LENSES.find((l) => l === raw) ?? "orden";
}

export function parseRole(raw: string | undefined): SagaItemRole | null {
  return SAGA_ITEM_ROLES.find((r) => r === raw) ?? null;
}

/** Traduce parámetros viejos (?ruta=publicacion, ?orden=publicacion, ?rol=) a los
 *  del atlas. Devuelve null si ya están normalizados (así no hay bucle de redirects). */
export function legacyAtlasQuery(q: {
  ruta?: string; orden?: string; rol?: string; lente?: string;
}): URLSearchParams | null {
  const out = new URLSearchParams();
  const porPublicacion = q.ruta === "publicacion" || q.orden === "publicacion";
  const rol = parseRole(q.rol);
  if (q.ruta && q.ruta !== "publicacion") out.set("ruta", q.ruta);
  if (porPublicacion) out.set("lente", "publicacion");
  else if (q.lente) out.set("lente", q.lente);
  else if (rol) out.set("lente", "rol");
  if (rol) out.set("rol", rol);

  const input = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined) input.set(k, v);
  const norm = (p: URLSearchParams) => [...p.entries()].sort().join("&");
  return norm(out) === norm(input) ? null : out;
}
