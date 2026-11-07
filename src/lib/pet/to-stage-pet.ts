import type { CompanionState } from "./get-companion-state";
import type { StagePet } from "@/components/stage/stage-mascot";

// La mascota que se sienta en el mueble (StageMascot) a partir de la lectura
// ligera de la compañera. `hidden` NO cuenta: oculta la flotante del shell, no
// la de la partida, la sesión o el cierre. Sin compañera (o si su lectura
// falló y llega null), habla el narrador.
export function toStagePet(companion: CompanionState | null): StagePet | null {
  return companion ? { name: companion.name, petClass: companion.petClass, stage: companion.stage } : null;
}
