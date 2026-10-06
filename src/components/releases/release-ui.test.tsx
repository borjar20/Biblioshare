// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";

const mocks = vi.hoisted(() => ({ pending: vi.fn(), notice: vi.fn(), save: vi.fn(), publish: vi.fn(), review: vi.fn(), cancel: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock("@/app/novedades/actions", () => ({ addNoveltyToPending: mocks.pending, chooseReleaseNotice: mocks.notice }));
vi.mock("@/app/admin/novedades/actions", () => ({ saveBookAnnouncement: mocks.save, publishBookAnnouncement: mocks.publish, reviewBookAnnouncement: mocks.review, cancelBookAnnouncement: mocks.cancel }));

import { ReleaseWorkCard } from "./release-work-card";
import { ReleaseNoticeAction } from "./release-actions";
import { EditorialForm } from "./editorial-form";
import { EditorialControls } from "./editorial-controls";
import { EditorialEditor } from "./editorial-editor";
import { ReleaseSources } from "./release-sources";
import { releaseFixture } from "./test-fixture";
import type { ReleaseActionResult } from "./action-state";

function provider(ui: ReactElement) {
  return <NextIntlClientProvider locale="es" timeZone="Europe/Madrid" messages={{ releases: messages.releases, releaseAdmin: messages.releaseAdmin }}>{ui}</NextIntlClientProvider>;
}
beforeEach(() => { vi.clearAllMocks(); mocks.pending.mockResolvedValue({ ok: true }); mocks.notice.mockResolvedValue({ ok: true }); mocks.save.mockResolvedValue({ ok: true, id: "saved" }); mocks.publish.mockResolvedValue({ ok: true }); mocks.review.mockResolvedValue({ ok: true }); mocks.cancel.mockResolvedValue({ ok: true }); });
afterEach(cleanup);

describe("tarjeta de obra y elecciones independientes", () => {
  it("agrupa cine/digital con un Pendiente y un aviso por lanzamiento", async () => {
    const cinema = releaseFixture();
    const digital = releaseFixture({ id: "8174f7cd-39ed-40eb-8195-3d3d713a6a02", modality: "digital", date_value: "2027-03-14" });
    render(provider(<ReleaseWorkCard releases={[cinema, digital]} authenticated />));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { name: "La misma película" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Añadir a Pendiente" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Avisarme" })).toHaveLength(2);
    expect(screen.getByText("Cine")).toBeTruthy(); expect(screen.getByText("Digital")).toBeTruthy();
    fireEvent.click(within(document.querySelector(`[data-release-id="${digital.id}"]`) as HTMLElement).getByRole("button", { name: "Avisarme" }));
    await waitFor(() => expect(mocks.notice).toHaveBeenCalledWith(digital.id, true));
    expect(mocks.pending).not.toHaveBeenCalled();
    expect(await screen.findByText("Aviso elegido para este lanzamiento.")).toBeTruthy();
  });
  it("Pendiente no activa avisos y la biblioteca existente no se retrocede", async () => {
    const row = releaseFixture();
    const view = render(provider(<ReleaseWorkCard releases={[row]} authenticated />));
    fireEvent.click(screen.getByRole("button", { name: "Añadir a Pendiente" }));
    await waitFor(() => expect(mocks.pending).toHaveBeenCalledWith(row.id));
    expect(mocks.notice).not.toHaveBeenCalled();
    view.rerender(provider(<ReleaseWorkCard releases={[row]} authenticated userState={{ [row.id]: { inLibrary: true, subscribed: false } }} />));
    expect(screen.queryByRole("button", { name: "Añadir a Pendiente" })).toBeNull();
  });
  it("los enlaces anónimos vuelven al filtro y no ejecutan mutaciones", () => {
    render(provider(<ReleaseWorkCard releases={[releaseFixture()]} returnPath="/novedades?tipo=movie&mercado=INT" />));
    expect(screen.getByRole("link", { name: "Añadir a Pendiente" }).getAttribute("href")).toBe("/login?next=%2Fnovedades%3Ftipo%3Dmovie%26mercado%3DINT");
    expect(mocks.pending).not.toHaveBeenCalled(); expect(mocks.notice).not.toHaveBeenCalled();
  });
  it("conserva mes y mercado internacional sin inferir plataforma", () => {
    render(provider(<ReleaseWorkCard releases={[releaseFixture({ modality: "digital", date_precision: "month", date_value: "2027-02", market: "INT" })]} />));
    expect(screen.getByText("febrero de 2027")).toBeTruthy();
    expect(screen.queryByText("14 de febrero de 2027")).toBeNull();
    expect(screen.getByText("Internacional")).toBeTruthy();
    expect(screen.getByText("Fecha internacional. No confirma disponibilidad en España.")).toBeTruthy();
    expect(screen.queryByText(/Netflix|Prime|Disney/)).toBeNull();
    expect(screen.getByRole("link", { name: "Fuente: TMDB" }).getAttribute("href")).toContain("themoviedb.org/movie/123");
    expect(screen.getByText("Revisado el 6 de octubre de 2026")).toBeTruthy();
  });
  it("nombra una temporada y conserva Fecha por confirmar", () => {
    render(provider(<ReleaseWorkCard releases={[releaseFixture({ item_type: "series", modality: "season", season_number: 2, market: "INT", date_precision: "unknown", date_value: null })]} />));
    expect(screen.getByText("Temporada 2")).toBeTruthy(); expect(screen.getByText("Fecha por confirmar")).toBeTruthy();
  });
  it("retirar un aviso cancelado espera la respuesta y confirma sin permitir volver a suscribirse", async () => {
    let complete!: (result: ReleaseActionResult) => void;
    mocks.notice.mockReturnValue(new Promise<ReleaseActionResult>((resolve) => { complete = resolve; }));
    const view = render(provider(<ReleaseNoticeAction releaseId="cancelled" authenticated subscribed cancelled returnPath="/novedades" />));
    fireEvent.click(screen.getByRole("button", { name: "Retirar aviso" }));
    await waitFor(() => expect(mocks.notice).toHaveBeenCalledWith("cancelled", false));
    const working = screen.getByRole("button", { name: "Guardando…" }) as HTMLButtonElement;
    expect(working.disabled).toBe(true); expect(working.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("status")).toBeNull();
    // A refreshed consent can arrive with the server action response. Its new
    // value alone must not remove the in-flight state or pretend completion.
    view.rerender(provider(<ReleaseNoticeAction releaseId="cancelled" authenticated subscribed={false} cancelled returnPath="/novedades" />));
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeTruthy();
    await act(async () => { complete({ ok: true }); });
    expect((await screen.findByRole("status")).textContent).toBe("Aviso retirado. Tu biblioteca se conserva.");
    expect(screen.queryByRole("button", { name: "Retirar aviso" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Avisarme" })).toBeNull();
    expect(mocks.pending).not.toHaveBeenCalled();
  });
  it("un error del servidor al retirar un aviso cancelado conserva el error y permite reintentar", async () => {
    mocks.notice.mockResolvedValueOnce({ ok: false, error: "unknown" });
    render(provider(<ReleaseNoticeAction releaseId="cancelled" authenticated subscribed cancelled returnPath="/novedades" />));
    fireEvent.click(screen.getByRole("button", { name: "Retirar aviso" }));
    expect((await screen.findByRole("alert")).textContent).toBe("No se pudo guardar. Vuelve a intentarlo.");
    expect(screen.queryByRole("status")).toBeNull();
    expect((screen.getByRole("button", { name: "Retirar aviso" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Avisarme" })).toBeNull();
    expect(mocks.pending).not.toHaveBeenCalled();
  });
  it("oculta las acciones si falló la lectura privada", () => {
    render(provider(<ReleaseWorkCard releases={[releaseFixture()]} authenticated stateAvailable={false} />));
    expect(screen.queryByRole("button", { name: "Añadir a Pendiente" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Avisarme" })).toBeNull();
  });
  it("un fallo de transporte conserva un error visible y permite reintentar la elección", async () => {
    mocks.notice.mockRejectedValueOnce(new Error("connection lost"));
    render(provider(<ReleaseNoticeAction releaseId="release" authenticated subscribed={false} cancelled={false} returnPath="/novedades" />));
    fireEvent.click(screen.getByRole("button", { name: "Avisarme" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("No se pudo guardar. Vuelve a intentarlo.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Avisarme" }));
    await waitFor(() => expect(mocks.notice).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Aviso elegido para este lanzamiento.")).toBeTruthy();
  });
  it("una fuente fallida conserva la revisión satisfactoria visible", () => {
    render(provider(<ReleaseSources sources={[{ source: "tmdb", last_attempt_at: "2026-10-07T10:00:00Z", last_success_at: "2026-10-06T10:00:00Z", last_error: "provider internal error" }]} />));
    expect(screen.getByText("Revisado el 6 de octubre de 2026")).toBeTruthy();
    expect(screen.getByText("La última consulta falló. Se conserva la información revisada anteriormente.")).toBeTruthy();
    expect(screen.queryByText("provider internal error")).toBeNull();
  });
});

describe("formulario editorial", () => {
  it("guarda sin ISBN ni fecha y no añade a Pendiente", async () => {
    render(provider(<EditorialForm />));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Libro futuro" } });
    fireEvent.change(screen.getByLabelText("Nombre de la fuente"), { target: { value: "Editorial" } });
    fireEvent.change(screen.getByLabelText("Enlace del anuncio editorial"), { target: { value: "https://editorial.example/futuro" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0][0]).toMatchObject({ isbn: null, dateValue: null, datePrecision: "unknown", status: "draft" });
    expect(mocks.pending).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/admin/novedades/saved");
  });
  it("validar enfoca el campo y anuncia el error antes de enviar", () => {
    render(provider(<EditorialForm />));
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Título"));
    expect(screen.getByLabelText("Título").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Revisa los campos marcados antes de guardar.")).toBeTruthy();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("publicar es una acción editorial separada de guardar y de la biblioteca", async () => {
    render(provider(<EditorialControls id="draft" status="draft" revision={1} updatedAt="2026-10-06T10:00:00Z" />));
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledWith("draft", 1, "2026-10-06T10:00:00Z"));
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.pending).not.toHaveBeenCalled();
  });
  it("editar envía el token de la fuente leída con el texto que se editó", async () => {
    const row = releaseFixture({ item_type: "book", modality: "book", language: "es", source: "editorial", title: "Título inicial" });
    render(provider(<EditorialForm initial={row} />));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Título editado" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar revisión" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0][0].title).toBe("Título editado");
    expect(mocks.save.mock.calls[0].slice(1)).toEqual([row.id, row.revision, row.updated_at]);
  });
  it("los cambios sin guardar bloquean publicar o revisar otra instantánea", () => {
    render(provider(<EditorialEditor release={releaseFixture({ item_type: "book", modality: "book", source: "editorial", language: "es", status: "draft" })} />));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Edición sin guardar" } });
    expect((screen.getByRole("button", { name: "Publicar" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Confirmar revisión de la fuente" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Guarda los cambios antes de publicar, confirmar la revisión o cancelar.")).toBeTruthy();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
