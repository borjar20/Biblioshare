import type { SagaAccentToken } from "../accents";
import { deriveShelf, type ShelfMode, type ShelfSlot, type ShelfWork } from "../derive-shelf";
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
};

// Modelo del atlas de la saga (spec 2026-10-28 §4.1). Puro. NO decide nada que
// ya decida la balda: «ahora», estados de región y anclas salen de `deriveShelf`;
// aquí solo se aplana en una lista de obras con lo que el lienzo necesita.
export function deriveAtlas(input: {
  sections: TimelineSection[];
  authenticated: boolean;
  years: Map<string, number | null>;
  steps: ItineraryStep[] | null;
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

  return {
    works,
    regions: shelf.groups.map((g) => ({
      key: g.key, name: g.name, accent: g.accent, state: g.state, counted: g.counted, completed: g.completed,
    })),
    nowKey: works.find((w) => w.state === "now")?.key ?? null,
    mode: shelf.mode,
    nextTitle: shelf.nextUp?.work.title ?? null,
    hasItinerary: input.steps !== null,
  };
}
