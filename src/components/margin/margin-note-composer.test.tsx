// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";

const createMarginNote = vi.fn().mockResolvedValue({ ok: true, id: "n1" });
vi.mock("@/lib/margin/actions", () => ({
  createMarginNote: (...a: unknown[]) => createMarginNote(...a),
}));
vi.mock("@/lib/margin/follower-search", () => ({
  searchMyFollowers: vi.fn().mockResolvedValue([]),
}));

import { MarginNoteComposer } from "./margin-note-composer";

// Sin `globals: true` la limpieza de testing-library no se registra sola.
afterEach(() => {
  cleanup();
  createMarginNote.mockClear();
});

function setup(props: Partial<React.ComponentProps<typeof MarginNoteComposer>> = {}) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <MarginNoteComposer itemType="book" itemId="b1" defaultPage={214} pages={400} {...props} />
    </NextIntlClientProvider>,
  );
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const save = () => fireEvent.click(screen.getByRole("button", { name: "Dejar la nota" }));

describe("MarginNoteComposer", () => {
  it("exige capítulo en libros", () => {
    setup();
    type("Tu nota", "aquí lloré");
    save();
    expect(createMarginNote).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Indica el capítulo");
  });

  it("muestra la pista de apertura y envía la nota general", async () => {
    setup();
    expect(screen.getByText(/hacia la p\. 226/)).toBeTruthy();
    type("Capítulo", "Cap. 12");
    type("Tu nota", "aquí lloré");
    save();
    await waitFor(() =>
      expect(createMarginNote).toHaveBeenCalledWith(
        expect.objectContaining({
          itemType: "book", itemId: "b1", page: 214, chapterLabel: "Cap. 12", body: "aquí lloré", recipientId: null,
        }),
      ),
    );
  });

  it("película: sin página ni capítulo, «al terminar»", () => {
    setup({ itemType: "movie", defaultPage: undefined, pages: undefined });
    expect(screen.queryByLabelText("Capítulo")).toBeNull();
    expect(screen.getByText("Se abrirá cuando terminen la obra")).toBeTruthy();
  });

  it("episodio: envía temporada y episodio, sin capítulo ni página", async () => {
    setup({ itemType: "series", defaultPage: undefined, pages: undefined, defaultEpisode: { season: 2, episode: 5 } });
    type("Tu nota", "qué final");
    save();
    await waitFor(() =>
      expect(createMarginNote).toHaveBeenCalledWith(
        expect.objectContaining({ itemType: "series", season: 2, episode: 5, chapterLabel: null, page: null }),
      ),
    );
  });

  it("«una persona» no deja guardar hasta elegir a alguien", () => {
    setup({ itemType: "movie", defaultPage: undefined, pages: undefined });
    fireEvent.click(screen.getByLabelText("Una persona"));
    const btn = screen.getByRole("button", { name: "Dejar la nota" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
