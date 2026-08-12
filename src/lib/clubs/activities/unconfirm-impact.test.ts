import { describe, expect, it } from "vitest";
import { unconfirmImpact } from "./unconfirm-impact";
import type { CheckpointViewModel } from "./checkpoints";
import type { InteractionSummary, InteractionComment } from "@/lib/social/interactions";

function comment(isOwn: boolean): InteractionComment {
  return {
    id: "c", interactionTargetId: "t", authorId: "a", author: "A",
    authorUsername: null, authorAvatarUrl: null, initials: "A",
    body: "hola", createdAt: "2026-08-01", isOwn, canDelete: isOwn, canEdit: isOwn,
    // Resto del tipo real (no estaba en el brief): valores neutros, no los
    // ejercita ningún test de este fichero.
    canPin: false, parentId: null, isSpoiler: false, pinned: false, edited: false,
    reactionCount: 0, viewerReacted: false, reactions: {} as InteractionComment["reactions"],
  };
}

function chat(comments: InteractionComment[], total = comments.length): InteractionSummary {
  return {
    interactionTargetId: "t", reactionCount: 0, viewerReacted: false,
    commentCount: total, comments, reactions: {} as InteractionSummary["reactions"],
  };
}

function cp(over: Partial<CheckpointViewModel> & { order: number }): CheckpointViewModel {
  return {
    id: `id-${over.order}`, label: `Hito ${over.order}`, position: {} as CheckpointViewModel["position"],
    dueOn: null, status: "confirmed", reachedByCount: 1, participantCount: 2, chat: null,
    ...over,
  };
}

const cinco = [cp({ order: 0 }), cp({ order: 1 }), cp({ order: 2 }), cp({ order: 3 }), cp({ order: 4 })];

describe("unconfirmImpact — qué arrastra desmarcar", () => {
  it("el último hito no arrastra a nadie", () => {
    const impacto = unconfirmImpact(cinco[4], cinco);
    expect(impacto.alsoFalling).toEqual([]);
    expect(impacto.extraCount).toBe(0);
  });

  it("arrastra solo a los POSTERIORES, nunca a los anteriores", () => {
    const impacto = unconfirmImpact(cinco[3], cinco);
    expect(impacto.alsoFalling).toEqual(["Hito 4"]);
    expect(impacto.extraCount).toBe(0);
  });

  it("con más de dos posteriores, nombra dos y cuenta el resto", () => {
    const impacto = unconfirmImpact(cinco[0], cinco);
    expect(impacto.alsoFalling).toEqual(["Hito 1", "Hito 2"]);
    expect(impacto.extraCount).toBe(2);
  });

  it("con exactamente tres posteriores, uno por encima del tope, cuenta uno", () => {
    // El caso «justo uno de más»: con dos se nombran los dos y extraCount es 0,
    // así que este es el primero que ejercita de verdad el recorte.
    const impacto = unconfirmImpact(cinco[1], cinco);
    expect(impacto.alsoFalling).toEqual(["Hito 2", "Hito 3"]);
    expect(impacto.extraCount).toBe(1);
  });

  it("las etiquetas salen en orden de hito, venga como venga el array", () => {
    // Sin esto, borrar el `.sort()` de la implementación no rompería ningún
    // test: los demás casos pasan el array ya ordenado y el orden saldría
    // «bien» por casualidad.
    const barajado = [cinco[2], cinco[0], cinco[4], cinco[1], cinco[3]];
    const impacto = unconfirmImpact(cinco[0], barajado);
    expect(impacto.alsoFalling).toEqual(["Hito 1", "Hito 2"]);
    expect(impacto.extraCount).toBe(2);
  });

  it("los hitos ya pendientes no cuentan como que caen", () => {
    const mixto = [
      cp({ order: 0 }),
      cp({ order: 1 }),
      cp({ order: 2, status: "pending" }),
      cp({ order: 3, status: "pending" }),
    ];
    const impacto = unconfirmImpact(mixto[1], mixto);
    expect(impacto.alsoFalling).toEqual([]);
    expect(impacto.extraCount).toBe(0);
  });
});

describe("unconfirmImpact — el aviso del chat", () => {
  it("sin chat cargado, no aplica", () => {
    expect(unconfirmImpact(cp({ order: 0 }), [cp({ order: 0 })]).chat).toBeNull();
  });

  it("chat sin mensajes tuyos y sin recorte: no aplica", () => {
    const c = cp({ order: 0, chat: chat([comment(false), comment(false)]) });
    expect(unconfirmImpact(c, [c]).chat).toBeNull();
  });

  it("chat con mensajes tuyos y sin recorte: aplica CON número", () => {
    const c = cp({ order: 0, chat: chat([comment(true), comment(false), comment(true)]) });
    expect(unconfirmImpact(c, [c]).chat).toEqual({ count: 2 });
  });

  it("con recorte y mensajes tuyos visibles: aplica SIN número", () => {
    // 20 cargados de 50 reales: contar los tuyos sobre los 20 mentiría.
    const c = cp({ order: 0, chat: chat([comment(true), ...Array(19).fill(comment(false))], 50) });
    expect(unconfirmImpact(c, [c]).chat).toEqual({ count: null });
  });

  it("con recorte y NINGÚN mensaje tuyo visible: aplica igual, sin número", () => {
    // No se puede descartar que haya alguno tuyo entre los 30 que no llegaron.
    const c = cp({ order: 0, chat: chat(Array(20).fill(comment(false)), 50) });
    expect(unconfirmImpact(c, [c]).chat).toEqual({ count: null });
  });
});
