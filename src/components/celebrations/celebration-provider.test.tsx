// @vitest-environment jsdom
import { Activity, StrictMode, Suspense } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; actor: string; message: string; token: string | null; expires: number; displayed: string | null };
const boundary = vi.hoisted(() => {
  const state = {
    actor: "11111111-1111-4111-8111-111111111111" as string | null,
    rows: [] as Row[], sequence: 0, trace: [] as string[],
    cancelClaims: 0, cancelAcks: 0, failAcks: 0, holdClaim: false, holdAck: false,
    claims: [] as Array<() => void>, acks: [] as Array<() => void>,
  };
  // Only the external RPC boundary is modeled, not a PostgreSQL/RLS proof.
  // Real actions authenticate, validate and map every result from this seam.
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "claim_next_celebration") {
      const row = state.rows.find(item => item.actor === state.actor && item.displayed === null);
      if (!row) return { data: { kind: "empty", actor_id: state.actor }, error: null };
      if (row.token && row.expires > Date.now()) return { data: { kind: "busy", actor_id: state.actor, retry_after_ms: Math.ceil(row.expires - Date.now()) }, error: null };
      row.token = "00000000-0000-4000-8000-" + String(++state.sequence).padStart(12, "0");
      row.expires = Date.now() + 30000;
      state.trace.push("claim_committed_without_display");
      return { data: { kind: "claimed", actor_id: state.actor, id: row.id, event_type: "first_activity_of_day", event_key: "2026-10-03", payload: { date: "2026-10-03", message: row.message }, claim_token: row.token, lease_ms: 30000, claim_expires_at: new Date(row.expires).toISOString() }, error: null };
    }
    const row = state.rows.find(item => item.actor === state.actor && item.id === args.p_id && item.token === args.p_claim_token);
    if (!row) return { data: "stale", error: null };
    if (name === "ack_celebration") {
      if (state.failAcks > 0) { state.failAcks--; return { data: null, error: { code: "LOCAL_ACK_UNAVAILABLE" } }; }
      if (row.displayed) return { data: "already_acked", error: null };
      row.displayed = new Date().toISOString();
      state.trace.push("ack_committed");
      return { data: "acked", error: null };
    }
    if (name === "release_celebration") {
      if (row.displayed) return { data: "already_acked", error: null };
      row.token = null; row.expires = 0;
      state.trace.push("unshown_released");
      return { data: "released", error: null };
    }
    throw new Error("UNEXPECTED_RPC_IN_LOCAL_GATE");
  });
  const createClient = vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: state.actor ? { id: state.actor } : null }, error: null }) }, rpc }));
  const router = { refresh: vi.fn() };
  return { state, rpc, createClient, router };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: boundary.createClient }));
vi.mock("next/navigation", () => ({ useRouter: () => boundary.router }));
vi.mock("@/lib/celebrations/pull-actions", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/celebrations/pull-actions")>();
  return {
    ...actual,
    // Delivery seam executes the real action before retaining/cancelling its
    // response. This is not an import/getter failure or a fake action result.
    claimNextCelebration: async (input: Parameters<typeof actual.claimNextCelebration>[0]) => {
      const result = await actual.claimNextCelebration(input);
      if (boundary.state.holdClaim) await new Promise<void>(resolve => boundary.state.claims.push(resolve));
      if (boundary.state.cancelClaims > 0) { boundary.state.cancelClaims--; boundary.state.trace.push("claim_delivery_cancelled"); throw new DOMException("LOCAL_DELIVERY_CANCELLED", "AbortError"); }
      boundary.state.trace.push("claim_delivery_completed");
      return result;
    },
    ackCelebration: async (input: Parameters<typeof actual.ackCelebration>[0]) => {
      const result = await actual.ackCelebration(input);
      if (boundary.state.holdAck) await new Promise<void>(resolve => boundary.state.acks.push(resolve));
      if (boundary.state.cancelAcks > 0) { boundary.state.cancelAcks--; boundary.state.trace.push("ack_delivery_cancelled_after_commit"); throw new DOMException("LOCAL_ACK_DELIVERY_CANCELLED", "AbortError"); }
      return result;
    },
  };
});

import { CelebrationProvider, useCelebration } from "./celebration-provider";
import { CelebrationActorBridge } from "./celebration-actor-bridge";
import { checkCelebrations } from "@/lib/celebrations/preference";

