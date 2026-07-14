import type { MediaStatus } from "@/lib/library/types";

export type PassEffect =
  | { kind: "none" }
  | { kind: "open" }
  | { kind: "close" }
  | { kind: "openAndClose" };

// El usuario nunca crea un pase a mano: lo abre y lo cierra el cambio de
// estado. Una película va de pendiente a visto sin pasar por "viendo", así que
// marcarla vista tiene que abrir y cerrar el pase en el mismo gesto.
// `from` es null cuando el ítem aún no estaba en la biblioteca.
export function passEffect(
  from: MediaStatus | null,
  to: MediaStatus,
  hasOpenPass: boolean
): PassEffect {
  if (to === "in_progress") {
    return hasOpenPass ? { kind: "none" } : { kind: "open" };
  }
  if (to === "completed") {
    return hasOpenPass ? { kind: "close" } : { kind: "openAndClose" };
  }
  if (to === "dropped") {
    return hasOpenPass ? { kind: "close" } : { kind: "none" };
  }
  return { kind: "none" };
}
