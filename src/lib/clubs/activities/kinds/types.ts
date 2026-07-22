import type { ComponentType, ReactNode } from "react";
import type { ActivityDetail, ActivityKind } from "@/lib/clubs/activities/core";
import type { ActivityLayoutProps } from "@/components/clubs/activity-layout";
import type { ItemType } from "@/lib/catalog/types";
import type { Json } from "@/lib/supabase/database.types";

// Dispatcher genérico por kind (EPIC-05, Bloque H1, decisión 1 del diseño).
// Bloque G dejó un `config jsonb` sin consumidor y un switch de 4 kinds
// hardcodeado en la UI -- este registro es lo que faltaba para que cada
// tipo se enchufe sin tocar el núcleo de G. Hoy `buddy_read` (H1),
// `list_challenge` (H3) y `criteria_challenge` (H4) tienen comportamiento
// real; solo `tierlist` sigue como stub mínimo.
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
  // ¿Este kind usa el pool de ítems genérico de G? criteria_challenge (H4) no tiene lista de
  // ítems -- el reto se DESCRIBE por criterio, no se enumera -- así que pintar la sección
  // "Ítems" (y las opiniones por ítem, que sin ítems no existen) sería una sección vacía sin
  // sentido.
  usesItemPool: boolean;
  // ¿Este kind tiene página propia en /club/[slug]/actividad/[id]? `evento` no
  // (spec 2026-07-22): es una fecha en el calendario, no algo en lo que entrar.
  // REQUERIDO a propósito, sin default: quien añada un kind nuevo tiene que
  // decidirlo, no heredarlo. La tarjeta y la guardia de ruta leen esto.
  hasDetailView: boolean;
  // Campos de configuración que este kind aporta al composer, y que se serializan a
  // club_activities.config (SD-8). Sin esto el composer solo sabe pedir título/descripción/
  // fechas. criteria_challenge (H4) es el primer kind que lo necesita -- y el primer
  // consumidor real de config.
  ConfigFields?: ComponentType<{
    value: Json | null;
    onChange: (config: Json) => void;
  }>;
  // Contenido específico del kind que se inserta en ActivityDetailView, tras
  // el pool de ítems / opiniones genéricos de G. No gateado por
  // isParticipant -- cada extensión decide qué mostrar a quién (p.ej.
  // buddy_read enseña la lista de checkpoints a todo el club, decisión 7).
  //
  // `Layout` es el reparto en tres ranuras (spec 2026-07-21): el tablero NO se
  // parte en dos componentes -- los cuatro derivan de un solo fetch en estado
  // local -- solo distribuye su propio JSX.
  DetailExtension?: ComponentType<{
    activity: ActivityDetail;
    viewerId: string;
    isModerator: boolean;
    onChanged: () => void;
    clubSlug: string;
    // SIEMPRE la referencia importada `ActivityLayout`, nunca un wrapper
    // `(props) => <ActivityLayout {...props} .../>` creado inline en el
    // render del padre: una flecha inline es un tipo de componente distinto
    // en cada render, y React, al no reconocer la identidad, desmonta y
    // remonta todo el subárbol que cuelga de `Layout` en cada re-render del
    // padre (aquí, cada `router.refresh()` tras una mutación). Efecto
    // observable doble: el `<details>` de la matriz se cierra solo, y el
    // texto a medio escribir en el chat de un hito se borra. Por eso
    // `railExtra` viaja como prop normal en vez de ir capturado en el
    // closure del wrapper.
    Layout: ComponentType<ActivityLayoutProps>;
    railExtra: ReactNode;
  }>;
};

export const ACTIVITY_KIND_ORDER: ActivityKind[] = [
  "buddy_read",
  "tierlist",
  "list_challenge",
  "criteria_challenge",
  "evento",
];

// Kinds ofrecibles en el asistente. `evento` solo lo crea moderador+, así que a
// un miembro raso ni se le enseña la tarjeta. Esto es gate de UI: la autoridad
// real es create_club_event, que valida el rol en servidor.
export function visibleKindOptions(isModerator: boolean): ActivityKind[] {
  return ACTIVITY_KIND_ORDER.filter(
    (kind) => kind !== "evento" || isModerator,
  );
}
