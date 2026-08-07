import { describe, it, expect } from "vitest";
import { planFeedPageCut } from "./feed-paging";
import { groupPersonEntries, descriptorForEntry } from "./group-feed-entries";
import { compareEntries, isAfterCursor, makeCursor, parseCursor } from "./feed-order";
import { emptyReactions } from "./interactions";
import type { FeedEntry, FeedEvent } from "./feed";

function ev(
  partial: Partial<FeedEvent> & Pick<FeedEvent, "id" | "verb" | "actorId" | "eventDate">,
): FeedEvent {
  return {
    actorUsername: "u", actorDisplayName: null, actorAvatarUrl: null,
    itemType: "book", itemId: partial.itemId ?? "i1", itemTitle: "T", itemCoverUrl: null,
    itemSubtitle: null, entryStatus: null, rating: null, reviewExcerpt: null,
    episode: null, progress: null, interactionTarget: null,
    orderDate: partial.orderDate ?? partial.eventDate,
    sortDate: partial.sortDate ?? partial.eventDate,
    reactionCount: 0, viewerReacted: false, commentCount: 0, comments: [],
    reactions: emptyReactions(),
    ...partial,
  } as FeedEvent;
}
function person(e: FeedEvent): FeedEntry {
  return { source: "person", id: e.id, eventDate: e.eventDate, orderDate: e.orderDate, sortDate: e.sortDate, event: e };
}

// Firma estable de una tarjeta, para comparar recorridos sin depender de ids
// sintéticos de grupo.
function sig(entry: FeedEntry): string {
  if (entry.source === "person-group") {
    return `G[${entry.items.map((i) => i.id).join(",")}]`;
  }
  return entry.id;
}

// Simula getFeed con la fuente COMPLETA disponible (drained=true): cada página
// filtra por el cursor, corta con planFeedPageCut, agrupa el prefijo, y avanza
// el cursor a la última fila cruda servida. Devuelve las tarjetas en orden.
function traverse(fullStream: FeedEntry[], pageSize: number): FeedEntry[] {
  const sorted = [...fullStream].sort(compareEntries);
  const out: FeedEntry[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 1000; guard++) {
    const parsed = cursor ? parseCursor(cursor) : null;
    const fresh = parsed ? sorted.filter((e) => isAfterCursor(e, parsed)) : sorted;
    if (fresh.length === 0) break;
    const cut = planFeedPageCut(fresh, descriptorForEntry, pageSize, new Set());
    if (cut <= 0) throw new Error("cut no avanza: bucle infinito");
    const page = fresh.slice(0, cut);
    out.push(...groupPersonEntries(page));
    if (cut >= fresh.length) break;
    cursor = makeCursor(fresh[cut - 1]);
  }
  return out;
}

