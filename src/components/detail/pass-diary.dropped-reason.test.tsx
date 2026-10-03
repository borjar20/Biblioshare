// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";
import { DROPPED_REASONS, type Pass } from "@/lib/passes/types";
import { PassDiary } from "./pass-diary";

// Las acciones importan Supabase/Next de servidor. El diario y todos sus
// componentes de presentación, hooks e Intl siguen siendo reales.
const actions = vi.hoisted(() => ({
  updatePass: vi.fn(),
  deletePass: vi.fn(),
  searchMentionCandidates: vi.fn(),
  loadJointViewingsForPasses: vi.fn().mockResolvedValue({}),
  loadJointViewingOptions: vi.fn(),
  createJointViewing: vi.fn(),
  leaveJointViewing: vi.fn(),
  fetch: vi.fn(() => { throw new Error("Red real fuera del alcance de #655"); }),
}));

vi.mock("@/lib/passes/actions", () => ({
  updatePass: actions.updatePass,
  deletePass: actions.deletePass,
}));
vi.mock("@/lib/social/mention-search", () => ({
  searchMentionCandidates: actions.searchMentionCandidates,
}));
vi.mock("@/lib/social/joint-viewing-actions", () => ({
  loadJointViewingsForPasses: actions.loadJointViewingsForPasses,
  loadJointViewingOptions: actions.loadJointViewingOptions,
  createJointViewing: actions.createJointViewing,
  leaveJointViewing: actions.leaveJointViewing,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", actions.fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // En modo lectura sólo un pase completed carga el mapa conjunto controlado.
  for (const [name, action] of Object.entries(actions)) {
    if (name !== "loadJointViewingsForPasses") expect(action).not.toHaveBeenCalled();
  }
});

const base: Pass = {
  id: "pass-655",
  status: "dropped",
  isActive: false,
  position: {},
  startedOn: "2026-09-01",
  finishedOn: "2026-10-02",
  rating: null,
  review: null,
  reviewIsSpoiler: false,
  isPublic: false,
  editionId: null,
  pinnedOrder: null,
  droppedReason: null,
  droppedReasonNote: null,
};

const otherNote = [
  "Empecé esta lectura durante un viaje y tuve que devolver el ejemplar antes de acabar.",
  "La biblioteca tardará varias semanas en traerlo de nuevo y prefiero retomarlo con calma.",
  "También quiero comentar el capítulo pendiente con mi grupo para recordar todos los detalles.",
  "No lo dejé por aburrimiento: me interesaban los personajes y la forma de contar su historia.",
  "Cuando vuelva a tener el libro continuaré desde el mismo punto, sin perder esta explicación final.",
].join(" ");

async function renderDiary(overrides: Partial<Pass> = {}) {
  await act(async () => {
    render(
      <NextIntlClientProvider locale="es" timeZone="UTC" messages={messages}>
        <PassDiary itemType="book" itemId="book-655" passes={[{ ...base, ...overrides }]} editions={[]} />
      </NextIntlClientProvider>,
    );
  });
  const card = screen.getByTestId("diary-entry");
  // Las categorías deben estar en la tarjeta de lectura, nunca en el editor.
  expect(card.querySelector("form")).toBeNull();
  return card;
}

describe("PassDiary — motivo de abandono en modo lectura (#655)", () => {
  it.each(DROPPED_REASONS)("dropped con %s muestra su chip traducido", async (reason) => {
    const card = await renderDiary({ droppedReason: reason });
    const chip = within(card).getByText(messages.passes.droppedReason.options[reason]);
    expect(chip.matches("span.rounded-chip")).toBe(true);
    expect(card.querySelectorAll(".rounded-chip")).toHaveLength(1);
  });

  it("dropped con otro muestra la nota larga completa sin truncar", async () => {
    const card = await renderDiary({ droppedReason: "otro", droppedReasonNote: otherNote });
    expect(within(card).getByText(messages.passes.droppedReason.options.otro)).toBeTruthy();
    const note = within(card).getByText(otherNote);
    expect(note.tagName).toBe("P");
    expect(note.textContent).toBe(otherNote);
    expect(note.className).not.toMatch(/(?:^|\s)(?:truncate|line-clamp-\d+)(?:\s|$)/);
  });

  it("dropped sin motivo no muestra ningún chip", async () => {
    const card = await renderDiary();
    expect(card.querySelector(".rounded-chip")).toBeNull();
    for (const label of Object.values(messages.passes.droppedReason.options)) {
      expect(within(card).queryByText(label)).toBeNull();
    }
  });

  it("completed con motivo y nota residuales no muestra el chip ni la nota", async () => {
    const card = await renderDiary({
      status: "completed",
      droppedReason: "otro",
      droppedReasonNote: otherNote,
    });
    expect(card.querySelector(".rounded-chip")).toBeNull();
    expect(within(card).queryByText(messages.passes.droppedReason.options.otro)).toBeNull();
    expect(within(card).queryByText(otherNote)).toBeNull();
    expect(actions.loadJointViewingsForPasses).toHaveBeenCalledWith([base.id]);
  });
});
