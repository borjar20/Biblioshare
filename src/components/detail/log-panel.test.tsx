// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { MediaStatus } from "@/lib/library/types";
import type { Pass } from "@/lib/passes/types";
import { ItemStatusProvider } from "./item-status-context";

// Mi registro es solo historial (spec 2026-11-10-ficha-acciones): el estado y
// sus hojas viven en la tarjeta y en PassActionsProvider. Aquí se comprueba que
// el panel no los vuelve a pintar y que «Nuevo pase» delega en el proveedor.
const actions = vi.hoisted(() => ({
  isPending: false,
  error: null,
  addWith: vi.fn(),
  changeStatus: vi.fn(),
  runPrimary: vi.fn(),
  newPass: vi.fn(),
  rate: vi.fn(),
}));
vi.mock("./pass-actions-provider", () => ({ usePassActions: () => actions }));
vi.mock("@/lib/library/manage-actions", () => ({ updateStatus: vi.fn(), removeFromLibrary: vi.fn() }));
vi.mock("@/lib/passes/actions", () => ({ ratePass: vi.fn(), setPassEdition: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/components/session-list", () => ({ SessionList: () => null }));
vi.mock("@/components/notes/note-form", () => ({ NoteForm: () => null }));
vi.mock("@/components/detail/pass-diary", () => ({ PassDiary: () => null }));
vi.mock("@/components/detail/edition-picker", () => ({ EditionPicker: () => null }));
vi.mock("@/components/library/add-to-collection-sheet", () => ({ AddToCollectionSheet: () => null }));
// Si el panel volviera a importar sus hojas, pintarían un <dialog>.
vi.mock("@/components/detail/close-pass-sheet", () => ({ ClosePassSheet: () => <dialog open /> }));
vi.mock("@/components/detail/resume-pass-sheet", () => ({ ResumePassSheet: () => <dialog open /> }));
vi.mock("@/components/detail/new-pass-sheet", () => ({ NewPassSheet: () => <dialog open /> }));
import { LogPanel } from "./log-panel";

beforeEach(() => {
  actions.isPending = false;
  actions.newPass.mockReset();
});
afterEach(cleanup);

function pass(status: MediaStatus): Pass {
  return {
    id: "p1", status, isActive: true, position: {}, startedOn: null, finishedOn: null,
    rating: null, review: null, reviewIsSpoiler: false, isPublic: false, editionId: null,
    pinnedOrder: null, droppedReason: null, droppedReasonNote: null,
  };
}

function renderLog({ status = "in_progress" as MediaStatus } = {}) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <ItemStatusProvider initialStatus={status}>
        <LogPanel
          itemType="book" itemId="b1"
          entry={{ entryId: "p1", status, position: {} }}
          passes={[pass(status)]} sessions={[]} editions={[]}
        />
      </ItemStatusProvider>
    </NextIntlClientProvider>,
  );
}

describe("LogPanel, solo historial", () => {
  it("no pinta el selector de estado ni el enlace de quitar", () => {
    renderLog();
    expect(screen.queryByRole("group", { name: "Tu estado" })).toBeNull();
    expect(screen.queryByText("Quitar de mi biblioteca")).toBeNull();
  });

  it("«Nuevo pase» delega en el proveedor", () => {
    renderLog({ status: "completed" });
    fireEvent.click(screen.getByRole("button", { name: /Nuevo pase/i }));
    expect(actions.newPass).toHaveBeenCalledTimes(1);
  });

  it("«Nuevo pase» se deshabilita mientras el proveedor escribe", () => {
    actions.isPending = true;
    renderLog({ status: "completed" });
    expect(screen.getByRole("button", { name: /Nuevo pase/i })).toHaveProperty("disabled", true);
  });

  it("no monta hojas propias", () => {
    const { container } = renderLog();
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("sin entry, el placeholder dice «Añadiendo…»", () => {
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <ItemStatusProvider initialStatus="planned">
          <LogPanel itemType="book" itemId="b1" entry={null} passes={[]} sessions={[]} editions={[]} />
        </ItemStatusProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Añadiendo…")).not.toBeNull();
  });
});
