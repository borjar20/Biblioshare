import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service-role", async () => {
  const { releaseTestClient } = await import("./releases.fixture");
  return { createServiceRoleClient: () => releaseTestClient("service") };
});
const push = vi.hoisted(() => vi.fn());
vi.mock("@/lib/push/send-push", () => ({ sendPushToUser: push, sendPushToUsers: push }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
import { deliverReleaseNotices, releaseNoticeBody } from "./reminders";
import { releaseFixture, releaseTestClient, releaseTestState as state, resetReleaseFixture } from "./releases.fixture";
import type { ReleaseDeliveryClaim } from "./types";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";

const now = new Date("2026-10-06T08:00:00Z");
const client = () => releaseTestClient("service") as unknown as ReturnType<typeof createServiceRoleClient>;
const claim = (changes: Partial<ReleaseDeliveryClaim> = {}): ReleaseDeliveryClaim => ({
  id: "delivery-one", release_id: releaseFixture().id, user_id: "user-one", release_revision: 1, reason: "reminder", consent_generation: "generation",
  claim_token: "token-one", lease_until: "2026-10-06T08:05:00Z", notification_dedupe_key: `release:${releaseFixture().id}:generation:1:reminder:user-one`,
  release_payload: releaseFixture({ date_value: "2026-10-07" }), ...changes,
});

beforeEach(() => {
  resetReleaseFixture(); push.mockReset();
  state.tables.release_deliveries = [{ id: "delivery-one", accepted_at: null, state: "claimed" }];
  state.handlers.set("claim_release_deliveries", () => ({ data: [claim()], error: null }));
  state.handlers.set("release_delivery_is_current", () => ({ data: true, error: null }));
  state.handlers.set("accept_release_delivery", () => {
    state.tables.release_deliveries[0].accepted_at = now.toISOString();
    state.tables.release_deliveries[0].state = "accepted";
    state.tables.notifications = [{ id: "notification-one", user_id: "user-one", type: "release_reminder" }];
    return { data: [{ id: "notification-one", user_id: "user-one" }], error: null };
  });
  state.handlers.set("retry_release_delivery", () => ({ data: true, error: null }));
});

describe("consent generation and durable acceptance", () => {
  it("uses atomic consent/revision acceptance and reports in-app success even when push fails", async () => {
    push.mockRejectedValue(new Error("provider did not accept"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await deliverReleaseNotices(client(), 50, now)).toEqual({ claimed: 1, accepted: 1, suppressed: 0, retried: 0, failed: 0 });
      expect(state.tables.notifications).toHaveLength(1);
      expect(state.tables.release_deliveries[0].state).toBe("accepted");
      expect(state.rpcCalls.filter((call) => call.name === "accept_release_delivery")).toHaveLength(1);
      expect(push).toHaveBeenCalledTimes(1);
      expect(push.mock.calls[0][1]).toMatchObject({ path: `/novedades?lanzamiento=${releaseFixture().id}`, category: "system" });
    } finally { errorLog.mockRestore(); }
  });
  it("suppresses a withdrawn generation before notifying", async () => {
    state.handlers.set("release_delivery_is_current", () => ({ data: false, error: null }));
    state.handlers.set("accept_release_delivery", () => { state.tables.release_deliveries[0].state = "suppressed"; return { data: [], error: null }; });
    expect(await deliverReleaseNotices(client(), 50, now)).toEqual({ claimed: 1, accepted: 0, suppressed: 1, retried: 0, failed: 0 });
    expect(state.tables.notifications).toBeUndefined();
    expect(push).not.toHaveBeenCalled();
  });
  it("the atomic writer closes withdrawal between the preliminary check and acceptance", async () => {
    state.handlers.set("accept_release_delivery", () => { state.tables.release_deliveries[0].state = "suppressed"; return { data: [], error: null }; });
    expect(await deliverReleaseNotices(client(), 50, now)).toMatchObject({ accepted: 0, suppressed: 1, retried: 0 });
    expect(push).not.toHaveBeenCalled();
  });
  it("does not misclassify an expired lease as suppressed and allows a retry", async () => {
    state.handlers.set("release_delivery_is_current", () => ({ data: false, error: null }));
    state.handlers.set("accept_release_delivery", () => ({ data: [], error: null }));
    expect(await deliverReleaseNotices(client(), 50, now)).toEqual({ claimed: 1, accepted: 0, suppressed: 0, retried: 1, failed: 1 });
    expect(push).not.toHaveBeenCalled();
  });
  it("observes existing ledger acceptance on a dedup retry without sending another push", async () => {
    state.tables.release_deliveries[0].accepted_at = now.toISOString(); state.tables.release_deliveries[0].state = "accepted";
    state.handlers.set("accept_release_delivery", () => ({ data: [], error: null }));
    expect(await deliverReleaseNotices(client(), 50, now)).toMatchObject({ accepted: 1, failed: 0, retried: 0 });
    expect(push).not.toHaveBeenCalled();
  });
  it("has distinct confirmation/change/cancellation text and labels the international date", () => {
    const international = releaseFixture({ market: "INT", date_value: "2026-12", date_precision: "month" });
    expect(releaseNoticeBody(claim({ reason: "confirmed", release_payload: international }))).toContain("Fecha confirmada");
    expect(releaseNoticeBody(claim({ reason: "changed", release_payload: international }))).toContain("Fecha actualizada");
    expect(releaseNoticeBody(claim({ reason: "changed", release_payload: international }))).toContain("diciembre de 2026. Fecha internacional.");
    expect(releaseNoticeBody(claim({ reason: "cancelled", release_payload: international }))).toContain("cancelado");
  });
});
