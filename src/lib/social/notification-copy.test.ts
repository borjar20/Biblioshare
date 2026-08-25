import { describe, expect, it } from "vitest";
import { notificationCopy } from "./notification-copy";

const nombre = "Ana";

describe("notificationCopy sin contexto", () => {
  // El camino más transitado: TODAS las filas anteriores a esta spec.
  it("cae a la copia de siempre cuando no hay contexto", () => {
    expect(notificationCopy({ type: "review_liked", name: nombre })).toEqual({
      key: "reviewLiked",
      values: { name: nombre },
    });
    expect(notificationCopy({ type: "review_liked", context: null, name: nombre })).toEqual({
      key: "reviewLiked",
      values: { name: nombre },
    });
    expect(notificationCopy({ type: "review_liked", context: {}, name: nombre })).toEqual({
      key: "reviewLiked",
      values: { name: nombre },
    });
  });

  it("un tipo sin variantes se queda con su copia aunque traiga contexto", () => {
    expect(
      notificationCopy({ type: "club_invite", context: { emoji: "🔥" }, name: nombre }),
    ).toEqual({ key: "clubInvite", values: { name: nombre } });
  });
});

describe("notificationCopy con emoji", () => {
  it("usa la variante con emoji", () => {
    expect(
      notificationCopy({ type: "review_liked", context: { emoji: "🔥" }, name: nombre }),
    ).toEqual({ key: "reviewLikedEmoji", values: { name: nombre, emoji: "🔥" } });
  });

  // Un emoji que el sistema no sabe pintar saldría como cuadradito: mejor la
  // frase de siempre que un churro. Ver issue #793.
  it("degrada a la copia de siempre si el dispositivo no puede pintarlo", () => {
    expect(
      notificationCopy({
        type: "review_liked",
        context: { emoji: "🫩" },
        name: nombre,
        canRenderEmoji: () => false,
      }),
    ).toEqual({ key: "reviewLiked", values: { name: nombre } });
  });

  it("sin comprobador de emoji, lo pinta (es el caso del servidor y del push)", () => {
    expect(
      notificationCopy({ type: "review_liked", context: { emoji: "🐙" }, name: nombre }),
    ).toEqual({ key: "reviewLikedEmoji", values: { name: nombre, emoji: "🐙" } });
  });
});

describe("notificationCopy con comentario", () => {
  it("cita el extracto", () => {
    expect(
      notificationCopy({
        type: "review_commented",
        context: { excerpt: "Lo terminé anoche" },
        name: nombre,
      }),
    ).toEqual({
      key: "reviewCommentedExcerpt",
      values: { name: nombre, excerpt: "Lo terminé anoche" },
    });
  });

  // Regla dura: un spoiler NUNCA imprime texto, ni aunque alguien haya metido
  // un excerpt a mano en el JSON de la fila.
  it("un spoiler avisa pero no cita, aunque traiga excerpt", () => {
    expect(
      notificationCopy({
        type: "review_commented",
        context: { spoiler: true, excerpt: "Muere el protagonista" },
        name: nombre,
      }),
    ).toEqual({ key: "reviewCommentedSpoiler", values: { name: nombre } });
  });
});

describe("notificationCopy con obra", () => {
  it("nombra la obra", () => {
    expect(
      notificationCopy({ type: "followed_finished", context: { subject: "Dune" }, name: nombre }),
    ).toEqual({ key: "followedFinishedSubject", values: { name: nombre, subject: "Dune" } });
  });
});

describe("notificationCopy agrupada", () => {
  // La agrupación manda sobre el contexto: con varios actores, el emoji de UNO
  // de ellos no representa al grupo.
  it("con varios actores usa la copia agrupada e ignora el contexto", () => {
    expect(
      notificationCopy({
        type: "review_liked",
        context: { emoji: "🔥" },
        name: nombre,
        extraActorsCount: 3,
      }),
    ).toEqual({ key: "reviewLikedGrouped", values: { name: nombre, count: 3 } });
  });

  it("un tipo sin copia agrupada cae a la suya con el contador", () => {
    expect(
      notificationCopy({ type: "thought_liked", name: nombre, extraActorsCount: 2 }),
    ).toEqual({ key: "thoughtLiked", values: { name: nombre, count: 2 } });
  });
});
