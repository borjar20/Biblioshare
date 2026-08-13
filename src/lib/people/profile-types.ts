import type { ItemType } from "@/lib/catalog/types";
import type { CreditRole, Person } from "./types";

// El contrato de datos de la ficha de persona a tres columnas.
//
// NO es cacheable (regla #437): `status`, `userRating`, `finishedOn` y
// `progressPercent` dependen de `passes` del que MIRA. Un `use cache` sobre lo
// que produce estos tipos le serviría a un usuario las filas que solo otro
// podía ver, y no se vería en desarrollo con una sola cuenta abierta.

export type WorkStatus = "planned" | "in_progress" | "completed" | "dropped";

export type ProfileWork = {
  itemType: ItemType;
  itemId: string;
  title: string;
  coverUrl: string | null;
  href: string;
  year: number | null;
  /** Minutos en película; en serie, duración de episodio. Null en libros. */
  durationMinutes: number | null;
  /** TODOS los créditos de ESTA persona en ESTA obra. Nunca vacío. */
  roles: CreditRole[];
  /** Personaje, si alguno de sus créditos es `cast`. */
  character: string | null;
  /** Media de la comunidad (1–10), o null. */
  globalRating: number | null;
  sagaId: string | null;
  sagaName: string | null;
  /** Estado del VISITANTE. Todo null sin sesión. */
  status: WorkStatus | null;
  userRating: number | null;
  finishedOn: string | null;
  /**
   * Dónde vas, con las palabras de cada medio: «Pág. 120» en libro, «T2E5» en
   * serie. Sale de `formatPosition`, el único sitio que interpreta el jsonb
   * `passes.position`. Null en película (no tiene sub-posición) y en cualquier
   * obra que no esté en curso.
   */
  progressLabel: string | null;
  /**
   * Solo cuando se puede calcular DE VERDAD: libro con página y `total_pages`.
   * En serie haría falta contar `episode_watches` (una consulta más por obra) y
   * en película no significa nada. Null no es «0%», es «no se sabe».
   */
  progressPercent: number | null;
};

export type Collaborator = {
  id: string;
  name: string;
  photoUrl: string | null;
  href: string;
  role: CreditRole;
  sharedCount: number;
};

export type SagaProgress = {
  sagaId: string;
  name: string;
  href: string;
  total: number;
  completed: number;
};

export type PersonProfile = {
  person: Person;
  works: ProfileWork[];
  roleCounts: Array<{ role: CreditRole; count: number }>;
  collaborators: Collaborator[];
  sagas: SagaProgress[];
  /** Media del visitante sobre las obras de esta persona (1–10), o null. */
  userAverage: number | null;
  /** Media de la comunidad sobre las obras de esta persona (1–10), o null. */
  globalAverage: number | null;
};
