import type { SagaAccentToken } from "../accents";
import { deriveShelf, type Shelf, type ShelfMode, type ShelfSlot, type ShelfWork } from "../derive-shelf";
import type { TimelineRow, TimelineSection } from "../derive-timeline";
import type { SagaGraphNode } from "../map-types";
import type { SagaItemRole, TandemMode, WindowReason } from "../types";
import type { ItineraryStep } from "./itinerary";

export type AtlasWorkState = "done" | "now" | "todo";
export type AtlasWindow = {
  reason: WindowReason | null;
  afterKey: string | null;
  beforeKey: string | null;
  afterTitle: string | null;
  beforeTitle: string | null;
  notice: "antes" | "dentro" | "pasada" | null;
};
export type AtlasTandem = { mode: TandemMode | null; note: string | null; partnerKeys: string[] };
export type AtlasWork = {
  key: string;
  title: string;
  href: string;
  coverUrl: string | null;
  state: AtlasWorkState;
  role: SagaItemRole | null;
  optional: boolean;
  skipped: boolean;
  ownerSagaId: string;
  regionKey: string;
  readingNo: number | null;
  readingIndex: number;
  year: number | null;
  /** Opcional sin número que cuelga bajo su subsaga (los `extras` de la balda). */
  extra: boolean;
  window: AtlasWindow | null;
  tandem: AtlasTandem | null;
  step: number | null;
  stepNote: string | null;
};
export type AtlasRegion = {
  key: string;
  name: string | null;
  accent: SagaAccentToken;
  state: "done" | "current" | "future";
  counted: number;
  completed: number;
};
export type AtlasModel = {
  works: AtlasWork[];
  regions: AtlasRegion[];
  nowKey: string | null;
  mode: ShelfMode;
  nextTitle: string | null;
  hasItinerary: boolean;
  /** Avance de la ruta curada activa (#1567). Ausente: cuentan las obras del plano. */
  progress?: { done: number; total: number };
};

// Modelo del atlas de la saga (spec 2026-10-28 §4.1). Puro. NO decide nada que
// ya decida la balda: «ahora», estados de región y anclas salen de `deriveShelf`;
// aquí solo se aplana en una lista de obras con lo que el lienzo necesita.
//
// `routeSections` (#1567): las secciones del itinerario curado activo, las de
// `curatedRouteSections`, las mismas con las que la ficha decide «Te toca». El
// plano sigue en el orden principal (`sections`); de la ruta salen solo «ahora»,
// el modo, «te toca» y el avance, para que atlas y ficha digan lo mismo.
export function deriveAtlas(input: {
  sections: TimelineSection[];
  authenticated: boolean;
  years: Map<string, number | null>;
  steps: ItineraryStep[] | null;
  routeSections?: TimelineSection[] | null;
}): AtlasModel {
  const shelf = deriveShelf(input.sections, { authenticated: input.authenticated });

  // Fila del timeline de cada nodo: de ahí salen ventana y tándem, que la balda resume.
  const rowOf = new Map<string, { node: SagaGraphNode; row: TimelineRow | null }>();
  for (const s of input.sections) {
    for (const row of s.rows) {
      for (const node of row.kind === "tandem" ? row.nodes : [row.node]) rowOf.set(node.id, { node, row });
      if (row.kind === "entry" || row.kind === "tandem") {
        for (const b of row.branches) rowOf.set(b.node.id, { node: b.node, row: null });
      }
    }
  }
  const stepOf = new Map((input.steps ?? []).map((s) => [s.key, s] as const));

  const works: AtlasWork[] = [];
  const push = (w: ShelfWork, regionKey: string, extra: boolean, slot: ShelfSlot | null) => {
    const info = rowOf.get(w.key);
    const row = info?.row ?? null;
    const step = stepOf.get(w.key) ?? null;
    works.push({
      key: w.key, title: w.title, href: w.href, coverUrl: w.coverUrl, state: w.state, role: w.role,
      optional: w.optional, skipped: w.skipped, ownerSagaId: info?.node.ownerSagaId ?? "",
      regionKey, readingNo: w.no, readingIndex: works.length, year: input.years.get(w.key) ?? null, extra,
      window:
        row?.kind === "window" && row.node.id === w.key
          ? {
              reason: row.reason, afterKey: row.after?.id ?? null, beforeKey: row.before?.id ?? null,
              afterTitle: row.after?.label ?? null, beforeTitle: row.before?.label ?? null,
              notice: row.track?.notice ?? null,
            }
          : null,
      tandem:
        slot?.kind === "tandem" && row?.kind === "tandem"
          ? { mode: row.mode, note: row.note, partnerKeys: slot.works.filter((o) => o.key !== w.key).map((o) => o.key) }
          : null,
      step: step?.step ?? null, stepNote: step?.note ?? null,
    });
  };
  for (const g of shelf.groups) {
    for (const slot of g.slots) for (const w of slot.kind === "tandem" ? slot.works : [slot.work]) push(w, g.key, false, slot);
    for (const w of g.extras) push(w, g.key, true, null);
  }

  const regions: AtlasRegion[] = shelf.groups.map((g) => ({
    key: g.key, name: g.name, accent: g.accent, state: g.state, counted: g.counted, completed: g.completed,
  }));
  const model: AtlasModel = {
    works,
    regions,
    nowKey: works.find((w) => w.state === "now")?.key ?? null,
    mode: shelf.mode,
    nextTitle: shelf.nextUp?.work.title ?? null,
    hasItinerary: input.steps !== null,
  };
  return input.routeSections ? followRoute(model, deriveShelf(input.routeSections, { authenticated: input.authenticated })) : model;
}

/** Reasigna «ahora» según la balda de la ruta: la obra que era «ahora» en el
 *  orden principal pasa a pendiente y la región que la contiene deja de ser la
 *  actual. «Leída» no depende del orden, así que no cambia. */
function followRoute(model: AtlasModel, route: Shelf): AtlasModel {
  const routeWorks = route.groups.flatMap((g) => [...g.slots.flatMap((s) => (s.kind === "tandem" ? s.works : [s.work])), ...g.extras]);
  const nowKey = routeWorks.find((w) => w.state === "now")?.key ?? null;
  const works = model.works.map((w): AtlasWork => {
    const state: AtlasWorkState = w.key === nowKey ? "now" : w.state === "now" ? "todo" : w.state;
    return state === w.state ? w : { ...w, state };
  });
  const regions = model.regions.map((r): AtlasRegion => {
    if (works.some((w) => w.regionKey === r.key && w.state === "now")) return { ...r, state: "current" };
    if (r.state !== "current") return r;
    return { ...r, state: r.counted > 0 && r.completed === r.counted ? "done" : "future" };
  });
  const done = route.groups.reduce((n, g) => n + g.completed, 0);
  const total = route.groups.reduce((n, g) => n + g.counted, 0);
  return {
    ...model, works, regions, nowKey,
    mode: route.mode,
    nextTitle: route.nextUp?.work.title ?? null,
    progress: { done, total },
  };
}
