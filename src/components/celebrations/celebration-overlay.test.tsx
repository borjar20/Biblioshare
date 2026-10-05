// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CelebrationOverlay } from "./celebration-overlay";
import type { QueueEntry } from "@/lib/celebrations/protocol";

let frames: Map<number, FrameRequestCallback>;
let sequence: number;
let visibility: DocumentVisibilityState;
const entryA: QueueEntry = { source: "local", key: "local:a", shown: false, payload: { event: "first_activity_of_day", date: "2026-10-03", message: "HEAD_A" } };
const entryB: QueueEntry = { source: "local", key: "local:b", shown: false, payload: { event: "streak_milestone", milestone: 30, message: "HEAD_B" } };
async function frame() {
  const callbacks = [...frames.values()]; frames.clear();
  await act(async () => { for (const callback of callbacks) callback(performance.now()); });
}
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  frames = new Map(); sequence = 0; visibility = "visible"; window.localStorage.clear();
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); window.localStorage.clear(); });

describe("overlay presentation receipts", () => {
  it("starts duration only after the two-frame receipt, not when the portal mounts", async () => {
    const shown = vi.fn(); const done = vi.fn();
    render(<CelebrationOverlay entry={entryA} generation={4} preference="full" onShown={shown} onDone={done} />);
    await advance(5000);
    expect(screen.getByRole("status").textContent).toContain("HEAD_A");
    expect(shown).not.toHaveBeenCalled(); expect(done).not.toHaveBeenCalled();
    await frame(); expect(shown).not.toHaveBeenCalled(); await frame();
    expect(shown).toHaveBeenCalledExactlyOnceWith({ key: "local:a", generation: 4 });
    await advance(1599); expect(done).not.toHaveBeenCalled();
    await advance(1); expect(done).toHaveBeenCalledExactlyOnceWith("local:a");
  });
  it("cancels an old key's duration when the caller replaces it with another head", async () => {
    const shown = vi.fn(); const done = vi.fn();
    const view = render(<CelebrationOverlay entry={entryA} generation={1} preference="full" onShown={shown} onDone={done} />);
    await frame(); await frame(); await advance(500);
    view.rerender(<CelebrationOverlay entry={entryB} generation={1} preference="full" onShown={shown} onDone={done} />);
    await frame(); await frame(); await advance(1200);
    expect(screen.getByRole("status").textContent).toContain("HEAD_B"); expect(done).not.toHaveBeenCalled();
    await advance(800); expect(done).toHaveBeenCalledExactlyOnceWith("local:b");
    expect(shown.mock.calls).toEqual([[{ key: "local:a", generation: 1 }], [{ key: "local:b", generation: 1 }]]);
  });
  it("a disconnected portal is not a shown receipt", async () => {
    const shown = vi.fn();
    render(<CelebrationOverlay entry={entryA} generation={1} preference="full" onShown={shown} onDone={() => {}} />);
    const portal = screen.getByRole("status").parentElement!;
    portal.remove();
    try { await frame(); await frame(); expect(shown).not.toHaveBeenCalled(); }
    finally { document.body.appendChild(portal); } // Restore React's host tree for cleanup.
  });
  it("disabled or hidden entries have no portal, receipt or duration", async () => {
    const shown = vi.fn(); const done = vi.fn();
    const view = render(<CelebrationOverlay entry={entryA} generation={1} preference="disabled" onShown={shown} onDone={done} />);
    expect(screen.queryByRole("status")).toBeNull(); await frame(); await frame(); await advance(5000);
    visibility = "hidden"; act(() => document.dispatchEvent(new Event("visibilitychange")));
    view.rerender(<CelebrationOverlay entry={entryA} generation={1} preference="full" onShown={shown} onDone={done} />);
    expect(screen.queryByRole("status")).toBeNull(); expect(shown).not.toHaveBeenCalled(); expect(done).not.toHaveBeenCalled();
  });
  it("rechecks visibility between frames instead of confirming the first connected frame", async () => {
    const shown = vi.fn();
    render(<CelebrationOverlay entry={entryA} generation={1} preference="full" onShown={shown} onDone={() => {}} />);
    await frame(); const oldFrame = [...frames.values()][0];
    visibility = "hidden"; act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => oldFrame(performance.now()));
    expect(shown).not.toHaveBeenCalled(); expect(screen.queryByRole("status")).toBeNull();
  });
  it("an expired remote entry has no portal or receipt", async () => {
    const remote: QueueEntry = { source: "remote", key: "remote:expired", generation: 1, shown: false, safeDeadline: -1, reservation: { id: "33333333-3333-4333-8333-333333333333", token: "44444444-4444-4444-8444-444444444444", actorId: "11111111-1111-4111-8111-111111111111", eventKey: "2026-10-03", payload: entryA.payload, leaseMs: 30000, expiresAt: "2026-10-03T20:00:30.000Z" } };
    const shown = vi.fn(); const done = vi.fn();
    render(<CelebrationOverlay entry={remote} generation={1} preference="full" onShown={shown} onDone={done} />);
    await frame(); await frame(); await advance(5000);
    expect(screen.queryByRole("status")).toBeNull(); expect(shown).not.toHaveBeenCalled(); expect(done).not.toHaveBeenCalled();
  });
});
