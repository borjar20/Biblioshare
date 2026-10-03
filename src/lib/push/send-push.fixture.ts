// Fronteras de pruebas: ningún cliente real, proveedor ni envío fuera del proceso.
import { vi } from "vitest";
import type { NotificationPreferences } from "./preferences";
import type { PushDevice, PushPlatform, PushTransport } from "./types";

type FixtureDevice = PushDevice & { user_id: string; failure_count: number };
export const pushState: {
  preferences: (NotificationPreferences & { user_id: string })[];
  devices: FixtureDevice[];
  claims: unknown[] | null;
  claimError: unknown;
  deviceReadError: unknown;
  deviceReadRejection: Error | null;
  healthRejection: Error | null;
  writes: { payload: Record<string, unknown>; column: string; value: string | string[] }[];
} = {
  preferences: [], devices: [], claims: [], claimError: null,
  deviceReadError: null, deviceReadRejection: null, healthRejection: null, writes: [],
};

export const transportSend = vi.fn<PushTransport["send"]>();
export const claimRpc = vi.fn(async () => ({ data: pushState.claims, error: pushState.claimError }));

function client() {
  return {
    rpc: claimRpc,
    from(table: string) {
      if (table === "notification_preferences") {
        return {
          select: () => ({
            in: async (_column: string, userIds: string[]) => ({
              data: pushState.preferences.filter((row) => userIds.includes(row.user_id)), error: null,
            }),
          }),
        };
      }
      if (table !== "push_devices") throw new Error(`Unexpected test table: ${table}`);
      const write = async (payload: Record<string, unknown>, column: string, value: string | string[]) => {
        pushState.writes.push({ payload, column, value });
        if (pushState.healthRejection) throw pushState.healthRejection;
        return { error: null };
      };
      return {
        select: () => ({
          in: (_column: string, userIds: string[]) => ({
            eq: async () => {
              if (pushState.deviceReadRejection) throw pushState.deviceReadRejection;
              return {
                data: pushState.devices.filter((row) => userIds.includes(row.user_id)),
                error: pushState.deviceReadError,
              };
            },
          }),
        }),
        update: (payload: Record<string, unknown>) => ({
          in: (column: string, value: string[]) => write(payload, column, value),
          eq: (column: string, value: string) => write(payload, column, value),
        }),
      };
    },
  };
}

export const createPushClient = vi.fn(client);

export function resetPushBoundary() {
  pushState.preferences = [];
  pushState.devices = [];
  pushState.claims = [];
  pushState.claimError = null;
  pushState.deviceReadError = null;
  pushState.deviceReadRejection = null;
  pushState.healthRejection = null;
  pushState.writes = [];
  createPushClient.mockReset().mockImplementation(client);
  claimRpc.mockReset().mockImplementation(async () => ({ data: pushState.claims, error: pushState.claimError }));
  transportSend.mockReset().mockImplementation(async (device) => ({ deviceId: device.id, outcome: "sent" }));
}

export function fixtureDevice(id: string, userId: string, platform: PushPlatform = "web_push", failureCount = 0): FixtureDevice {
  return {
    id, user_id: userId, platform, failure_count: failureCount,
    endpoint: platform === "web_push" ? "https://push.example.test/subscription" : null,
    p256dh: platform === "web_push" ? "test-key" : null,
    auth: platform === "web_push" ? "test-auth" : null,
    token: platform === "web_push" ? null : "test-token",
  };
}
