// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { Pass } from "@/lib/passes/types";
import type { Edition } from "@/lib/editions/types";
import { editionAskedStorageKey } from "@/lib/passes/edition-asked";

const actions = vi.hoisted(() => ({ setPassEdition: vi.fn() }));
vi.mock("@/lib/passes/actions", () => actions);
vi.mock("./edition-picker", () => ({
  EditionPicker: ({ onPick }: { onPick: (id: string) => void }) => (
    <button type="button" onClick={() => onPick("e2")}>picker</button>
  ),
}));
import { EditionChip } from "./edition-chip";

beforeEach(() => { window.localStorage.clear(); actions.setPassEdition.mockReset(); });
afterEach(cleanup);

const pass = (editionId: string | null): Pass => ({
  id: "p1", status: "in_progress", isActive: true, position: {}, startedOn: null, finishedOn: null, rating: null,
  review: null, reviewIsSpoiler: false, isPublic: false, editionId, pinnedOrder: null, droppedReason: null, droppedReasonNote: null,
});
const edition: Edition = {
  id: "e1", label: "Nocturna", publisher: null, year: 2016, language: "es", totalUnits: 412, isbn: null, coverUrl: null,
} as Edition;

function chip(p: Pass) {
  render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <EditionChip itemType="book" itemId="b1" openPass={p} passes={[p]} editions={[edition]} canContribute={false} />
    </NextIntlClientProvider>,
  );
}

describe("EditionChip", () => {
  it("con edición, la nombra", () => {
    chip(pass("e1"));
    expect(screen.getByRole("button", { name: "Nocturna · 412 p" })).toBeTruthy();
  });
  it("sin edición y con la pregunta contestada, dice «Elegir edición» y abre el selector al pulsar", () => {
    window.localStorage.setItem(editionAskedStorageKey("p1"), "1");
    chip(pass(null));
    expect(screen.queryByRole("button", { name: "picker" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Elegir edición" }));
    fireEvent.click(screen.getByRole("button", { name: "picker" }));
    expect(actions.setPassEdition).toHaveBeenCalledWith("p1", "book", "b1", "e2");
  });
});
