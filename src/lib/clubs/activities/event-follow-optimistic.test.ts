import { describe, expect, it } from "vitest";
import {
  eventFollowReducer,
  orderFollowers,
  type EventFollowState,
  type FollowerRow,
} from "./event-follow-optimistic";

const NO_SEGUIDO: EventFollowState = {
  following: false,
  followersCount: 4,
  remindMinutesBefore: null,
};

describe("eventFollowReducer", () => {
  it("seguir sube el contador y arma el recordatorio predeterminado", () => {
    expect(eventFollowReducer(NO_SEGUIDO, { type: "follow" })).toEqual({
      following: true,
      followersCount: 5,
      remindMinutesBefore: 1440,
    });
  });

  it("dejar de seguir baja el contador y retira el recordatorio", () => {
    const siguiendo: EventFollowState = {
      following: true,
      followersCount: 5,
      remindMinutesBefore: 60,
    };
    expect(eventFollowReducer(siguiendo, { type: "unfollow" })).toEqual({
      following: false,
      followersCount: 4,
      remindMinutesBefore: null,
    });
  });

  // El contador y la lista tienen que contar lo mismo (§21). Si «seguir» dos
  // veces sumara dos, el optimismo enseñaría 6 donde el servidor dirá 5 --
  // exactamente la incoherencia que la reconciliación tendría que deshacer a la
  // vista del usuario.
  it("seguir dos veces no suma dos: la operación es idempotente", () => {
    const unaVez = eventFollowReducer(NO_SEGUIDO, { type: "follow" });
    const dosVeces = eventFollowReducer(unaVez, { type: "follow" });
    expect(dosVeces.followersCount).toBe(5);
    expect(dosVeces.following).toBe(true);
  });

  it("dejar de seguir dos veces no resta dos", () => {
    const unaVez = eventFollowReducer(NO_SEGUIDO, { type: "unfollow" });
    expect(unaVez.followersCount).toBe(4);
    expect(unaVez.following).toBe(false);
  });

  // El contador nunca puede quedar negativo, ni con un estado de partida raro.
  it("el contador no baja de cero", () => {
    const raro: EventFollowState = {
      following: true,
      followersCount: 0,
      remindMinutesBefore: 1440,
    };
    expect(eventFollowReducer(raro, { type: "unfollow" }).followersCount).toBe(0);
  });

  it("cambiar el recordatorio no toca el seguimiento ni el contador", () => {
    const siguiendo: EventFollowState = {
      following: true,
      followersCount: 5,
      remindMinutesBefore: 1440,
    };
    expect(eventFollowReducer(siguiendo, { type: "setReminder", minutes: 15 })).toEqual({
      following: true,
      followersCount: 5,
      remindMinutesBefore: 15,
    });
  });

  // «Sin recordatorio» es una elección legítima, no un "no ha elegido": tiene que
  // poder guardarse sin que se confunda con dejar de seguir.
  it("«sin recordatorio» se puede elegir sin dejar de seguir", () => {
    const siguiendo: EventFollowState = {
      following: true,
      followersCount: 5,
      remindMinutesBefore: 1440,
    };
    const resultado = eventFollowReducer(siguiendo, { type: "setReminder", minutes: null });
    expect(resultado.remindMinutesBefore).toBeNull();
    expect(resultado.following).toBe(true);
  });
});

describe("orderFollowers", () => {
  const seguidores: FollowerRow[] = [
    { userId: "c", displayName: "Chen Wei", username: "chen", avatarUrl: null, followedAt: "2026-08-01T10:00:00Z" },
    { userId: "org", displayName: "Marta Ruiz", username: "marta", avatarUrl: null, followedAt: "2026-08-03T10:00:00Z" },
    { userId: "yo", displayName: "Borja", username: "borja", avatarUrl: null, followedAt: "2026-08-04T10:00:00Z" },
    { userId: "a", displayName: "Ana Paz", username: "ana", avatarUrl: null, followedAt: "2026-07-30T10:00:00Z" },
  ];

  it("pone al usuario actual primero y al organizador después", () => {
    const orden = orderFollowers(seguidores, { viewerId: "yo", organizerId: "org" });
    expect(orden.map((f) => f.userId)).toEqual(["yo", "org", "a", "c"]);
  });

  it("el resto va por fecha de seguimiento, del más antiguo al más nuevo", () => {
    const orden = orderFollowers(seguidores, { viewerId: "yo", organizerId: "org" });
    expect(orden.slice(2).map((f) => f.followedAt)).toEqual([
      "2026-07-30T10:00:00Z",
      "2026-08-01T10:00:00Z",
    ]);
  });

  it("si el usuario actual no sigue el evento, manda el organizador", () => {
    const orden = orderFollowers(seguidores, { viewerId: "nadie", organizerId: "org" });
    expect(orden[0].userId).toBe("org");
  });

  // El orden tiene que ser ESTABLE: dos llamadas con los mismos datos dan lo
  // mismo, y no depende del orden en que llegaron de la base de datos.
  it("es estable frente al orden de entrada", () => {
    const alReves = [...seguidores].reverse();
    const a = orderFollowers(seguidores, { viewerId: "yo", organizerId: "org" });
    const b = orderFollowers(alReves, { viewerId: "yo", organizerId: "org" });
    expect(a.map((f) => f.userId)).toEqual(b.map((f) => f.userId));
  });

  it("no muta el array que recibe", () => {
    const copia = [...seguidores];
    orderFollowers(seguidores, { viewerId: "yo", organizerId: "org" });
    expect(seguidores).toEqual(copia);
  });

  // Cuando el organizador ES quien mira, aparece una vez, no dos.
  it("si el organizador es quien mira, no se duplica", () => {
    const orden = orderFollowers(seguidores, { viewerId: "org", organizerId: "org" });
    expect(orden.filter((f) => f.userId === "org")).toHaveLength(1);
    expect(orden[0].userId).toBe("org");
  });
});
