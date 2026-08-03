import { describe, expect, it } from "vitest";
import { getFeed } from "./feed";
import { fakeSupabase, FAKE_ACTOR_ID } from "./fake-feed-supabase";

// El feed de Inicio se alimentaba SOLO de `follows`, que por construcción nunca
// te devuelve a ti mismo (`follower_id = viewerId`): tu propia actividad no
// salía en tu Inicio. El visitante entra ahora como una fuente más — salvo en
// las ALTAS, que se quedan fuera para que un import en masa no ocupe la primera
// página entera (ver el comentario de `addedActorIds` en feed.ts).
//
// Se afirma sobre el filtro `user_id` emitido, no sobre las filas: el doble no
// aplica `.in()` al servir (ver `inFilters` en fake-feed-supabase.ts), así que
// una comprobación sobre el resultado pasaría igual sin el arreglo.

const OWN_SOURCES = ["diary", "progress_sessions", "episode_watches"] as const;

describe("el feed personal incluye tus propios eventos", () => {
  it("pide los eventos del visitante además de los de sus seguidos", async () => {
    const fake = fakeSupabase();
    await getFeed(fake.client, "viewer-1");

    for (const source of OWN_SOURCES) {
      expect(fake.inFilters[source]?.user_id, source).toEqual(
        expect.arrayContaining(["viewer-1", FAKE_ACTOR_ID]),
      );
    }
  });

  it("deja tus propias altas fuera: un import en masa taparía el resto del feed", async () => {
    const fake = fakeSupabase();
    await getFeed(fake.client, "viewer-1");

    expect(fake.inFilters.added?.user_id).toEqual([FAKE_ACTOR_ID]);
  });

  it("el feed de un actor sigue sirviendo SOLO sus eventos, altas incluidas", async () => {
    const fake = fakeSupabase();
    await getFeed(fake.client, "viewer-1", { actorId: FAKE_ACTOR_ID });

    for (const source of [...OWN_SOURCES, "added"] as const) {
      expect(fake.inFilters[source]?.user_id, source).toEqual([FAKE_ACTOR_ID]);
    }
  });
});