const actorA = "11111111-1111-4111-8111-111111111111";
const actorB = "22222222-2222-4222-8222-222222222222";
const rowId = "33333333-3333-4333-8333-333333333333";
let frames: Map<number, FrameRequestCallback>;
let frameSequence: number;
let shown: string[][];
let shownListener: (event: Event) => void;
let visibility: DocumentVisibilityState;

function Controls() {
  const api = useCelebration();
  return <>
    <button onClick={api.pull}>Check</button>
    <button onClick={() => api.setPreference("disabled")}>Disable</button>
    <button onClick={() => api.setPreference("full")}>Full</button>
    <button onClick={() => api.setPreference("reduced")}>Reduced</button>
    <button onClick={() => api.triggerCelebration({ event: "first_activity_of_day", date: "2026-10-03", message: "LOCAL_ONE" })}>Local</button>
    <button onClick={() => api.triggerCelebration({ event: "constructor" } as never)}>Invalid</button>
    <button onClick={() => api.triggerCelebration({ event: "first_activity_of_day" })}>Missing date</button>
  </>;
}
function Tree({ actorId = actorA, observationId = "request-1", bind = true }: { actorId?: string | null; observationId?: string; bind?: boolean }) {
  return <CelebrationProvider>
    {bind ? <Suspense fallback={null}><CelebrationActorBridge actorId={actorId} observationId={observationId} /></Suspense> : null}
    <Controls />
  </CelebrationProvider>;
}
function seed(actor = actorA, message = "REMOTE_ONE", id = rowId): Row {
  const row = { id, actor, message, token: null, expires: 0, displayed: null };
  boundary.state.rows.push(row);
  return row;
}
async function advance(ms = 5) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function frame() {
  const callbacks = [...frames.values()]; frames.clear();
  await act(async () => { for (const callback of callbacks) callback(performance.now()); });
}
async function show() { await frame(); await frame(); await advance(); }
function click(name: string) { fireEvent.click(screen.getByRole("button", { name })); }
function rpcNames() { return boundary.rpc.mock.calls.map(([name]) => name); }
function hide() { act(() => { visibility = "hidden"; document.dispatchEvent(new Event("visibilitychange")); }); }
function visible() { act(() => { visibility = "visible"; document.dispatchEvent(new Event("visibilitychange")); }); }
async function deliverClaim() {
  boundary.state.holdClaim = false;
  await act(async () => { for (const resolve of boundary.state.claims.splice(0)) resolve(); });
  await advance();
}
async function deliverAck() {
  boundary.state.holdAck = false;
  await act(async () => { for (const resolve of boundary.state.acks.splice(0)) resolve(); });
  await advance();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
  vi.setSystemTime(new Date("2026-10-03T20:00:00.000Z"));
  Object.assign(boundary.state, { actor: actorA, rows: [], sequence: 0, trace: [], cancelClaims: 0, cancelAcks: 0, failAcks: 0, holdClaim: false, holdAck: false, claims: [], acks: [] });
  boundary.rpc.mockClear(); boundary.createClient.mockClear(); boundary.router.refresh.mockClear();
  window.localStorage.clear();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  frames = new Map(); frameSequence = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++frameSequence, callback); return frameSequence; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  shown = [];
  shownListener = event => {
    const messages = (event as CustomEvent<Array<{ message?: string }>>).detail.map(item => item.message ?? "");
    shown.push(messages); boundary.state.trace.push("shown_head");
  };
  window.addEventListener("celebrations:shown", shownListener);
});
afterEach(() => {
  cleanup();
  window.removeEventListener("celebrations:shown", shownListener);
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); window.localStorage.clear();
});

