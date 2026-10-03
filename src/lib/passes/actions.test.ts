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
      if (table === "passes" || table === "pass_reviews") {
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

// A prerequisite read is not optional: these tests must distinguish the two
// selects from the later update, otherwise a failing read can silently become
// an empty row in a fake client.
function makePrerequisiteFailureClient(failingSelect: "started_on, finished_on, status" | "review") {
  const updates: Array<Record<string, unknown>> = [];
  const selected: string[] = [];
  let columns = "";
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "author" } } }) },
    from(table: string) {
      if (table === "passes" || table === "pass_reviews") {
        const builder = {
          select(next: string) {
            columns = next;
            selected.push(next);
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
            if (columns === failingSelect) return { data: null, error: { message: "prerequisite unavailable" } };
            return { data: { started_on: null, finished_on: null, status: "completed", review: "hola @ana" }, error: null };
          },
          then(resolve: (value: unknown) => void) {
            resolve({ error: null });
          },
        };
        return builder;
      }
      if (table === "interaction_targets") {
        const builder = {
          select() { return builder; },
          eq() { return builder; },
          async maybeSingle() { return { data: { id: "target-diary" }, error: null }; },
        };
        return builder;
      }
      throw new Error(`Tabla inesperada: ${table}`);
    },
  };
  return { client, updates, selected };
}

// passes permite escribir reseñas, pero su SELECT está revocado: la lectura
// filtrada por privacidad vive en pass_reviews. Un doble que acepta cualquier
// SELECT no detectaría que editar aborta antes de llegar al UPDATE.
function makeReviewPrivacyClient() {
  type Filters = Array<[string, unknown]>;
  const reads: Array<{ table: string; columns: string; filters: Filters }> = [];
  const updates: Array<{ payload: Record<string, unknown>; filters: Filters }> = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "author" } } }) },
    from(table: string) {
      let columns = "";
      const filters: Filters = [];
      const builder = {
        select(value: string) {
          columns = value;
          return builder;
        },
        update(payload: Record<string, unknown>) {
          if (table !== "passes") throw new Error(`UPDATE inesperado: ${table}`);
          updates.push({ payload, filters });
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return builder;
        },
        async maybeSingle() {
          reads.push({ table, columns, filters });
          if (table === "passes") {
            if (columns.split(",").some((column) => column.trim() === "review")) {
              return { data: null, error: { code: "42501", message: "permission denied for table passes" } };
            }
            return { data: { started_on: "2026-07-01", finished_on: "2026-07-20", status: "completed" }, error: null };
          }
          if (table === "pass_reviews") return { data: { review: "hola @ana" }, error: null };
          if (table === "interaction_targets") return { data: { id: "target-diary" }, error: null };
          throw new Error(`Tabla inesperada: ${table}`);
        },
        then(resolve: (value: unknown) => void) {
          resolve({ error: null });
        },
      };
      return builder;
    },
  };
  return { client, reads, updates };
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

describe("lecturas prerequisito de pases (#1110)", () => {
  it("no cierra ni publica efectos si no puede leer la fecha de inicio", async () => {
    const fake = makePrerequisiteFailureClient("started_on, finished_on, status");
    mocks.createClient.mockResolvedValue(fake.client);

    await expect(closePass("pass-1", "book", "book-1", {}, publicReviewForm())).resolves.toEqual({ error: "generic" });

    expect(fake.selected).toEqual(["started_on, finished_on, status"]);
    expect(fake.updates).toEqual([]);
    expect(mocks.notifyMentions).not.toHaveBeenCalled();
    expect(mocks.revalidateReadingLog).not.toHaveBeenCalled();
  });

  it("no edita ni re-notifica si no puede leer la reseña previa", async () => {
    const fake = makePrerequisiteFailureClient("review");
    mocks.createClient.mockResolvedValue(fake.client);

    await expect(updatePass("pass-1", "book", "book-1", {}, publicReviewForm())).resolves.toEqual({ error: "generic" });

    expect(fake.selected).toEqual(["review"]);
    expect(fake.updates).toEqual([]);
    expect(mocks.notifyMentions).not.toHaveBeenCalled();
    expect(mocks.revalidateReadingLog).not.toHaveBeenCalled();
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
      usernames: undefined,
      isSpoiler: false,
    });
  });

  it("una reseña marcada spoiler avisa como spoiler (el aviso no guarda extracto)", async () => {
    const fake = makePassClient("target-diary");
    mocks.createClient.mockResolvedValue(fake.client);
    const form = publicReviewForm();
    form.set("reviewIsSpoiler", "on");

    await closePass("pass-1", "book", "book-1", {}, form);

    expect(mocks.notifyMentions).toHaveBeenCalledWith(
      fake.client,
      expect.objectContaining({ text: "hola @ana", isSpoiler: true }),
    );
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
  it("edita con los permisos de privacidad y notifica solo la mención añadida", async () => {
    const fake = makeReviewPrivacyClient();
    mocks.createClient.mockResolvedValue(fake.client);
    const form = publicReviewForm();
    form.set("rating", "8");
    form.set("review", "hola @ana, gracias a @borja");
    form.set("reviewIsSpoiler", "on");

    await expect(updatePass("party-pass", "movie", "movie-1", {}, form)).resolves.toEqual({});

    expect(fake.reads[0]).toEqual({
      table: "pass_reviews",
      columns: "review",
      filters: [["id", "party-pass"], ["user_id", "author"]],
    });
    expect(fake.updates).toEqual([{
      payload: {
        finished_on: "2026-07-30",
        rating: 8,
        review: "hola @ana, gracias a @borja",
        review_is_spoiler: true,
        is_public: true,
        dropped_reason: null,
        dropped_reason_note: null,
      },
      filters: [["id", "party-pass"], ["user_id", "author"]],
    }]);
    expect(mocks.notifyMentions).toHaveBeenCalledWith(fake.client, {
      authorId: "author",
      text: "hola @ana, gracias a @borja",
      interactionTargetId: "target-diary",
      usernames: ["borja"],
      isSpoiler: true,
    });
    expect(mocks.revalidateReadingLog).toHaveBeenCalledWith("movie", "movie-1");
  });

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
      isSpoiler: false,
    });
  });
});

describe("savePassFields — reseña con spoiler", () => {
  it("guarda la marca cuando hay reseña", async () => {
    const { client, updates } = makeRecordingClient(null);
    mocks.createClient.mockResolvedValue(client);
    const form = closeForm("2026-07-30");
    form.set("review", "el mayordomo lo hizo");
    form.set("reviewIsSpoiler", "on");

    await updatePass("pass-1", "book", "book-1", {}, form);

    expect(updates[0]).toMatchObject({ review: "el mayordomo lo hizo", review_is_spoiler: true });
  });

  it("sin reseña la marca se apaga aunque el formulario la mande", async () => {
    const { client, updates } = makeRecordingClient(null);
    mocks.createClient.mockResolvedValue(client);
    const form = closeForm("2026-07-30");
    form.set("review", "   ");
    form.set("reviewIsSpoiler", "on");

    await updatePass("pass-1", "book", "book-1", {}, form);

    expect(updates[0]).toMatchObject({ review: null, review_is_spoiler: false });
  });
});
