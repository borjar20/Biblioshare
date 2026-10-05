// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";

vi.mock("@/lib/margin/actions", () => ({ deleteMarginNote: vi.fn(), markMarginSeen: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import { MarginNoteCard } from "./margin-note-card";
import type { MarginNoteView } from "@/lib/margin/types";

afterEach(cleanup);

const base: MarginNoteView = {
  noteId: "n1", itemType: "book", itemId: "b", anchor: { kind: "ratio", ratio: 0.5, page: 200, pages: 400 },
  chapterLabel: "Cap. 12", body: "hola", isSpoiler: false, audience: "followers", createdAt: "2026-10-04T00:00:00Z",
  author: { id: "a", username: "lucia", displayName: "Lucía", avatarUrl: null },
  encounter: null, foundBy: null, recipient: null,
};

const text = (note: MarginNoteView) =>
  render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <MarginNoteCard note={note} />
    </NextIntlClientProvider>,
  ).container.textContent ?? "";

describe("MarginNoteCard", () => {
  it("ratio: capítulo y página", () => {
    expect(text(base)).toContain("Cap. 12 · p. 200 en su edición");
  });
  it("episodio", () => {
    expect(text({ ...base, anchor: { kind: "episode", season: 2, episode: 5 } })).toContain("T2 · E5");
  });
  it("al terminar", () => {
    expect(text({ ...base, anchor: { kind: "finish" } })).toContain("Al terminar");
  });
  it("Para ti vs Para {nombre}", () => {
    const enc = { id: "e1", foundAt: "x", foundVia: "progress" as const, seenAt: null };
    expect(text({ ...base, audience: "person", encounter: enc })).toContain("Para ti");
    cleanup();
    const recipient = { id: "r", username: "marta", displayName: null, avatarUrl: null };
    expect(text({ ...base, audience: "person", recipient, foundBy: [] })).toContain("Para marta");
  });
  it("foundBy: lista con enlaces, o nadie", () => {
    const reader = (u: string) => ({ id: u, username: u, displayName: null, avatarUrl: null });
    const out = render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <MarginNoteCard
          note={{ ...base, foundBy: [{ encounterId: "e1", reader: reader("ana") }, { encounterId: "e2", reader: reader("pepe") }] }}
        />
      </NextIntlClientProvider>,
    );
    expect(out.container.textContent).toContain("La encontraron: ana, pepe");
    expect(out.container.querySelector('a[href="/margen/e2"]')).not.toBeNull();
    cleanup();
    expect(text({ ...base, foundBy: [] })).toContain("Nadie la ha encontrado todavía");
  });
  it("hideOwnActions: el hilo no ofrece borrar la nota (no sabría contar las conversaciones)", () => {
    const own = { ...base, foundBy: [{ encounterId: "e1", reader: { id: "r", username: "ana", displayName: null, avatarUrl: null } }] };
    const { container, unmount } = render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <MarginNoteCard note={own} hideOwnActions />
      </NextIntlClientProvider>,
    );
    expect(container.textContent).not.toContain("Borrar");
    unmount();
    expect(text(own)).toContain("Borrar");
  });
});
