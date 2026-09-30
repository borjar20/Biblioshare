// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";
import { SessionSheet } from "./session-sheet";

const h = vi.hoisted(() => ({ addSession: vi.fn() }));

vi.mock("@/lib/sessions/actions", () => ({ addSession: h.addSession }));
vi.mock("@/lib/sessions/network-catch", () => ({ withNetworkCatch: (action: unknown) => action }));
vi.mock("@/lib/celebrations/preference", () => ({ checkCelebrations: vi.fn() }));
vi.mock("@/lib/sessions/timer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sessions/timer")>()),
  clearTimer: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./session-modal", () => ({ useModalClose: () => undefined }));
vi.mock("./session-hero", () => ({ SessionHero: () => null }));
vi.mock("./session-notebook", () => ({ SessionNotebook: () => null }));
vi.mock("./series-episode-grid", () => ({ SeriesEpisodeGrid: () => null }));
vi.mock("@/components/detail/close-pass-sheet", () => ({ ClosePassSheet: () => null }));

afterEach(cleanup);

beforeEach(() => {
  h.addSession.mockReset();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) { this.open = true; },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    },
  });
});

function sheet() {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <SessionSheet
        ctx={{
          passId: "pass-1",
          itemType: "book",
          itemId: "book-1",
          title: "Libro",
          author: null,
          coverUrl: null,
          position: { page: 40 },
          status: "dropped",
          total: 300,
        }}
        mode="page"
      />
    </NextIntlClientProvider>,
  );
}

async function askToResume() {
  const { container } = sheet();
  const status = container.querySelector("#session-status") as HTMLSelectElement;
  fireEvent.change(status, { target: { value: "in_progress" } });
  fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-09-29" } });
  fireEvent.change(screen.getByLabelText("Página final de hoy"), { target: { value: "25" } });
  fireEvent.change(screen.getByLabelText("Duración"), { target: { value: "45" } });
  fireEvent.click(screen.getByLabelText("Compartir en mi perfil"));
  fireEvent.change(screen.getByPlaceholderText("¿Algo que contar sobre esta sesión? (opcional)"), {
    target: { value: "He vuelto a la página 25" },
  });
  fireEvent.click(screen.getByLabelText("Marcar como spoiler"));
  fireEvent.submit(container.querySelector("form")!);
  await waitFor(() => expect(h.addSession).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByRole("dialog")).toHaveProperty("open", true));
  return container;
}

describe("SessionSheet · elegir cómo retomar (#737)", () => {
  it("conserva el formulario al cancelar la pregunta y no vuelve a guardar", async () => {
    h.addSession.mockResolvedValue({ askResume: true });
    await askToResume();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(h.addSession).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText("Fecha") as HTMLInputElement).value).toBe("2026-09-29");
    expect((screen.getByLabelText("Página final de hoy") as HTMLInputElement).value).toBe("25");
    expect((screen.getByLabelText("Duración") as HTMLInputElement).value).toBe("45");
    expect((document.querySelector("#session-status") as HTMLSelectElement).value).toBe("in_progress");
    expect((screen.getByPlaceholderText("¿Algo que contar sobre esta sesión? (opcional)") as HTMLTextAreaElement).value)
      .toBe("He vuelto a la página 25");
    expect((screen.getByLabelText("Marcar como spoiler") as HTMLInputElement).checked).toBe(true);
  });

  it.each(["continue", "restart"] as const)("reenvía el borrador completo con %s", async (resumeMode) => {
    h.addSession
      .mockResolvedValueOnce({ askResume: true })
      .mockResolvedValueOnce({ ok: true });
    await askToResume();

    fireEvent.click(
      screen.getByRole("button", {
        name: resumeMode === "continue" ? "Continuar donde lo dejé" : "Empezar de cero",
      }),
    );

    await waitFor(() => expect(h.addSession).toHaveBeenCalledTimes(2));
    const secondFormData = h.addSession.mock.calls[1][4] as FormData;
    expect(Object.fromEntries(secondFormData)).toMatchObject({
      status: "in_progress",
      sessionDate: "2026-09-29",
      page: "25",
      durationMinutes: "45",
      resumeMode,
      share: "on",
      shareBody: "He vuelto a la página 25",
      shareSpoiler: "on",
    });
  });
});
