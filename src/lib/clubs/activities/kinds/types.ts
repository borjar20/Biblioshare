import type { ComponentType } from "react";
import type { ActivityDetail, ActivityKind } from "@/lib/clubs/activities/core";
import type { ItemType } from "@/lib/catalog/types";

// Dispatcher genérico por kind (EPIC-05, Bloque H1, decisión 1 del diseño).
// Bloque G dejó un `config jsonb` sin consumidor y un switch de 4 kinds
// hardcodeado en la UI -- este registro es lo que faltaba para que cada
// tipo se enchufe sin tocar el núcleo de G. Hoy `buddy_read` (H1) y
// `list_challenge` (H3) tienen comportamiento real; tierlist y
// criteria_challenge siguen como stubs mínimos.
export type ActivityKindDefinition = {
  kind: ActivityKind;
  // Tipos de ítem permitidos en el pool de esta actividad -- "all" = sin
  // restricción (comportamiento de G antes de este bloque).
  allowedItemTypes: ItemType[] | "all";
  // Máximo de ítems en el pool -- null = sin límite.
  maxItems: number | null;
  // Quién puede curar el pool de ítems (EPIC-05, Bloque H3):
  //   "participants" -- cualquier participante (comportamiento de G).
  //   "curators"     -- solo el creador de la actividad o moderator+ del club.
  //                     list_challenge lo usa: la lista ES el enunciado del
  //                     reto, y si cualquiera la hace crecer a mitad de camino
  //                     la meta se mueve bajo quien ya iba por la mitad.
  // La RLS sigue siendo la fuente de verdad (política "insert participant or
  // curator"); esto solo evita ofrecer en la UI un botón que fallaría.
  itemCuration: "participants" | "curators";
  // Contenido específico del kind que se inserta en ActivityDetailView, tras
  // el pool de ítems / opiniones genéricos de G. No gateado por
  // isParticipant -- cada extensión decide qué mostrar a quién (p.ej.
  // buddy_read enseña la lista de checkpoints a todo el club, decisión 7).
  DetailExtension?: ComponentType<{
    activity: ActivityDetail;
    viewerId: string;
    isModerator: boolean;
    onChanged: () => void;
  }>;
};

export const ACTIVITY_KIND_ORDER: ActivityKind[] = [
  "buddy_read",
  "tierlist",
  "list_challenge",
  "criteria_challenge",
];