describe("planFeedPageCut", () => {
  it("pone en la MISMA página dos tarjetas que se solapan (contraejemplo del cursor crudo)", () => {
    // A = avances en obra Z (D5 y D3, una tarjeta timeline). B = terminó Y (D4),
    // metido DENTRO del lapso de A. Con pageSize=1 no se puede servir A y luego
    // B por keyset (B se perdería): el corte limpio obliga a ponerlas juntas.
    const fresh = [
      person(ev({ id: "progress_sessions:x5", verb: "progressed", actorId: "a", eventDate: "2026-08-05", itemId: "Z" })),
      person(ev({ id: "diary_entries:y4", verb: "finished", actorId: "a", eventDate: "2026-08-04", itemId: "Y" })),
      person(ev({ id: "progress_sessions:x3", verb: "progressed", actorId: "a", eventDate: "2026-08-03", itemId: "Z" })),
    ].sort(compareEntries);

    const cut = planFeedPageCut(fresh, descriptorForEntry, 1, new Set());
    expect(cut).toBe(3); // no hay corte limpio antes: las tres filas van juntas
    const cards = groupPersonEntries(fresh.slice(0, cut));
    expect(cards.map(sig).sort()).toEqual(["G[progress_sessions:x5,progress_sessions:x3]", "diary_entries:y4"].sort());
  });

  it("corta tras pageSize tarjetas cuando el borde es limpio (todo singletons)", () => {
    const fresh = [
      person(ev({ id: "diary_entries:a", verb: "finished", actorId: "u", eventDate: "2026-08-05", itemId: "1" })),
      person(ev({ id: "diary_entries:b", verb: "finished", actorId: "u", eventDate: "2026-08-04", itemId: "2" })),
      person(ev({ id: "diary_entries:c", verb: "finished", actorId: "u", eventDate: "2026-08-03", itemId: "3" })),
    ].sort(compareEntries);
    expect(planFeedPageCut(fresh, descriptorForEntry, 2, new Set())).toBe(2);
  });

  it("retiene una tarjeta que podría continuar más allá del fetch (fuente no agotada)", () => {
    // f1, f2 sueltos; luego un timeline de Z que TOCA la cola del fetch (z6 es
    // la última fila y podría haber sesiones de Z más viejas sin traer). Con la
    // fuente no agotada, Z no debe emitirse partido: la página corta antes.
    const fresh = [
      person(ev({ id: "diary_entries:f1", verb: "finished", actorId: "u", eventDate: "2026-08-09", itemId: "1" })),
      person(ev({ id: "diary_entries:f2", verb: "finished", actorId: "u", eventDate: "2026-08-08", itemId: "2" })),
      person(ev({ id: "progress_sessions:z7", verb: "progressed", actorId: "u", eventDate: "2026-08-07", itemId: "Z" })),
      person(ev({ id: "progress_sessions:z6", verb: "progressed", actorId: "u", eventDate: "2026-08-06", itemId: "Z" })),
    ].sort(compareEntries);

    // Z toca la cola de su fuente (progress_sessions no agotada): se retiene
    // (corte tras f1,f2).
    const zTail = new Set(["progress_sessions:z6"]);
    expect(planFeedPageCut(fresh, descriptorForEntry, 3, zTail)).toBe(2);
    // Agotada: el final es borde limpio, Z ya está completo → se emite todo.
    expect(planFeedPageCut(fresh, descriptorForEntry, 3, new Set())).toBe(4);
  });

  it("retiene una tarjeta incompleta aunque NO sea la última del flujo (cola de su fuente)", () => {
    // review1 (nuevo) · grupo de altas cuya cola toca el límite de `added` ·
    // review2 (más viejo, de otra fuente ya agotada). Aunque haya filas debajo
    // del grupo incompleto, el grupo se retiene y solo se emite review1.
    const fresh = [
      person(ev({ id: "diary_entries:r1", verb: "finished", actorId: "u", eventDate: "2026-08-09", itemId: "1" })),
      person(ev({ id: "diary_entries_added:g1", verb: "added", actorId: "u", eventDate: "2026-08-07T10:00:00+00:00", itemId: "b1" })),
      person(ev({ id: "diary_entries_added:g2", verb: "added", actorId: "u", eventDate: "2026-08-07T09:00:00+00:00", itemId: "b2" })),
      person(ev({ id: "diary_entries:r2", verb: "finished", actorId: "u", eventDate: "2026-08-05", itemId: "2" })),
    ].sort(compareEntries);
    // `added` no agotada: su fila más vieja traída (g2) es cola abierta.
    const cut = planFeedPageCut(fresh, descriptorForEntry, 2, new Set(["diary_entries_added:g2"]));
    expect(cut).toBe(1); // solo review1; el grupo (y review2 tras él) se retienen
  });

  it("RECORRIDO: paginar por tandas reproduce agrupar el flujo entero (sin dup ni pérdida)", () => {
    const stream: FeedEntry[] = [
      // actor a: import de 3 altas el mismo día (un grupo)
      person(ev({ id: "diary_entries_added:a1", verb: "added", actorId: "a", eventDate: "2026-08-06T10:00:00+00:00", itemId: "b1" })),
      person(ev({ id: "diary_entries_added:a2", verb: "added", actorId: "a", eventDate: "2026-08-06T10:00:01+00:00", itemId: "b2" })),
      person(ev({ id: "diary_entries_added:a3", verb: "added", actorId: "a", eventDate: "2026-08-06T10:00:02+00:00", itemId: "b3" })),
      // actor b: timeline largo en obra Z (solapando eventos de otros)
      person(ev({ id: "progress_sessions:z9", verb: "progressed", actorId: "b", eventDate: "2026-08-09", itemId: "Z" })),
      person(ev({ id: "progress_sessions:z7", verb: "progressed", actorId: "b", eventDate: "2026-08-07", itemId: "Z" })),
      person(ev({ id: "progress_sessions:z5", verb: "progressed", actorId: "b", eventDate: "2026-08-05", itemId: "Z" })),
      // eventos sueltos intercalados en el lapso del timeline
      person(ev({ id: "diary_entries:c8", verb: "finished", actorId: "c", eventDate: "2026-08-08", itemId: "F1" })),
      person(ev({ id: "diary_entries:c6", verb: "reviewed", actorId: "c", eventDate: "2026-08-06T20:00:00+00:00", itemId: "F2" })),
      // episodios de una serie (atracón) de actor d
      person(ev({ id: "episode_watches:e4", verb: "rated", actorId: "d", eventDate: "2026-08-04", itemType: "series", itemId: "loki", episode: { season: 1, episode: 4, title: null } })),
      person(ev({ id: "episode_watches:e3", verb: "watchedEpisode", actorId: "d", eventDate: "2026-08-03", itemType: "series", itemId: "loki", episode: { season: 1, episode: 3, title: null } })),
      person(ev({ id: "diary_entries:c2", verb: "finished", actorId: "c", eventDate: "2026-08-02", itemId: "F3" })),
    ];
    const expected = groupPersonEntries(stream).map(sig);
    for (const pageSize of [1, 2, 3, 5]) {
      const got = traverse(stream, pageSize).map(sig);
      expect(got, `pageSize=${pageSize}`).toEqual(expected);
    }
  });
});