describe("recoverable celebrations through real provider, overlay and actions", () => {
  it("control: only two visible connected frames create a receipt and real ACK", async () => {
    const row = seed(); render(<Tree />); await advance();
    expect(screen.getByRole("status").textContent).toContain("REMOTE_ONE");
    expect(row.displayed).toBeNull(); expect(shown).toEqual([]);
    await frame(); await advance();
    expect(row.displayed).toBeNull(); expect(shown).toEqual([]);
    await frame(); await advance();
    expect(row.displayed).not.toBeNull(); expect(shown).toEqual([["REMOTE_ONE"]]);
    expect(boundary.state.trace.indexOf("shown_head")).toBeLessThan(boundary.state.trace.indexOf("ack_committed"));
    expect(rpcNames()).toEqual(["claim_next_celebration", "ack_celebration"]);
    await advance(1700);
    expect(screen.queryByRole("status")).toBeNull();
    expect(rpcNames().filter(name => name === "claim_next_celebration")).toHaveLength(2);
  });
  it("control: empty is not shown, ACKed or retried without another signal", async () => {
    render(<Tree />); await advance(5000);
    expect(screen.queryByRole("status")).toBeNull(); expect(shown).toEqual([]);
    expect(rpcNames()).toEqual(["claim_next_celebration"]);
  });
  it("recovers a cancelled delivery after claim commit on a new consumer after the lease", async () => {
    const row = seed(); boundary.state.cancelClaims = 1;
    const first = render(<Tree />); await advance();
    expect(boundary.state.trace).toContain("claim_delivery_cancelled");
    expect(row.displayed).toBeNull(); expect(row.token).not.toBeNull();
    expect(shown).toEqual([]); expect(screen.queryByRole("status")).toBeNull();
    first.unmount(); render(<Tree />); await advance();
    expect(screen.queryByRole("status")).toBeNull(); expect(row.displayed).toBeNull();
    await advance(30120); await show();
    expect(shown).toEqual([["REMOTE_ONE"]]); expect(row.displayed).not.toBeNull();
    expect(boundary.state.trace.filter(stage => stage === "claim_committed_without_display")).toHaveLength(2);
  });
  it("does not reserve while disabled and resumes on enable", async () => {
    const row = seed(); window.localStorage.setItem("biblioshare:celebration-preference", "disabled");
    render(<Tree />); await advance();
    expect(rpcNames()).toEqual([]); expect(row.token).toBeNull();
    click("Full"); await advance(); await show();
    expect(shown).toEqual([["REMOTE_ONE"]]); expect(row.displayed).not.toBeNull();
  });
  it("releases a known response disabled during delivery without showing or ACKing", async () => {
    const row = seed(); boundary.state.holdClaim = true;
    render(<Tree />); await advance();
    expect(row.token).not.toBeNull();
    click("Disable"); await deliverClaim();
    expect(row.token).toBeNull(); expect(row.displayed).toBeNull(); expect(shown).toEqual([]);
    expect(screen.queryByRole("status")).toBeNull(); expect(rpcNames()).not.toContain("ack_celebration");
    click("Full"); await advance(); await show();
    expect(row.displayed).not.toBeNull(); expect(shown).toEqual([["REMOTE_ONE"]]);
  });
  it("disable between frames never counts a connected but unshown portal", async () => {
    const row = seed(); render(<Tree />); await advance(); await frame();
    click("Disable"); await advance(); await frame();
    expect(screen.queryByRole("status")).toBeNull(); expect(row.displayed).toBeNull();
    expect(row.token).toBeNull(); expect(shown).toEqual([]); expect(rpcNames()).not.toContain("ack_celebration");
  });
  it("finishes an already shown ACK after disable and does not reserve the next row", async () => {
    const first = seed(); const next = seed(actorA, "REMOTE_TWO", "55555555-5555-4555-8555-555555555555");
    boundary.state.holdAck = true;
    render(<Tree />); await advance(); await show();
    expect(first.displayed).not.toBeNull(); expect(shown).toEqual([["REMOTE_ONE"]]);
    click("Disable"); await deliverAck(); await advance(2000);
    expect(screen.queryByRole("status")).toBeNull(); expect(next.token).toBeNull();
    expect(rpcNames().filter(name => name === "claim_next_celebration")).toHaveLength(1);
  });
  it("hidden before presentation releases without ACK and resumes with fresh frames", async () => {
    const row = seed(); render(<Tree />); await advance(); await frame();
    hide(); await advance(); await frame(); act(() => checkCelebrations()); await advance();
    expect(screen.queryByRole("status")).toBeNull(); expect(row.token).toBeNull();
    expect(row.displayed).toBeNull(); expect(shown).toEqual([]);
    visible(); await advance(); await show();
    expect(shown).toEqual([["REMOTE_ONE"]]); expect(row.displayed).not.toBeNull();
  });
  it("rejects a late response using the conservative budget captured before the request", async () => {
    const row = seed(); boundary.state.holdClaim = true;
    render(<Tree />); await advance(); await advance(27010); await deliverClaim();
    expect(row.displayed).toBeNull(); expect(row.token).toBeNull();
    expect(screen.queryByRole("status")).toBeNull(); expect(shown).toEqual([]);
    expect(rpcNames()).not.toContain("ack_celebration");
    click("Check"); await advance(); await show();
    expect(shown).toEqual([["REMOTE_ONE"]]); expect(row.displayed).not.toBeNull();
  });
  it("retries a lost ACK response with the same receipt without a second display", async () => {
    const row = seed(); boundary.state.cancelAcks = 1;
    render(<Tree />); await advance(); await show();
    const committed = row.displayed;
    expect(committed).not.toBeNull(); expect(boundary.state.trace).toContain("ack_delivery_cancelled_after_commit");
    await advance(1100);
    const acknowledgements = boundary.rpc.mock.calls.filter(([name]) => name === "ack_celebration");
    expect(acknowledgements).toHaveLength(2); expect(acknowledgements[0][1]).toEqual(acknowledgements[1][1]);
    expect(row.displayed).toBe(committed); expect(shown).toEqual([["REMOTE_ONE"]]);
    await advance(2000); expect(screen.queryByRole("status")).toBeNull(); expect(shown).toHaveLength(1);
  });
  it("retries an ACK unavailable before commit even while preference is disabled", async () => {
    const row = seed(); boundary.state.failAcks = 1;
    render(<Tree />); await advance(); await show();
    expect(shown).toEqual([["REMOTE_ONE"]]); expect(row.displayed).toBeNull();
    click("Disable"); await advance(1100);
    expect(row.displayed).not.toBeNull(); expect(shown).toHaveLength(1); expect(screen.queryByRole("status")).toBeNull();
    const acknowledgements = boundary.rpc.mock.calls.filter(([name]) => name === "ack_celebration");
    expect(acknowledgements).toHaveLength(2); expect(acknowledgements[0][1]).toEqual(acknowledgements[1][1]);
  });
  it("bounds unavailable ACK retries and resumes the same receipt on a new check", async () => {
    const row = seed(); boundary.state.failAcks = 5;
    render(<Tree />); await advance(); await show(); await advance(40000);
    expect(row.displayed).toBeNull(); expect(shown).toHaveLength(1);
    expect(rpcNames().filter(name => name === "ack_celebration")).toHaveLength(5);
    expect(rpcNames().filter(name => name === "claim_next_celebration")).toHaveLength(1);
    click("Check"); await advance();
    expect(row.displayed).not.toBeNull(); expect(shown).toHaveLength(1);
    expect(rpcNames().filter(name => name === "ack_celebration")).toHaveLength(6);
  });
  it("an ACK for a rotated token is terminal stale and cannot consume the current lease", async () => {
    const row = seed(); render(<Tree />); await advance();
    row.token = "66666666-6666-4666-8666-666666666666";
    await show(); await advance(5000);
    expect(row.displayed).toBeNull(); expect(row.token).toBe("66666666-6666-4666-8666-666666666666");
    expect(rpcNames().filter(name => name === "ack_celebration")).toHaveLength(1);
    expect(shown).toEqual([["REMOTE_ONE"]]);
  });
  it.each(["unknown", "anonymous"])("does not reserve under %s binding but can show valid local events", async binding => {
    const row = seed();
    render(<Tree bind={binding !== "unknown"} actorId={null} />); await advance();
    click("Check"); act(() => checkCelebrations()); await advance();
    expect(rpcNames()).toEqual([]);
    click("Local"); await show();
    expect(shown).toEqual([["LOCAL_ONE"]]); expect(row.displayed).toBeNull(); expect(rpcNames()).toEqual([]);
  });
  it("never publishes an old A response after binding B and authenticates the new request", async () => {
    const rowA = seed(); const rowB = seed(actorB, "REMOTE_B", "77777777-7777-4777-8777-777777777777");
    boundary.state.holdClaim = true;
    const view = render(<Tree />); await advance();
    boundary.state.actor = actorB; view.rerender(<Tree actorId={actorB} />);
    await deliverClaim();
    expect(screen.getByRole("status").textContent).toContain("REMOTE_B");
    expect(screen.getByRole("status").textContent).not.toContain("REMOTE_ONE");
    await show();
    expect(rowA.displayed).toBeNull(); expect(rowB.displayed).not.toBeNull(); expect(shown).toEqual([["REMOTE_B"]]);
    expect(rpcNames()).not.toContain("release_celebration"); // Expected A/cookie B rejected before RPC.
  });
  it("invalidates a mismatched binding and refreshes before displaying the new actor", async () => {
    const rowA = seed(); const rowB = seed(actorB, "REMOTE_B", "77777777-7777-4777-8777-777777777777");
    boundary.state.actor = actorB;
    const view = render(<Tree actorId={actorA} />); await advance();
    expect(rpcNames()).toEqual([]); expect(boundary.router.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
    view.rerender(<Tree actorId={actorB} />); await advance(); await show();
    expect(rowA.displayed).toBeNull(); expect(rowB.displayed).not.toBeNull(); expect(shown).toEqual([["REMOTE_B"]]);
  });
  it("logout prevents an accepted old response from being presented or ACKed", async () => {
    const row = seed(); boundary.state.holdClaim = true;
    const view = render(<Tree />); await advance();
    boundary.state.actor = null; view.rerender(<Tree actorId={null} />); await deliverClaim();
    expect(screen.queryByRole("status")).toBeNull(); expect(shown).toEqual([]); expect(row.displayed).toBeNull();
    expect(rpcNames()).toEqual(["claim_next_celebration"]);
  });
  it("coalesces checks and same-observation rerenders while a response is pending", async () => {
    seed(); boundary.state.holdClaim = true;
    const view = render(<Tree />); await advance();
    click("Check"); click("Check"); act(() => checkCelebrations()); view.rerender(<Tree />); await advance();
    expect(rpcNames()).toEqual(["claim_next_celebration"]);
    await deliverClaim(); await show();
    expect(shown).toEqual([["REMOTE_ONE"]]);
    expect(rpcNames()).toEqual(["claim_next_celebration", "ack_celebration"]);
  });
  it("observation: rebinds the same A after a mismatch observed B before cookies return to A", async () => {
    const row = seed(); boundary.state.actor = actorB;
    const view = render(<Tree actorId={actorA} observationId="request-1" />); await advance();
    expect(boundary.router.refresh).toHaveBeenCalledTimes(1); expect(rpcNames()).toEqual([]);
    boundary.state.actor = actorA; click("Check"); await advance();
    expect(rpcNames()).toEqual([]); expect(screen.queryByRole("status")).toBeNull();
    view.rerender(<Tree actorId={actorA} observationId="request-2" />); await advance(); await show();
    expect(row.displayed).not.toBeNull(); expect(shown).toEqual([["REMOTE_ONE"]]);
    expect(rpcNames()).toEqual(["claim_next_celebration", "ack_celebration"]);
  });
  it("observation: invalidates a held same-A claim without overlapping and obtains a fresh reservation", async () => {
    const row = seed(); boundary.state.holdClaim = true;
    const view = render(<Tree observationId="request-1" />); await advance();
    const oldToken = row.token; expect(oldToken).not.toBeNull();
    view.rerender(<Tree observationId="request-2" />); click("Check"); await advance();
    expect(rpcNames()).toEqual(["claim_next_celebration"]); expect(boundary.state.claims).toHaveLength(1);
    expect(screen.queryByRole("status")).toBeNull(); expect(row.displayed).toBeNull();
    await deliverClaim();
    expect(rpcNames()).toEqual(["claim_next_celebration", "release_celebration", "claim_next_celebration"]);
    expect(row.token).not.toBe(oldToken); expect(row.displayed).toBeNull(); expect(shown).toEqual([]);
    await show(); expect(row.displayed).not.toBeNull(); expect(shown).toEqual([["REMOTE_ONE"]]);
    expect(rpcNames().filter(name => name === "ack_celebration")).toHaveLength(1);
  });
  it("observation: retains the same shown ACK and its retry across a new observation of A", async () => {
    const row = seed(); boundary.state.failAcks = 1; boundary.state.holdAck = true;
    const view = render(<Tree observationId="request-1" />); await advance(); await show();
    expect(row.displayed).toBeNull(); expect(shown).toEqual([["REMOTE_ONE"]]); expect(boundary.state.acks).toHaveLength(1);
    view.rerender(<Tree observationId="request-2" />); await advance();
    expect(screen.queryByRole("status")).toBeNull();
    expect(rpcNames()).toEqual(["claim_next_celebration", "ack_celebration"]);
    await deliverAck(); await advance(1100); await show();
    expect(row.displayed).not.toBeNull(); expect(shown).toEqual([["REMOTE_ONE"]]);
    const acknowledgements = boundary.rpc.mock.calls.filter(([name]) => name === "ack_celebration");
    expect(acknowledgements).toHaveLength(2); expect(acknowledgements[0][1]).toEqual(acknowledgements[1][1]);
    expect(rpcNames()).not.toContain("release_celebration");
  });
  it("observation: preserves the unshown local head for the same A before reserving remote work", async () => {
    const row = seed(); const view = render(<Tree observationId="request-1" />); click("Local");
    view.rerender(<Tree observationId="request-2" />); await advance();
    expect(screen.getByRole("status").textContent).toContain("LOCAL_ONE"); expect(rpcNames()).toEqual([]);
    await show(); expect(shown).toEqual([["LOCAL_ONE"]]); expect(row.displayed).toBeNull();
    await advance(1700); await show();
    expect(row.displayed).not.toBeNull(); expect(shown).toEqual([["LOCAL_ONE"], ["REMOTE_ONE"]]);
    expect(rpcNames().filter(name => name === "ack_celebration")).toHaveLength(1);
  });
  it("observation: bridge unmount cleans up its latest binding after same-A updates", async () => {
    const row = seed(); const view = render(<Tree observationId="request-1" />); await advance();
    const oldToken = row.token;
    view.rerender(<Tree observationId="request-2" />); await advance();
    expect(row.token).not.toBe(oldToken); expect(rpcNames().filter(name => name === "claim_next_celebration")).toHaveLength(2);
    view.rerender(<Tree observationId="request-2" bind={false} />); await advance(); click("Check"); await advance();
    expect(row.token).toBeNull(); expect(row.displayed).toBeNull(); expect(shown).toEqual([]);
    expect(screen.queryByRole("status")).toBeNull(); expect(rpcNames().filter(name => name === "claim_next_celebration")).toHaveLength(2);
    view.rerender(<Tree observationId="request-3" />); await advance(); await show();
    expect(row.displayed).not.toBeNull(); expect(shown).toEqual([["REMOTE_ONE"]]);
  });
  it("StrictMode replay keeps a single claim and a single presentation", async () => {
    const row = seed(); render(<StrictMode><Tree /></StrictMode>); await advance(); await show();
    expect(row.displayed).not.toBeNull(); expect(shown).toEqual([["REMOTE_ONE"]]);
    expect(rpcNames()).toEqual(["claim_next_celebration", "ack_celebration"]);
  });
  it("Activity hide/show discards an old accepted response and obtains a fresh reservation", async () => {
    const row = seed(); boundary.state.holdClaim = true;
    const view = render(<Activity mode="visible"><Tree /></Activity>); await advance();
    view.rerender(<Activity mode="hidden"><Tree /></Activity>); await deliverClaim();
    expect(row.displayed).toBeNull(); expect(row.token).toBeNull(); expect(shown).toEqual([]);
    view.rerender(<Activity mode="visible"><Tree /></Activity>); await advance(); await show();
    expect(row.displayed).not.toBeNull(); expect(shown).toEqual([["REMOTE_ONE"]]);
  });
  it("Activity reactivation retries a shown ACK without redisplaying the retained state", async () => {
    const row = seed(); boundary.state.failAcks = 1;
    const view = render(<Activity mode="visible"><Tree /></Activity>); await advance(); await show();
    expect(row.displayed).toBeNull(); expect(shown).toHaveLength(1);
    view.rerender(<Activity mode="hidden"><Tree /></Activity>); await advance(100);
    view.rerender(<Activity mode="visible"><Tree /></Activity>); await advance(1100);
    expect(row.displayed).not.toBeNull(); expect(shown).toHaveLength(1); expect(screen.queryByRole("status")).toBeNull();
    const acknowledgements = boundary.rpc.mock.calls.filter(([name]) => name === "ack_celebration");
    expect(acknowledgements).toHaveLength(2); expect(acknowledgements[0][1]).toEqual(acknowledgements[1][1]);
  });
  it("locals block new claims and each shown event contains only its presented head", async () => {
    const row = seed(); window.localStorage.setItem("biblioshare:celebration-preference", "disabled");
    render(<Tree />); await advance(); click("Full"); click("Local"); await advance();
    expect(rpcNames()).toEqual([]); expect(row.token).toBeNull(); expect(shown).toEqual([]);
    await show();
    expect(shown).toEqual([["LOCAL_ONE"]]); expect(row.displayed).toBeNull();
    await advance(1700);
    expect(screen.getByRole("status").textContent).toContain("REMOTE_ONE");
    expect(row.displayed).toBeNull();
    await show();
    expect(shown).toEqual([["LOCAL_ONE"], ["REMOTE_ONE"]]); expect(row.displayed).not.toBeNull();
    expect(rpcNames().filter(name => name === "ack_celebration")).toHaveLength(1);
  });
  it("a local arriving after a reservation waits behind that remote head without ACKing itself", async () => {
    const row = seed(); render(<Tree />); await advance(); click("Local");
    expect(screen.getByRole("status").textContent).toContain("REMOTE_ONE");
    expect(shown).toEqual([]); await show(); await advance(1700);
    expect(screen.getByRole("status").textContent).toContain("LOCAL_ONE"); await show();
    expect(shown).toEqual([["REMOTE_ONE"], ["LOCAL_ONE"]]); expect(row.displayed).not.toBeNull();
    expect(rpcNames().filter(name => name === "ack_celebration")).toHaveLength(1);
  });
  it("a response never parks a remote lease behind locals that arrived during the request", async () => {
    const row = seed(); boundary.state.holdClaim = true;
    render(<Tree />); await advance(); click("Local"); await deliverClaim();
    expect(row.token).toBeNull(); expect(row.displayed).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("LOCAL_ONE");
    await show();
    expect(shown).toEqual([["LOCAL_ONE"]]); expect(rpcNames()).not.toContain("ack_celebration");
    await advance(1700); await show();
    expect(shown).toEqual([["LOCAL_ONE"], ["REMOTE_ONE"]]); expect(row.displayed).not.toBeNull();
  });
  it("invalid local events are neither rendered, emitted nor sent to ACK", async () => {
    render(<Tree actorId={null} />); await advance(); click("Invalid"); click("Missing date"); await show();
    expect(screen.queryByRole("status")).toBeNull(); expect(shown).toEqual([]); expect(rpcNames()).toEqual([]);
  });
  it("logger and event-dispatch failures cannot prevent a shown receipt from ACKing", async () => {
    const row = seed();
    vi.mocked(console.debug).mockImplementation(() => { throw new Error("LOCAL_ANALYTICS_FAILURE"); });
    vi.mocked(console.error).mockImplementation(() => { throw new Error("LOCAL_DIAGNOSTIC_FAILURE"); });
    const originalDispatch = window.dispatchEvent.bind(window);
    vi.spyOn(window, "dispatchEvent").mockImplementation(event => {
      if (event.type === "celebrations:shown") throw new Error("LOCAL_EVENT_FAILURE");
      return originalDispatch(event);
    });
    render(<Tree />); await advance(); await show();
    expect(row.displayed).not.toBeNull(); expect(shown).toEqual([]);
    expect(rpcNames()).toEqual(["claim_next_celebration", "ack_celebration"]);
    await advance(1700); expect(screen.queryByRole("status")).toBeNull();
  });
  it("reduced mode presents one static opportunity and switching full does not redisplay", async () => {
    const row = seed(); window.localStorage.setItem("biblioshare:celebration-preference", "reduced");
    render(<Tree />); await advance();
    expect(screen.getByRole("status").parentElement?.getAttribute("data-reduce")).toBe("true");
    await show(); click("Full"); await show();
    expect(row.displayed).not.toBeNull(); expect(shown).toEqual([["REMOTE_ONE"]]);
    expect(rpcNames().filter(name => name === "ack_celebration")).toHaveLength(1);
  });
  it("an expired unshown key cannot be acknowledged by its old captured frame", async () => {
    const row = seed(); render(<Tree />); await advance(); await frame();
    const oldSecondFrame = [...frames.values()][0];
    await advance(27010);
    expect(row.displayed).toBeNull(); expect(shown).toEqual([]);
    expect(boundary.state.trace).toContain("unshown_released");
    await act(async () => { oldSecondFrame(performance.now()); }); await advance();
    expect(row.displayed).toBeNull(); expect(shown).toEqual([]); expect(rpcNames()).not.toContain("ack_celebration");
    await show(); expect(row.displayed).not.toBeNull(); expect(shown).toEqual([["REMOTE_ONE"]]);
  });
});
