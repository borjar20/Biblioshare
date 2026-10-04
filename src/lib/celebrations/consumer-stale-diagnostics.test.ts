import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CelebrationConsumer } from "./consumer";
import type { CelebrationActions } from "./protocol";

type ClaimResult = Awaited<ReturnType<CelebrationActions["claimNextCelebration"]>>;
const actorA = "11111111-1111-4111-8111-111111111111";
const actorB = "22222222-2222-4222-8222-222222222222";
const consumers: CelebrationConsumer[] = [];

function fixture() {
  let resolve!: (result: ClaimResult) => void;
  let reject!: (error: Error) => void;
  const pending = new Promise<ClaimResult>((done, fail) => { resolve = done; reject = fail; });
  const claim = vi.fn<CelebrationActions["claimNextCelebration"]>()
    .mockReturnValueOnce(pending).mockImplementation(async input => ({ kind: "empty", actorId: input.expectedActorId }));
  const ack = vi.fn<CelebrationActions["ackCelebration"]>().mockResolvedValue({ kind: "stale" });
  const release = vi.fn<CelebrationActions["releaseCelebration"]>().mockResolvedValue({ kind: "stale" });
  const consumer = new CelebrationConsumer({
    actions: { claimNextCelebration: claim, ackCelebration: ack, releaseCelebration: release },
    preference: () => "full", visible: () => true, now: () => performance.now(),
    log: vi.fn(), emitShown: vi.fn(),
  });
  consumers.push(consumer);
  consumer.bindActor(actorA, vi.fn());
  consumer.start();
  return { consumer, claim, ack, release, resolve, reject };
}

beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] }); });
afterEach(() => {
  for (const consumer of consumers.splice(0)) consumer.stop();
  vi.clearAllTimers(); vi.restoreAllMocks(); vi.useRealTimers();
});

describe.each(["unavailable", "rejected"] as const)("claim diagnostics: %s", outcome => {
  async function settle(f: ReturnType<typeof fixture>) {
    if (outcome === "unavailable") f.resolve({ kind: "unavailable" });
    else f.reject(new Error("controlled transport rejection"));
    await vi.advanceTimersByTimeAsync(0);
  }
  async function started() {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fixture();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.claim).toHaveBeenCalledTimes(1);
    return { ...f, error };
  }

  it("keeps the diagnostic when the claim still belongs to the active context", async () => {
    const f = await started();
    await settle(f);
    expect(f.error).toHaveBeenCalledExactlyOnceWith("celebrations", { operation: "claim", kind: "unavailable" });
    expect(f.ack).not.toHaveBeenCalled();
    expect(f.release).not.toHaveBeenCalled();
  });

  it("does not diagnose the old actor and continues claiming for the new actor", async () => {
    const f = await started();
    f.consumer.bindActor(actorB, vi.fn());
    await settle(f);
    expect(f.error).not.toHaveBeenCalled();
    expect(f.claim).toHaveBeenCalledTimes(2);
    expect(f.claim.mock.calls[1][0].expectedActorId).toBe(actorB);
    expect(f.ack).not.toHaveBeenCalled();
  });

  it("does not confuse a previous A generation with A after A to B to A", async () => {
    const f = await started();
    f.consumer.bindActor(actorB, vi.fn());
    f.consumer.bindActor(actorA, vi.fn());
    await settle(f);
    expect(f.error).not.toHaveBeenCalled();
    expect(f.claim).toHaveBeenCalledTimes(2);
    expect(f.claim.mock.calls[1][0].expectedActorId).toBe(actorA);
    expect(f.ack).not.toHaveBeenCalled();
  });

  it("observes the stopped consumer's rejection or result without diagnosing it", async () => {
    const f = await started();
    f.consumer.stop();
    await settle(f);
    expect(f.error).not.toHaveBeenCalled();
    expect(f.claim).toHaveBeenCalledTimes(1);
    expect(f.ack).not.toHaveBeenCalled();
  });

  it("does not diagnose an earlier mount when the same actor starts again", async () => {
    const f = await started();
    f.consumer.stop();
    f.consumer.start();
    await settle(f);
    expect(f.error).not.toHaveBeenCalled();
    expect(f.claim).toHaveBeenCalledTimes(2);
    expect(f.claim.mock.calls[1][0].expectedActorId).toBe(actorA);
    expect(f.ack).not.toHaveBeenCalled();
  });
});
