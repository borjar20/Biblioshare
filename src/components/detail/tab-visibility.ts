// Lógica pura de qué pestañas enseña la ficha, extraída de ItemDetailTabs para
// poder testearla sin montar el componente. La pestaña "log" (Mi registro) solo
// existe cuando el ítem está seguido (tiene pase activo); "episodes" solo en
// series. El orden es el del mockup.
export type DetailTabId = "info" | "episodes" | "community" | "log";

export function detailTabOrder(
  hasEpisodes: boolean,
  followed: boolean,
): DetailTabId[] {
  const base: DetailTabId[] = hasEpisodes
    ? ["info", "episodes", "community"]
    : ["info", "community"];
  return followed ? [...base, "log"] : base;
}

// La pestaña pedida por ?tab= (deep link, o el ?tab=log que pone el botón
// "Seguir" del hero) se acota a las disponibles: pedir "log" sin seguir cae a
// "info", igual que un valor desconocido o ausente.
export function clampDetailTab(
  requested: string | null,
  order: DetailTabId[],
): DetailTabId {
  return requested && (order as string[]).includes(requested)
    ? (requested as DetailTabId)
    : "info";
}
