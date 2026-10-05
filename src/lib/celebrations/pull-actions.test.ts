import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthSessionMissingError } from "@supabase/supabase-js";

const boundary = vi.hoisted(() => {
  const rpc = vi.fn();
  const getUser = vi.fn();
  const createClient = vi.fn(async () => ({ auth: { getUser }, rpc }));
  return { rpc, getUser, createClient };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: boundary.createClient }));

import * as actions from "./pull-actions";
import type { CelebrationEvent } from "./types";

const actor = "11111111-1111-4111-8111-111111111111";
const otherActor = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";
const token = "44444444-4444-4444-8444-444444444444";
const claimInput = { expectedActorId: actor, supportedEvents: ["first_activity_of_day"] as CelebrationEvent[] };
const receipt = { expectedActorId: actor, id, token };
const claimed = () => ({ kind: "claimed", actor_id: actor, id, claim_token: token, event_type: "first_activity_of_day", event_key: "2026-10-03", payload: { date: "2026-10-03", message: "Pending", event: "streak_milestone", id, claim_token: token }, lease_ms: 30000, claim_expires_at: "2026-10-03T20:00:30.000Z" });

beforeEach(() => {
  vi.clearAllMocks();
  boundary.createClient.mockImplementation(async () => ({ auth: { getUser: boundary.getUser }, rpc: boundary.rpc }));
  boundary.getUser.mockResolvedValue({ data: { user: { id: "11111111-1111-4111-8111-111111111111" } }, error: null });
  boundary.rpc.mockResolvedValue({ data: [{ event_type: "first_activity_of_day", event_key: "2026-10-03", payload: { date: "2026-10-03", message: "Pending" } }], error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("recoverable celebration actions", () => {
  it("keeps the legacy action empty without draining or authenticating", async () => {
    expect(await actions.pullPendingCelebrations()).toEqual([]);
    expect(boundary.createClient).not.toHaveBeenCalled();
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it("returns a reservation with the envelope event and without persistence fields in its payload", async () => {
    boundary.rpc.mockResolvedValue({ data: claimed(), error: null });
    const result = await actions.claimNextCelebration(claimInput);
    expect(result).toEqual({ kind: "claimed", reservation: { id, token, actorId: actor, eventKey: "2026-10-03", payload: { event: "first_activity_of_day", date: "2026-10-03", message: "Pending" }, leaseMs: 30000, expiresAt: "2026-10-03T20:00:30.000Z" } });
    expect(boundary.rpc).toHaveBeenCalledWith("claim_next_celebration", { p_supported_types: ["first_activity_of_day"] });
  });
  it("intersects capabilities with the current registry before reserving", async () => {
    boundary.rpc.mockResolvedValue({ data: { kind: "empty", actor_id: actor }, error: null });
    expect(await actions.claimNextCelebration({ ...claimInput, supportedEvents: ["future_event", "first_activity_of_day", "first_activity_of_day"] as CelebrationEvent[] })).toEqual({ kind: "empty", actorId: actor });
    expect(boundary.rpc).toHaveBeenCalledWith("claim_next_celebration", { p_supported_types: ["first_activity_of_day"] });
  });
  it.each(["claim", "ack", "release"])("compares the authenticated actor before the %s RPC", async operation => {
    boundary.getUser.mockResolvedValue({ data: { user: { id: otherActor } }, error: null });
    const result = operation === "claim" ? await actions.claimNextCelebration(claimInput) : operation === "ack" ? await actions.ackCelebration(receipt) : await actions.releaseCelebration(receipt);
    expect(result).toEqual({ kind: "identity_changed" });
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it("keeps anonymous distinct from an unavailable auth service", async () => {
    boundary.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await actions.claimNextCelebration(claimInput)).toEqual({ kind: "no_session" });
    boundary.getUser.mockResolvedValue({ data: { user: null }, error: { message: "PRIVATE_AUTH_DIAGNOSTIC" } });
    expect(await actions.claimNextCelebration(claimInput)).toEqual({ kind: "unavailable" });
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it.each(["claim", "ack", "release"])("recognizes the installed SDK's missing session before the %s RPC", async operation => {
    boundary.getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    const result = operation === "claim" ? await actions.claimNextCelebration(claimInput) : operation === "ack" ? await actions.ackCelebration(receipt) : await actions.releaseCelebration(receipt);
    expect(result).toEqual({ kind: "no_session" });
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it.each(["resolved_error", "rejection"])("observes %s without manufacturing empty or ACK", async failure => {
    const error = new Error("PRIVATE_RPC_DIAGNOSTIC");
    if (failure === "rejection") boundary.rpc.mockRejectedValue(error);
    else boundary.rpc.mockResolvedValue({ data: null, error });
    expect(await actions.claimNextCelebration(claimInput)).toEqual({ kind: "unavailable" });
    expect(await actions.ackCelebration(receipt)).toEqual({ kind: "unavailable" });
    expect(await actions.releaseCelebration(receipt)).toEqual({ kind: "unavailable" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("PRIVATE_RPC_DIAGNOSTIC");
  });
  it("keeps construction failure unavailable even if the diagnostic logger throws", async () => {
    boundary.createClient.mockRejectedValue(new Error("PRIVATE_CONSTRUCTION_FAILURE"));
    vi.mocked(console.error).mockImplementation(() => { throw new Error("LOGGER_FAILURE"); });
    expect(await actions.claimNextCelebration(claimInput)).toEqual({ kind: "unavailable" });
    expect(await actions.ackCelebration(receipt)).toEqual({ kind: "unavailable" });
    expect(await actions.releaseCelebration(receipt)).toEqual({ kind: "unavailable" });
  });
  it("preserves FIFO busy and actual empty as separate outcomes", async () => {
    boundary.rpc.mockResolvedValueOnce({ data: { kind: "busy", actor_id: actor, retry_after_ms: 28000 }, error: null }).mockResolvedValueOnce({ data: { kind: "empty", actor_id: actor }, error: null });
    expect(await actions.claimNextCelebration(claimInput)).toEqual({ kind: "busy", actorId: actor, retryAfterMs: 28000 });
    expect(await actions.claimNextCelebration(claimInput)).toEqual({ kind: "empty", actorId: actor });
  });
  it.each(["future_event", "constructor", "array_payload", "expired_contract"])("rejects %s and releases a known own unshown reservation", async failure => {
    const raw = claimed();
    const malformed = failure === "array_payload" ? { ...raw, payload: [] } : failure === "expired_contract" ? { ...raw, lease_ms: 1000 } : { ...raw, event_type: failure };
    boundary.rpc.mockResolvedValueOnce({ data: malformed, error: null }).mockResolvedValueOnce({ data: "released", error: null });
    expect(await actions.claimNextCelebration(claimInput)).toEqual({ kind: "unavailable" });
    expect(boundary.rpc).toHaveBeenLastCalledWith("release_celebration", { p_id: id, p_claim_token: token });
    expect(boundary.rpc.mock.calls.some(([name]) => name === "ack_celebration")).toBe(false);
  });
  it("does not release a result bearing another actor or a malformed token", async () => {
    boundary.rpc.mockResolvedValueOnce({ data: { ...claimed(), actor_id: otherActor }, error: null }).mockResolvedValueOnce({ data: { ...claimed(), claim_token: "invalid" }, error: null });
    expect(await actions.claimNextCelebration(claimInput)).toEqual({ kind: "unavailable" });
    expect(await actions.claimNextCelebration(claimInput)).toEqual({ kind: "unavailable" });
    expect(boundary.rpc.mock.calls.map(([name]) => name)).toEqual(["claim_next_celebration", "claim_next_celebration"]);
  });
  it.each(["acked", "already_acked", "stale"])("returns the real %s ACK without changing the receipt", async result => {
    boundary.rpc.mockResolvedValue({ data: result, error: null });
    expect(await actions.ackCelebration(receipt)).toEqual({ kind: result });
    expect(boundary.rpc).toHaveBeenCalledWith("ack_celebration", { p_id: id, p_claim_token: token });
  });
  it.each(["released", "already_acked", "stale"])("returns the real %s release", async result => {
    boundary.rpc.mockResolvedValue({ data: result, error: null });
    expect(await actions.releaseCelebration(receipt)).toEqual({ kind: result });
  });
  it("does not accept arbitrary success-shaped JSON as ACK or release", async () => {
    boundary.rpc.mockResolvedValue({ data: { kind: "acked" }, error: null });
    expect(await actions.ackCelebration(receipt)).toEqual({ kind: "unavailable" });
    expect(await actions.releaseCelebration(receipt)).toEqual({ kind: "unavailable" });
  });
  it("rejects invalid capabilities and receipt identifiers before RPC", async () => {
    expect(await actions.claimNextCelebration({ ...claimInput, supportedEvents: [""] as unknown as CelebrationEvent[] })).toEqual({ kind: "unavailable" });
    expect(await actions.claimNextCelebration({ ...claimInput, supportedEvents: Array(33).fill("first_activity_of_day") })).toEqual({ kind: "unavailable" });
    expect(await actions.ackCelebration({ ...receipt, token: "invalid" })).toEqual({ kind: "unavailable" });
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
});
