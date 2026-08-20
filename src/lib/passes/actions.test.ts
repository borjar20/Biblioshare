import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
  notifyMentions: vi.fn(),
  revalidateReadingLog: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/social/notify-mentions", () => ({ notifyMentions: mocks.notifyMentions }));
vi.mock("@/lib/reactivity/revalidate", () => ({
  revalidateReadingLog: mocks.revalidateReadingLog,
}));

import { closePass, updatePass } from "./actions";
import { parseDroppedReason } from "./types";

function makePassClient(
  targetId: string | null,
  targetError: unknown = null,
  existingReview: string | null = null,
) {
  const targetFilters: Array<[string, unknown]> = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "author" } } }) },
    from(table: string) {
      if (table === "passes") {
        const builder = {
          select() {
            return builder;
          },
          update() {
            return builder;
          },
          eq() {
            return builder;
          },
          async maybeSingle() {
            return { data: existingReview !== null ? { review: existingReview } : null, error: null };
          },
          then(resolve: (value: unknown) => void) {
            resolve({ error: null });
          },
        };
        return builder;
      }
      if (table === "interaction_targets") {
        const builder = {
          select() {
            return builder;
          },
          eq(column: string, value: unknown) {
            targetFilters.push([column, value]);
            return builder;
          },
          async maybeSingle() {
            return {
              data: targetId ? { id: targetId } : null,
              error: targetError,
            };
          },
        };
        return builder;
      }
      throw new Error(`Tabla inesperada: ${table}`);
    },
  };
  return { client, targetFilters };
}

function publicReviewForm() {
  const form = new FormData();
  form.set("finishedOn", "2026-07-30");
  form.set("review", "hola @ana");
  form.set("isPublic", "on");
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notifyMentions.mockResolvedValue([]);
});

// Cliente que RECUERDA lo que se le manda en el update, para poder afirmar sobre
// el payload y no solo sobre "no hubo error".
function makeRecordingClient(startedOn: string | null) {
  const updates: Array<Record<string, unknown>> = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "author" } } }) },
    from(table: string) {
      if (table === "passes") {
        const builder = {
          select() {
            return builder;
          },
          update(payload: Record<string, unknown>) {
            updates.push(payload);
            return builder;
          },
          eq() {
            return builder;
          },
          async maybeSingle() {
            return { data: { started_on: startedOn, review: null }, error: null };
          },
          then(resolve: (value: unknown) => void) {
            resolve({ error: null });
          },
        };
        return builder;
      }
      // Sin fila en interaction_targets no hay menciones que notificar: aquí no
      // es lo que se prueba.
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        async maybeSingle() {
          return { data: null, error: null };
        },
      };
      return builder;
    },
  };
  return { client, updates };
}

function closeForm(finishedOn: string) {
  const form = new FormData();
  form.set("finishedOn", finishedOn);
  return form;
}

// #729: 167 de los 407 pases de producción tenían la fecha de inicio POSTERIOR a
// la de fin. La puerta era esta: cerrar hoy una obra leída hace años, con un
// `started_on` que la máquina había puesto el día del alta.
describe("closePass — fecha de fin anterior al inicio (#729)", () => {
  it("cerrar con una fecha anterior al inicio pone started_on a null", async () => {
    const { client, updates } = makeRecordingClient("2026-08-14");
    mocks.createClient.mockResolvedValue(client);

    await closePass("pass-1", "book", "book-1", {}, closeForm("2015-07-22"));

    expect(updates[0]).toMatchObject({ finished_on: "2015-07-22", started_on: null });
  });

  it("no toca started_on cuando las fechas van en orden", async () => {
    const { client, updates } = makeRecordingClient("2026-08-01");
    mocks.createClient.mockResolvedValue(client);

    await closePass("pass-1", "book", "book-1", {}, closeForm("2026-08-14"));

    // Ni siquiera aparece la clave: lo que no se toca, no se escribe.
    expect(updates[0]).not.toHaveProperty("started_on");
  });

  it("no toca started_on si el pase no tenía fecha de inicio", async () => {
    const { client, updates } = makeRecordingClient(null);
    mocks.createClient.mockResolvedValue(client);

    await closePass("pass-1", "book", "book-1", {}, closeForm("2015-07-22"));

    expect(updates[0]).not.toHaveProperty("started_on");
  });

  it("mismo día no es inversión: se conserva", async () => {
    const { client, updates } = makeRecordingClient("2026-08-14");
    mocks.createClient.mockResolvedValue(client);

    await closePass("pass-1", "book", "book-1", {}, closeForm("2026-08-14"));

    expect(updates[0]).not.toHaveProperty("started_on");
  });
});

describe("parseDroppedReason", () => {
  it("vacío → null (motivo opcional)", () => {
    expect(parseDroppedReason(null)).toBeNull();
    expect(parseDroppedReason("")).toBeNull();
  });

  it("categoría válida → se conserva", () => {
    expect(parseDroppedReason("aburrido")).toBe("aburrido");
  });

  it("valor fuera de la lista → undefined (inválido)", () => {
    expect(parseDroppedReason("no_existe")).toBeUndefined();
  });
});

describe("closePass — menciones", () => {
  it("resuelve exactamente diary_entry:<passId>", async () => {
    const fake = makePassClient("target-diary");
    mocks.createClient.mockResolvedValue(fake.client);

    await closePass("pass-1", "book", "book-1", {}, publicReviewForm());

    expect(fake.targetFilters).toEqual([
      ["kind", "diary_entry"],
      ["source_id", "pass-1"],
    ]);
    expect(mocks.notifyMentions).toHaveBeenCalledWith(fake.client, {
      authorId: "author",
      text: "hola @ana",
      interactionTargetId: "target-diary",
    });
  });

  it("conserva el pase y revalida si la resolución del target falla", async () => {
    const fake = makePassClient(null, { message: "lookup failed" });
    mocks.createClient.mockResolvedValue(fake.client);

    await expect(
      closePass("pass-1", "book", "book-1", {}, publicReviewForm()),
    ).resolves.toEqual({});

    expect(mocks.notifyMentions).not.toHaveBeenCalled();
    expect(mocks.revalidateReadingLog).toHaveBeenCalledWith("book", "book-1");
  });
});

describe("updatePass — menciones (issue #317)", () => {
  it("misma mención en ambas versiones → no re-notifica", async () => {
    const fake = makePassClient("target-diary", null, "hola @ana");
    mocks.createClient.mockResolvedValue(fake.client);

    const form = new FormData();
    form.set("finishedOn", "2026-07-30");
    form.set("review", "hola @ana, releído");
    form.set("isPublic", "on");

    await updatePass("pass-1", "book", "book-1", {}, form);

    expect(mocks.notifyMentions).not.toHaveBeenCalled();
  });

  it("mención nueva en la versión editada → notifica solo la nueva", async () => {
    const fake = makePassClient("target-diary", null, "gran libro");
    mocks.createClient.mockResolvedValue(fake.client);

    const form = new FormData();
    form.set("finishedOn", "2026-07-30");
    form.set("review", "gran libro, gracias a @borja");
    form.set("isPublic", "on");

    await updatePass("pass-1", "book", "book-1", {}, form);

    expect(mocks.notifyMentions).toHaveBeenCalledWith(fake.client, {
      authorId: "author",
      text: "gran libro, gracias a @borja",
      interactionTargetId: "target-diary",
      usernames: ["borja"],
    });
  });
});
