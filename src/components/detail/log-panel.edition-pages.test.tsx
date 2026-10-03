// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import { PAGE_BOOK, PAGE_CASES, PAGE_PASS, pageFixture } from "@/lib/editions/edition-pages.test-fixture";
import { editionAskedStorageKey } from "@/lib/passes/edition-asked";
import { ItemStatusProvider } from "./item-status-context";

const mutations = vi.hoisted(() => ({
  updateStatus: vi.fn(), removeFromLibrary: vi.fn(), ratePass: vi.fn(), setPassEdition: vi.fn(),
}));
vi.mock("@/lib/library/manage-actions", () => mutations);
vi.mock("@/lib/passes/actions", () => mutations);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
// Unrelated leaves and mutation forms are outside this initial progress render.
// LogPanel, ManagedLog, PassProgress, pagesForPass and passPercent stay real.
vi.mock("@/components/session-list", () => ({ SessionList: () => null }));
vi.mock("@/components/notes/note-form", () => ({ NoteForm: () => null }));
vi.mock("@/components/detail/pass-diary", () => ({ PassDiary: () => null }));
vi.mock("@/components/detail/edition-picker", () => ({ EditionPicker: () => null }));
vi.mock("@/components/library/add-to-collection-sheet", () => ({ AddToCollectionSheet: () => null }));
vi.mock("@/components/detail/close-pass-sheet", () => ({ ClosePassSheet: () => null }));
vi.mock("@/components/detail/resume-pass-sheet", () => ({ ResumePassSheet: () => null }));
vi.mock("@/components/detail/new-pass-sheet", () => ({ NewPassSheet: () => null }));
import { LogPanel } from "@/components/detail/log-panel";

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.localStorage.setItem(editionAskedStorageKey(PAGE_PASS), "1");
  vi.stubGlobal("fetch", () => { throw new Error("Real fetch forbidden in #901"); });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const action of Object.values(mutations)) expect(action).not.toHaveBeenCalled();
});

describe("LogPanel aplica la precedencia en su barra real (#901)", () => {
  it.each(PAGE_CASES)("$name", (sample) => {
    const { pass, editions } = pageFixture(sample);
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <ItemStatusProvider initialStatus="in_progress">
          <LogPanel
            itemType="book" itemId={PAGE_BOOK}
            entry={{ entryId: PAGE_PASS, status: "in_progress", position: { page: 100 }, rating: null, notes: null }}
            passes={[pass]} sessions={[]} editions={editions} workTotalUnits={sample.workPages}
          />
        </ItemStatusProvider>
      </NextIntlClientProvider>,
    );
    if (sample.expectedPages === null) {
      expect(screen.queryByText("pág. 0")).toBeNull();
      expect(screen.queryByText(/% · este pase/)).toBeNull();
    } else {
      expect(screen.queryByText(`pág. ${sample.expectedPages}`)).not.toBeNull();
      expect(screen.queryByText(new RegExp(`· ${sample.expectedPercent}% · este pase`))).not.toBeNull();
      expect(screen.queryByText(`Al registrar una sesión que llegue a la pág. ${sample.expectedPages}, el pase pasa solo a Completado.`)).not.toBeNull();
    }
  });
});
