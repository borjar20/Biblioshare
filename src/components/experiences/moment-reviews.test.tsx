// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
const actions = vi.hoisted(() => ({ saveMomentReview: vi.fn(), setReviewSharing: vi.fn(), deleteMomentReview: vi.fn(), publishReview: vi.fn(), unpublishReview: vi.fn() }));
const reports = vi.hoisted(() => ({ reportReview: vi.fn(), reportExperience: vi.fn() }));
vi.mock("@/lib/experiences/review-actions", () => actions);
vi.mock("@/lib/experiences/report-actions", () => reports);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/experiencia/experience-1" }));
import { MomentReviews } from "./moment-reviews";
import { withIntl, detailFixture } from "./test-helpers";
beforeEach(() => {
  vi.clearAllMocks();
  actions.saveMomentReview.mockResolvedValue({ ok: true, data: { id: "r1" } });
  // jsdom no implementa <dialog>.showModal; SheetShell lo llama al montar.
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});
afterEach(cleanup);
describe("MomentReviews", () => {
  it("asks to confirm attendance instead of offering a disabled button", () => {
    const e = detailFixture({ state: "lived", ownAttendance: "planned" });
    render(withIntl(<MomentReviews experience={e} moment={e.moments[0]} />));
    expect(screen.queryByRole("button", { name: "Reseñar" })).toBeNull();
    expect(screen.getByText(/Confirma que fuiste/)).toBeTruthy();
  });
  it("saves rating and text from the sheet", async () => {
    const e = detailFixture({ state: "lived", ownAttendance: "attended" });
    render(withIntl(<MomentReviews experience={e} moment={e.moments[0]} />));
    fireEvent.click(screen.getByRole("button", { name: "Reseñar" }));
    fireEvent.change(screen.getByLabelText("Qué tal fue"), { target: { value: "Muy bien" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar reseña" }));
    await waitFor(() => expect(actions.saveMomentReview).toHaveBeenCalledWith(e.moments[0].id, { rating: null, body: "Muy bien" }));
  });
  it("shows the save error with role=alert and keeps the sheet open", async () => {
    actions.saveMomentReview.mockResolvedValue({ ok: false, error: "forbidden" });
    const e = detailFixture({ state: "lived", ownAttendance: "attended" });
    render(withIntl(<MomentReviews experience={e} moment={e.moments[0]} />));
    fireEvent.click(screen.getByRole("button", { name: "Reseñar" }));
    fireEvent.click(screen.getByRole("button", { name: "6/10" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar reseña" }));
    await waitFor(() => expect(actions.saveMomentReview).toHaveBeenCalledWith(e.moments[0].id, { rating: 6, body: null }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("No tienes permiso para realizar este cambio."));
  });
  it("shows others' reviews with their author", () => {
    const e = detailFixture({ state: "lived", ownAttendance: "attended", reviews: [{ author: "Ana", rating: 9, body: "Lo mejor" }] });
    render(withIntl(<MomentReviews experience={e} moment={e.moments[0]} />));
    expect(screen.getByText("Ana")).toBeTruthy();
    expect(screen.getByText("Lo mejor")).toBeTruthy();
  });
  it("only enables publishing for a shared review in a profile experience", () => {
    const e = detailFixture({ state: "lived", ownAttendance: "attended", audience: "participants", reviews: [{ author: "Yo", mine: true, rating: 8, body: "x", shared: true }] });
    render(withIntl(<MomentReviews experience={e} moment={e.moments[0]} />));
    expect(screen.getByText(/tiene que ser visible en el perfil/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Publicar en tu actividad" })).toBeNull();
  });
  it("tells the reporter when the review was already reported", async () => {
    reports.reportReview.mockResolvedValue({ ok: false, error: "conflict" });
    const e = detailFixture({ state: "lived", ownAttendance: "attended", reviews: [{ author: "Ana", rating: 9, body: "Lo mejor" }] });
    render(withIntl(<MomentReviews experience={e} moment={e.moments[0]} />));
    fireEvent.click(screen.getByRole("button", { name: "Denunciar reseña" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Denunciar reseña" }));
    const dialog = screen.getByRole("dialog", { hidden: true });
    fireEvent.click(within(dialog).getByRole("button", { name: "Enviar reporte", hidden: true }));
    await waitFor(() => expect(reports.reportReview).toHaveBeenCalledWith("review-1", "spam", ""));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Ya denunciaste esta reseña."));
  });
});
