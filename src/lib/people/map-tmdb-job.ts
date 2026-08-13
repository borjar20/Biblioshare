import type { CreditRole } from "./types";

// `credits.role` solo admite cast/director/writer/creator/author. TMDB devuelve
// DECENAS de `job` distintos en el equipo (Producer, Director of Photography,
// Editor, Original Music Composer…) y no hay rol donde meterlos: lo que no mapea
// se DESCARTA, no se inventa un rol ni se guarda como texto libre (eso metería
// un vocabulario abierto en una columna cerrada).
//
// "Director of Photography" NO es dirección: por eso el mapa es exacto, no un
// `includes("Director")`.
const JOB_TO_ROLE: Record<string, CreditRole> = {
  director: "director",
  writer: "writer",
  screenplay: "writer",
  story: "writer",
  creator: "creator",
};

export function mapTmdbJob(job: string | null | undefined): CreditRole | null {
  if (!job) return null;
  return JOB_TO_ROLE[job.trim().toLowerCase()] ?? null;
}
