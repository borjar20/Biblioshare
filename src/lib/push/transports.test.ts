import { beforeEach, describe, expect, it, vi } from "vitest";

// transports.ts es server-only e importa web-push y ./fcm; se mockean para poder
// probar la SELECCIÓN de transporte (spec item 13) sin credenciales ni red.
vi.mock("server-only", () => ({}));
vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}));
vi.mock("./fcm", () => ({ sendFcm: vi.fn() }));

import { FcmAndroidTransport, transportFor, WebPushTransport } from "./transports";

describe("transportFor", () => {
  it("routes web_push to the web transport", () => {
    expect(transportFor("web_push")).toBe(WebPushTransport);
  });
  it("routes fcm_android to the FCM transport", () => {
    expect(transportFor("fcm_android")).toBe(FcmAndroidTransport);
  });
  it("has no live transport for apns_ios yet", () => {
    expect(transportFor("apns_ios")).toBeNull();
  });
});

// Issue #678. La comprobación al ENVIAR es la que cubre las filas guardadas
// antes de que existiera la validación de registro: sin ella el arreglo solo
// protegería de los registros nuevos.
describe("WebPushTransport — gate de endpoint (#678)", () => {
  const event = { type: "test", title: "t", body: "b", path: "/" } as never;
  const device = (endpoint: string) =>
    ({ id: "dev-1", platform: "web_push", endpoint, p256dh: "p", auth: "a" }) as never;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    vi.clearAllMocks();
  });

  it("un endpoint interno se apaga en vez de reintentarse, y no llega a la red", async () => {
    const webpush = (await import("web-push")).default;
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await WebPushTransport.send(device("https://169.254.169.254/x"), event);

    // invalid_token (y no temporary_error) a propósito: el dispatcher apaga el
    // dispositivo y deja de volver a ese destino.
    expect(result).toMatchObject({ outcome: "invalid_token", errorCode: "ENDPOINT_NOT_ALLOWED" });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("un endpoint de push service real sí sale", async () => {
    const webpush = (await import("web-push")).default;
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as never);

    const result = await WebPushTransport.send(
      device("https://fcm.googleapis.com/fcm/send/abc"),
      event,
    );

    expect(result).toMatchObject({ outcome: "sent" });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    // El agente con `lookup` propio es la capa que para el DNS-rebinding: si
    // deja de pasarse, la petición vuelve a salir por el agente global.
    expect(vi.mocked(webpush.sendNotification).mock.calls[0][2]).toHaveProperty("agent");
  });
});
