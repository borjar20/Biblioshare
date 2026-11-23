// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { ItemType } from "@/lib/catalog/types";
import type { Pass } from "@/lib/passes/types";
import { ItemStatusProvider } from "./item-status-context";

vi.mock("./pass-actions-provider", () => ({ usePassActions: () => ({ isPending: false, newPass: vi.fn() }) }));
vi.mock("./edition-chip", () => ({ EditionChip: () => <button type="button">Elegir versión</button> }));
import { PassLogHead } from "./pass-log-head";

afterEach(cleanup);

const open: Pass = {
  id: "p1", status: "in_progress", isActive: true, position: {}, startedOn: null, finishedOn: null,
  rating: null, review: null, reviewIsSpoiler: false, isPublic: false, editionId: null,
  pinnedOrder: null, droppedReason: null, droppedReasonNote: null,
};

function renderHead(itemType: ItemType, canContribute: boolean) {
  render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <ItemStatusProvider initialStatus="in_progress">
        <PassLogHead itemType={itemType} itemId="i1" entryStatus="in_progress" passes={[open]} editions={[]} canContribute={canContribute} />
      </ItemStatusProvider>
    </NextIntlClientProvider>,
  );
}

describe("PassLogHead", () => {
  it("una película sin versiones y sin permiso para aportar no ofrece elegir versión", () => {
    renderHead("movie", false);
    expect(screen.queryByRole("button", { name: "Elegir versión" })).toBeNull();
  });
  it("una película con permiso para aportar sí la ofrece; un libro sin ediciones también", () => {
    renderHead("movie", true);
    expect(screen.getByRole("button", { name: "Elegir versión" })).toBeTruthy();
    cleanup();
    renderHead("book", false);
    expect(screen.getByRole("button", { name: "Elegir versión" })).toBeTruthy();
  });
});
