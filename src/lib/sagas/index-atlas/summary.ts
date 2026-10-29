import type { IndexAtlasModel } from "./model";

// Resumen de una línea de la barra superior (spec 2026-10-28 índice §5). Puro: la UI pone el
// texto con `sagaIndex.atlas.summary.<key>`.
export type IndexSummary =
  | { key: "enCurso"; values: { name: string; more: number; followed: number } }
  | { key: "sinCurso"; values: { followed: number; discover: number } }
  | { key: "anonimo"; values: { sagas: number; universes: number } }
  | { key: "sinCoincidencias"; values: Record<string, never> };

export function summarizeIndex(model: IndexAtlasModel, matching: number): IndexSummary {
  if (model.sagaCount > 0 && matching === 0) return { key: "sinCoincidencias", values: {} };
  if (!model.authenticated) return { key: "anonimo", values: { sagas: model.sagaCount, universes: model.universeCount } };
  const enCurso = model.zones.find((z) => z.key === "en-curso");
  if (enCurso) {
    return { key: "enCurso", values: { name: enCurso.sagas[0].name, more: enCurso.count - 1, followed: model.followedCount } };
  }
  const discover = model.zones.find((z) => z.key === "por-descubrir")?.count ?? 0;
  return { key: "sinCurso", values: { followed: model.followedCount, discover } };
}
