// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { ItemStatusProvider, useItemStatus } from "./item-status-context";
import { PassCard } from "./pass-card";
import { StickyPassCta } from "./sticky-pass-cta";

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

beforeEach(() => {
  actions.isPending = false;
  actions.runPrimary.mockReset();
});
afterEach(cleanup);

function renderBoth(itemType: ItemType, status: MediaStatus | null) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <ItemStatusProvider initialStatus={status}>
        <div data-testid="card">
          <PassCard itemType={itemType} progress={null} rating={null} />
        </div>
        <div data-testid="sticky">
          <StickyPassCta itemType={itemType} />
        </div>
        <SavingSwitch />
      </ItemStatusProvider>
    </NextIntlClientProvider>,
  );
}

function SavingSwitch() {
  const { setSaving } = useItemStatus();
  return <span data-testid="saving-switch" onClick={() => setSaving(true)} />;
}

const stickyButton = () => screen.getByTestId("sticky").querySelector("button");

describe("StickyPassCta", () => {
  it.each([
    ["book", "planned", "Empezar a leer"],
    ["book", "in_progress", "Registrar sesión"],
    ["series", "in_progress", "Marcar episodio"],
    ["movie", "planned", "Marcar vista"],
    ["movie", "completed", "Registrar otro visionado"],
    ["book", "dropped", "Retomar"],
  ] as const)("%s %s: mismo texto que la tarjeta («%s»)", (itemType, status, label) => {
    renderBoth(itemType, status);
    expect(stickyButton()?.textContent).toBe(label);
    // La tarjeta pinta el mismo texto en su botón principal.
    const cardLabels = Array.from(screen.getByTestId("card").querySelectorAll("button")).map((b) => b.textContent);
    expect(cardLabels).toContain(label);
  });

  it("sin pase no se pinta", () => {
    renderBoth("book", null);
    expect(stickyButton()).toBeNull();
  });

  it("el clic llama a runPrimary", () => {
    renderBoth("book", "in_progress");
    fireEvent.click(stickyButton()!);
    expect(actions.runPrimary).toHaveBeenCalledTimes(1);
  });

  it("se deshabilita con isPending o con isSaving de otra isla", () => {
    actions.isPending = true;
    const view = renderBoth("book", "in_progress");
    expect(stickyButton()).toHaveProperty("disabled", true);
    view.unmount();
    actions.isPending = false;
    renderBoth("book", "in_progress");
    expect(stickyButton()).toHaveProperty("disabled", false);
    fireEvent.click(screen.getByTestId("saving-switch"));
    expect(stickyButton()).toHaveProperty("disabled", true);
  });
});
