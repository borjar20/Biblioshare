// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const a = vi.hoisted(() => ({ updateExperience: vi.fn(), setMomentAttendance: vi.fn() }));
vi.mock("@/lib/experiences/actions", () => ({ updateExperience: a.updateExperience }));
vi.mock("@/lib/experiences/participant-actions", () => ({ setMomentAttendance: a.setMomentAttendance }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/experiencia/experience-1" }));
import { ExperienceLivedAction } from "./experience-lived-action";
import { withIntl, detailFixture } from "./test-helpers";
beforeEach(() => {
  vi.clearAllMocks();
  a.updateExperience.mockResolvedValue({ ok: true, data: { revision: 2 } });
  a.setMomentAttendance.mockResolvedValue({ ok: true, data: { experienceId: "x" } });
  // jsdom no implementa <dialog>.showModal; SheetShell lo llama al montar.
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});
afterEach(cleanup);
describe("ExperienceLivedAction", () => {
  it("is hidden unless the organizer looks at a plan", () => {
    const { container, rerender } = render(withIntl(<ExperienceLivedAction experience={detailFixture({ state: "lived", canEdit: true })} />));
    expect(container.textContent).toBe("");
    rerender(withIntl(<ExperienceLivedAction experience={detailFixture({ state: "planned", canEdit: false })} />));
    expect(container.textContent).toBe("");
  });
  it("marks lived keeping fields, then confirms only checked moments", async () => {
    const e = detailFixture({ state: "planned", canEdit: true, moments: 2 });
    render(withIntl(<ExperienceLivedAction experience={e} />));
    fireEvent.click(screen.getByRole("button", { name: "Lo vivimos" }));
    await waitFor(() => expect(a.updateExperience).toHaveBeenCalledWith(e.id, e.revision, { title: e.title, shape: e.shape, state: "lived", audience: e.audience, startsOn: e.startsOn, endsOn: e.endsOn }));
    fireEvent.click(await screen.findByRole("checkbox", { name: e.moments[1].title }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(a.setMomentAttendance).toHaveBeenCalledTimes(1));
    expect(a.setMomentAttendance).toHaveBeenCalledWith(e.moments[0].id, "attended");
    expect((await screen.findByRole("link", { name: "Reseñar ahora" })).getAttribute("href")).toBe(`#moment-${e.moments[0].id}`);
  });
  it("does not bring the button back after closing the sheet, before the refresh lands", async () => {
    const e = detailFixture({ state: "planned", canEdit: true });
    render(withIntl(<ExperienceLivedAction experience={e} />));
    fireEvent.click(screen.getByRole("button", { name: "Lo vivimos" }));
    fireEvent.click(await screen.findByRole("button", { name: "Guardar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Más tarde" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Más tarde" })).toBeNull());
    expect(screen.queryByRole("button", { name: "Lo vivimos" })).toBeNull();
  });
  it("shows the update error with role=alert and stays closed", async () => {
    a.updateExperience.mockResolvedValue({ ok: false, error: "conflict" });
    const e = detailFixture({ state: "planned", canEdit: true });
    render(withIntl(<ExperienceLivedAction experience={e} />));
    fireEvent.click(screen.getByRole("button", { name: "Lo vivimos" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Otra edición cambió el recuerdo"));
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
