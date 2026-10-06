// Lo único del wrap-up que ve alguien distinto del dueño (spec 2026-10-06 §5,
// «Tarjeta del feed»): cifras, portadas y la narradora. Nunca frases ni reseñas.
import { totalMinutes } from "./select-stories";
import type { ShareSummary, WrapUpInputs, WrapUpPayload } from "./types";

export function shareSummary(p: Omit<WrapUpPayload, "share">, i: WrapUpInputs): ShareSummary {
  return {
    kind: p.kind, periodStart: p.periodStart, periodEnd: p.periodEnd,
    narrator: p.narrator, palette: p.palette,
    minutes: totalMinutes(i.time), episodesWithoutRuntime: i.time.episodesWithoutRuntime,
    finished: i.finished.length, covers: i.finished.slice(0, 4), pet: p.pet,
  };
}
