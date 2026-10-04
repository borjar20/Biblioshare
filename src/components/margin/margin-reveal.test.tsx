// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";

const markMarginSeen = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/margin/actions", () => ({
  markMarginSeen: (...a: unknown[]) => markMarginSeen(...a),
  deleteMarginNote: vi.fn(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import { MarginReveal } from "./margin-reveal";
import type { MarginNoteView } from "@/lib/margin/types";

afterEach(() => {
  cleanup();
  markMarginSeen.mockClear();
});

const note = (id: string): MarginNoteView => ({
  noteId: `n${id}`, itemType: "book", itemId: "b", anchor: { kind: "ratio", ratio: 0.5, page: 200, pages: 400 },
  chapterLabel: "Cap. 12", body: `nota ${id}`, isSpoiler: false, audience: "followers", createdAt: "2026-10-04T00:00:00Z",
  author: { id: "a", username: "lucia", displayName: "Lucía", avatarUrl: null },
  encounter: { id: `e${id}`, foundAt: "2026-10-04T00:00:00Z", foundVia: "progress", seenAt: null },
  foundBy: null, recipient: null,
});

function setup(notes: MarginNoteView[]) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <MarginReveal notes={notes} />
    </NextIntlClientProvider>,
  );
}

describe("MarginReveal", () => {
  it("no pinta nada sin notas nuevas", () => {
    const { container } = setup([]);
    expect(container.innerHTML).toBe("");
  });
  it("anuncia y marca como vistas al cerrar", () => {
    setup([note("1"), note("2")]);
    expect(screen.getByRole("dialog", { name: "Has encontrado 2 notas en el margen" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Seguir" }));
    expect(markMarginSeen).toHaveBeenCalledWith(["e1", "e2"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
