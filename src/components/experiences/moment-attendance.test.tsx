// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const a = vi.hoisted(() => ({ setMomentAttendance: vi.fn(), setGuestAttendance: vi.fn() }));
vi.mock("@/lib/experiences/participant-actions", () => a);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/experiencia/experience-1" }));
import { MomentAttendance } from "./moment-attendance";
import { withIntl, detailFixture } from "./test-helpers";
beforeEach(() => {
  vi.clearAllMocks();
  a.setMomentAttendance.mockResolvedValue({ ok: true, data: { experienceId: "x" } });
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});
afterEach(cleanup);
const DROP = "Tienes una reseña de Museo. Si dices que no fuiste, se borrará junto con su publicación.";
describe("MomentAttendance", () => {
  it("invites to confirm attendance in a lived experience still pending", () => {
    const e = detailFixture({ state: "lived", ownAttendance: "planned" });
    render(withIntl(<MomentAttendance experience={e} moment={e.moments[0]} />));
    expect(screen.getByText("¿Fuiste? Confirma y reseña")).toBeTruthy();
  });
  it("changes attendance directly when there is no own review", async () => {
    const e = detailFixture({ state: "lived", ownAttendance: "attended" });
    render(withIntl(<MomentAttendance experience={e} moment={e.moments[0]} />));
    expect(screen.queryByText("¿Fuiste? Confirma y reseña")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "No fui" }));
    await waitFor(() => expect(a.setMomentAttendance).toHaveBeenCalledWith(e.moments[0].id, "skipped"));
    expect(screen.queryByText(DROP)).toBeNull();
  });
  it("asks before dropping an own review and only the confirm button drops it", async () => {
    const e = detailFixture({ state: "lived", ownAttendance: "attended", reviews: [{ author: "Yo", mine: true, rating: 8 }] });
    render(withIntl(<MomentAttendance experience={e} moment={e.moments[0]} />));
    fireEvent.click(screen.getByRole("radio", { name: "No fui" }));
    expect(await screen.findByText(DROP)).toBeTruthy();
    expect(a.setMomentAttendance).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar y borrar la reseña" }));
    await waitFor(() => expect(a.setMomentAttendance).toHaveBeenCalledWith(e.moments[0].id, "skipped", true));
    expect(a.setMomentAttendance).toHaveBeenCalledTimes(1);
  });
  it("opens the same confirmation when the server reports a hidden review (conflict)", async () => {
    a.setMomentAttendance.mockResolvedValueOnce({ ok: false, error: "conflict" });
    const e = detailFixture({ state: "lived", ownAttendance: "attended" });
    render(withIntl(<MomentAttendance experience={e} moment={e.moments[0]} />));
    fireEvent.click(screen.getByRole("radio", { name: "No fui" }));
    expect(await screen.findByText(DROP)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar y borrar la reseña" }));
    await waitFor(() => expect(a.setMomentAttendance).toHaveBeenLastCalledWith(e.moments[0].id, "skipped", true));
  });
});
