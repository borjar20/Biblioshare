// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";
import { ContentControls, ReportControls } from "./moderation-controls";
import type { ContentRow } from "@/lib/moderation/contracts";

const calls = vi.hoisted(() => ({ moderate: vi.fn(), review: vi.fn() }));
vi.mock("./moderation-actions", () => ({ moderateContent: calls.moderate, reviewReport: calls.review }));
const item: ContentRow = { id: "12345678-1234-1234-1234-123456789abc", kind: "club", title: "Club de prueba", body: "", author_id: "owner", author_name: "Autor", created_at: "2026-09-15T12:00:00Z", removed_at: null, parent_removed: false };
const wrap = (child: React.ReactNode) => render(<NextIntlClientProvider locale="es" messages={{ adminModeration: messages.adminModeration }}>{child}</NextIntlClientProvider>);
beforeEach(() => { vi.clearAllMocks(); calls.moderate.mockResolvedValue({ ok: true }); calls.review.mockResolvedValue({ ok: true }); });
afterEach(cleanup);

describe("moderation confirmations", () => {
  it("requires club name, reason and irreversible acknowledgement before deleting", async () => {
    wrap(<ContentControls item={item} />);
    fireEvent.click(screen.getByRole("button", { name: "Acciones de moderación" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Eliminar definitivamente" }));
    const submit = screen.getByRole("button", { name: "Eliminar definitivamente" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Motivo de la decisión"), { target: { value: "Spam reiterado" } });
    fireEvent.change(screen.getByLabelText("Escribe «Club de prueba» para confirmar"), { target: { value: "Club distinto" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(submit.disabled).toBe(true);
    expect(calls.moderate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Escribe «Club de prueba» para confirmar"), { target: { value: item.title } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(calls.moderate).toHaveBeenCalledWith({ id: item.id, kind: "club", action: "delete", reason: "Spam reiterado", confirmation: item.title }));
  });
  it("allows cancelling without changing content", () => {
    wrap(<ContentControls item={item} />);
    fireEvent.click(screen.getByRole("button", { name: "Acciones de moderación" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Retirar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(calls.moderate).not.toHaveBeenCalled();
    expect(screen.queryByRole("form")).toBeNull();
  });
  it("shows restoration only for individually withdrawn content", () => {
    wrap(<ContentControls item={{ ...item, removed_at: "2026-09-15T12:00:00Z" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Acciones de moderación" }));
    expect(screen.getByRole("menuitem", { name: "Restaurar" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Retirar" })).toBeNull();
  });
  it("keeps the reason and displays failed action without pretending success", async () => {
    calls.review.mockResolvedValue({ ok: false, error: "conflict" });
    wrap(<ReportControls id={item.id} />);
    fireEvent.click(screen.getByRole("button", { name: "Descartar reporte" }));
    fireEvent.change(screen.getByLabelText("Motivo de la decisión"), { target: { value: "No incumple normas" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Descartar reporte" }).at(-1)!);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("El estado ha cambiado"));
    expect((screen.getByLabelText("Motivo de la decisión") as HTMLTextAreaElement).value).toBe("No incumple normas");
  });
});
