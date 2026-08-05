import { describe, expect, it } from "vitest";
import { classifyFcmDelivery, fcmErrorCode, maskToken } from "./fcm-errors";

describe("classifyFcmDelivery", () => {
  it("treats 2xx as sent", () => {
    expect(classifyFcmDelivery(200)).toBe("sent");
    expect(classifyFcmDelivery(204)).toBe("sent");
  });

  it("disables the token when it is definitively invalid", () => {
    expect(classifyFcmDelivery(404)).toBe("invalid_token");
    expect(classifyFcmDelivery(404, "UNREGISTERED")).toBe("invalid_token");
    expect(classifyFcmDelivery(400, "UNREGISTERED")).toBe("invalid_token");
    expect(classifyFcmDelivery(400, "NOT_FOUND")).toBe("invalid_token");
    expect(classifyFcmDelivery(403, "SENDER_ID_MISMATCH")).toBe("invalid_token");
  });

  it("keeps the device active on temporary/config errors", () => {
    // Payload/config nuestro: NO se apaga el token (un bug de payload no debe
    // tumbar todos los dispositivos).
    expect(classifyFcmDelivery(400, "INVALID_ARGUMENT")).toBe("temporary_error");
    // Credencial OAuth nuestra.
    expect(classifyFcmDelivery(401)).toBe("temporary_error");
    expect(classifyFcmDelivery(403, "THIRD_PARTY_AUTH_ERROR")).toBe("temporary_error");
    // Cuota y caídas de FCM.
    expect(classifyFcmDelivery(429, "QUOTA_EXCEEDED")).toBe("temporary_error");
    expect(classifyFcmDelivery(500, "INTERNAL")).toBe("temporary_error");
    expect(classifyFcmDelivery(503, "UNAVAILABLE")).toBe("temporary_error");
  });
});

describe("fcmErrorCode", () => {
  it("prefers the semantic FCM status over the HTTP code", () => {
    expect(fcmErrorCode(404, "UNREGISTERED")).toBe("UNREGISTERED");
    expect(fcmErrorCode(500)).toBe("HTTP_500");
    expect(fcmErrorCode(500, "")).toBe("HTTP_500");
  });
});

describe("maskToken", () => {
  it("never returns the full token", () => {
    const token = "abcdef1234567890XYZ";
    const masked = maskToken(token);
    expect(masked).not.toContain("1234567890");
    expect(masked).toBe("abcdef…0XYZ");
  });
  it("fully masks short tokens", () => {
    expect(maskToken("short")).toBe("***");
  });
});
