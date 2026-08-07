import { describe, expect, it, vi } from "vitest";
import { getFeed } from "./feed";
import { fakeSupabase, FAKE_ACTOR_ID, FAKE_ITEM_ID, FAKE_SAGA_ID } from "./fake-feed-supabase";

// Task 3.3: thoughts como 6ª fuente del feed (on-read fan-out, ver feed.ts).
// Un pensamiento es del actor seguido (o del propio visitante — la query usa
// `followedIds`, no `addedActorIds`, así que a diferencia de "added" SÍ
// aparece en tu propio Inicio).

describe("getFeed incluye pensamientos (6ª fuente)", () => {
  it("un pensamiento con ancla de catálogo produce un evento verb:thought", async () => {
    const fake = fakeSupabase({
      thoughts: [
        {
          id: "thought-1",
          body: "Menudo giro en el capítulo final",
          is_spoiler: true,
          created_at: "2026-08-01T10:00:00.000+00:00",
        },
      ],
    });
    const page = await getFeed(fake.client, "viewer-1");

    expect(page.events).toHaveLength(1);
    const entry = page.events[0];
    expect(entry.source).toBe("person");
    if (entry.source !== "person") throw new Error("expected person entry");
    expect(entry.event.verb).toBe("thought");
    expect(entry.event.thought).not.toBeNull();
    expect(entry.event.thought?.body).toBe("Menudo giro en el capítulo final");
    expect(entry.event.thought?.isSpoiler).toBe(true);
    expect(entry.event.thought?.anchor.type).toBe("book");
    expect(entry.event.thought?.anchor.id).toBe(FAKE_ITEM_ID);
    expect(entry.event.thought?.anchor.title).toBe("Título");
    expect(entry.event.interactionTarget?.targetType).toBe("thought");
    expect(entry.event.interactionTarget?.targetId).toBe("thought-1");
  });

  it("resuelve el ancla saga vía el batch de sagas/people", async () => {
    const fake = fakeSupabase({
      thoughts: [
        {
          id: "thought-saga",
          anchor_type: "saga",
          anchor_id: FAKE_SAGA_ID,
          body: "Esta saga entera es un viaje",
          created_at: "2026-08-01T10:00:00.000+00:00",
        },
      ],
    });
    const page = await getFeed(fake.client, "viewer-1");

    expect(page.events).toHaveLength(1);
    const entry = page.events[0];
    if (entry.source !== "person") throw new Error("expected person entry");
    expect(entry.event.thought?.anchor).toEqual({
      type: "saga",
      id: FAKE_SAGA_ID,
      title: "Saga",
      imageUrl: null,
      subtitle: null,
    });
  });

  it("descarta el pensamiento si su ancla no resuelve (entidad borrada)", async () => {
    const fake = fakeSupabase({
      thoughts: [
        {
          id: "thought-huerfano",
          anchor_type: "book",
          anchor_id: "book-borrado",
          created_at: "2026-08-01T10:00:00.000+00:00",
        },
      ],
    });
    const page = await getFeed(fake.client, "viewer-1");
    expect(page.events).toHaveLength(0);
  });

  it("v1: los pensamientos NO aparecen bajo un filtro de pantalla (book/screen/reviews/clubs)", async () => {
    const fake = fakeSupabase({
      thoughts: [{ id: "thought-1", created_at: "2026-08-01T10:00:00.000+00:00" }],
    });
    const page = await getFeed(fake.client, "viewer-1", { filter: "book" });
    expect(page.events.every((e) => e.source !== "person" || e.event.verb !== "thought")).toBe(
      true,
    );
  });

  it("no se agrupa con otros eventos del mismo actor (como los clubs)", async () => {
    const fake = fakeSupabase({
      added: [{ id: "alta-1", created_at: "2026-08-01T09:00:00.000+00:00" }],
      thoughts: [{ id: "thought-1", created_at: "2026-08-01T09:30:00.000+00:00" }],
    });
    const page = await getFeed(fake.client, "viewer-1");
    // Si se agrupara, saldría un único "person-group"; deben ser dos entradas.
    expect(page.events.filter((e) => e.source === "person-group")).toHaveLength(0);
    expect(page.events).toHaveLength(2);
  });

  it("las menciones del cuerpo de un pensamiento entran en knownUsernames", async () => {
    const fake = fakeSupabase({
      thoughts: [
        {
          id: "thought-1",
          body: "hola @actor", // "actor" es el username por defecto del fixture
          created_at: "2026-08-01T10:00:00.000+00:00",
        },
      ],
    });
    const page = await getFeed(fake.client, "viewer-1");
    expect(page.knownUsernames).toContain("actor");
  });

  it("task-delete #525: un pensamiento propio lleva viewerCanDelete:true", async () => {
    const fake = fakeSupabase({
      thoughts: [{ id: "thought-1", created_at: "2026-08-01T10:00:00.000+00:00" }],
    });
    // El thought de fixture ya sale con user_id: FAKE_ACTOR_ID -- verlo como
    // ese mismo actor es "es mi propio pensamiento", sin depender del RPC de
    // moderación (que el stub de fakeSupabase deja en `[]`).
    const page = await getFeed(fake.client, FAKE_ACTOR_ID);
    const entry = page.events[0];
    if (entry.source !== "person") throw new Error("expected person entry");
    expect(entry.event.viewerCanDelete).toBe(true);
  });

  it("un pensamiento ajeno sin moderación lleva viewerCanDelete:false", async () => {
    const fake = fakeSupabase({
      thoughts: [{ id: "thought-1", created_at: "2026-08-01T10:00:00.000+00:00" }],
    });
    // El viewer sigue al actor (mismo fixture de follows) pero no es su
    // propio pensamiento y el RPC de moderación (stub) no devuelve nada.
    const page = await getFeed(fake.client, "viewer-1");
    const entry = page.events[0];
    if (entry.source !== "person") throw new Error("expected person entry");
    expect(entry.event.viewerCanDelete).toBe(false);
  });

  it("sin viewer (feed anónimo) no llama al RPC de moderación y deja viewerCanDelete sin definir", async () => {
    const fake = fakeSupabase({
      thoughts: [{ id: "thought-1", created_at: "2026-08-01T10:00:00.000+00:00" }],
    });
    // El stub por defecto de `rpc` en fake-feed-supabase.ts devuelve `[]` para
    // CUALQUIER llamada, así que un `viewerCanDelete` undefined por sí solo no
    // prueba que el RPC se saltara -- se sustituye por un espía local (sin
    // tocar el fixture compartido) para afirmar la llamada, no solo el
    // resultado.
    const rpcSpy = vi.fn(async () => ({ data: [], error: null }));
    (fake.client as unknown as { rpc: typeof rpcSpy }).rpc = rpcSpy;
    const page = await getFeed(fake.client, null, { actorId: FAKE_ACTOR_ID });
    const entry = page.events[0];
    if (entry.source !== "person") throw new Error("expected person entry");
    expect(entry.event.viewerCanDelete).toBeUndefined();
    expect(rpcSpy).not.toHaveBeenCalled();
  });
});
