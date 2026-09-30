// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Note } from "@/lib/notes/types";
import { NotesSection } from "./notes-section";

vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("./note-card", () => ({ NoteCard: ({ note }: { note: Note }) => <article>{note.body}</article> }));

afterEach(() => cleanup());

const note = (id: string, body: string, page: number): Note => ({
  id,
  itemType: "book",
  itemId: "book-1",
  kind: "note",
  body,
  position: { page },
  isFavorite: false,
  tags: [],
  isSpoiler: false,
  isPublic: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  itemTitle: null,
});

describe("NotesSection", () => {
  it("resuelve la promesa recibida y conserva el orden de lectura", async () => {
    render(await NotesSection({
      itemType: "book",
      notesPromise: Promise.resolve([note("late", "late", 20), note("early", "early", 2)]),
    }));

    expect(screen.getAllByRole("article").map((item) => item.textContent)).toEqual(["early", "late"]);
  });

  it("muestra el estado vacío con una promesa de notas vacía", async () => {
    render(await NotesSection({
      itemType: "book", notesPromise: Promise.resolve([]),
    }));

    expect(screen.getByText("sectionEmpty")).toBeTruthy();
  });

  it("propaga el fallo de la consulta entregada por la ficha", async () => {
    const rejected = Promise.reject(new Error("offline"));
    // Igual que la ficha: manejar pronto el aviso no cambia esta promesa.
    void rejected.catch(() => undefined);
    await expect(NotesSection({
      itemType: "book", notesPromise: rejected,
    })).rejects.toThrow("offline");
  });
});
