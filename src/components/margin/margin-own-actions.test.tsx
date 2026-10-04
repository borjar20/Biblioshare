// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";

const deleteMarginNote = vi.fn();
vi.mock("@/lib/margin/actions", () => ({ deleteMarginNote: (...a: unknown[]) => deleteMarginNote(...a) }));

import { MarginOwnActions } from "./margin-own-actions";

afterEach(() => {
  cleanup();
  deleteMarginNote.mockReset();
});

describe("MarginOwnActions", () => {
  it("si el borrado falla, mantiene la confirmación y avisa", async () => {
    deleteMarginNote.mockResolvedValue({ ok: false });
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <MarginOwnActions noteId="n1" conversations={0} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Borrar" }));
    fireEvent.click(screen.getByRole("button", { name: "Borrar" }));
    const alert = await waitFor(() => screen.getByRole("alert"));
    expect(alert.textContent).toBe("No se pudo borrar la nota. Inténtalo de nuevo");
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
  });
});
