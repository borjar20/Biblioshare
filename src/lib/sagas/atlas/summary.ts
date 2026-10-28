import { SAGA_ITEM_ROLES, type SagaItemRole } from "../roles";
import type { Lens } from "./layout";
import type { AtlasModel } from "./model";

export type AtlasSummary =
  | { key: "ordenNext"; values: { done: number; total: number; title: string } }
  | { key: "ordenStart"; values: { title: string } }
  | { key: "ordenFinished" | "ordenAllOptional" | "empty"; values: Record<string, never> }
  | { key: "rol"; counts: Array<{ role: SagaItemRole | "principal"; count: number }> }
  | { key: "publicacion"; values: { from: number; to: number; outOfOrder: number } }
  | { key: "publicacionSinAnos"; values: Record<string, never> };

// Resumen de una línea por lente (spec 2026-10-28 §4). Puro: devuelve la clave
// de `saga.atlas.*` y sus valores; el texto lo pone la UI.
export function summarize(model: AtlasModel, lens: Lens): AtlasSummary {
  if (lens === "rol") {
    const counts: Array<{ role: SagaItemRole | "principal"; count: number }> = [];
    const principal = model.works.filter((w) => w.role === null).length;
    if (principal > 0) counts.push({ role: "principal", count: principal });
    for (const role of SAGA_ITEM_ROLES) {
      const count = model.works.filter((w) => w.role === role).length;
      if (count > 0) counts.push({ role, count });
    }
    return { key: "rol", counts };
  }

  if (lens === "publicacion") {
    const dated = model.works.filter((w): w is typeof w & { year: number } => w.year !== null);
    if (dated.length === 0) return { key: "publicacionSinAnos", values: {} };
    const years = dated.map((w) => w.year);
    const byReading = [...dated].sort((a, b) => a.readingIndex - b.readingIndex);
    const byYear = [...dated].sort((a, b) => a.year - b.year || a.readingIndex - b.readingIndex);
    // Fuera de orden: su puesto al ordenar por salida difiere del de lectura.
    const outOfOrder = byReading.filter((w, i) => byYear[i] !== w).length;
    return {
      key: "publicacion",
      values: { from: Math.min(...years), to: Math.max(...years), outOfOrder },
    };
  }

  switch (model.mode) {
    case "next":
    case "start": {
      const title = model.nextTitle ?? model.works.find((w) => !w.optional)?.title ?? "";
      if (model.mode === "start") return { key: "ordenStart", values: { title } };
      const counted = model.works.filter((w) => !w.optional);
      const done = counted.filter((w) => w.state === "done").length;
      return { key: "ordenNext", values: { done, total: counted.length, title } };
    }
    case "finished":
      return { key: "ordenFinished", values: {} };
    case "allOptional":
      return { key: "ordenAllOptional", values: {} };
    default:
      return { key: "empty", values: {} };
  }
}
