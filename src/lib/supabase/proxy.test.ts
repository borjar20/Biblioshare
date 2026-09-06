import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CookieOptions } from "@supabase/ssr";
import { updateSession } from "./proxy";

const { getClaims, getUser, profile, refresh } = vi.hoisted(() => ({
  getClaims: vi.fn(),
  getUser: vi.fn(),
  profile: vi.fn(),
  refresh: vi.fn(),
}));

// Frontera del SDK externo. El proxy y las peticiones/respuestas de Next son reales.
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: {
    setAll: (cookies: { name: string; value: string; options?: CookieOptions }[], headers: Record<string, string>) => void;
  } }) => ({
    auth: { getClaims: async () => { refresh(options.cookies); return getClaims(); }, getUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: profile }) }) }),
  }),
}));

describe("updateSession", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getUser.mockRejectedValue(new Error("Auth user endpoint unavailable"));
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-a" } }, error: null });
    profile.mockResolvedValue({ data: { user_id: "user-a", onboarded_at: "2026-09-06" } });
  });

  it("deja pasar una sesión verificada aunque el endpoint de usuario no responda", async () => {
    const request = new NextRequest("https://biblioshare.test/coleccion", {
      headers: { cookie: "bs_onb=user-a" },
    });
    const response = await updateSession(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("conserva las cookies renovadas y sus cabeceras al redirigir desde login", async () => {
    refresh.mockImplementation((cookies) => cookies.setAll([
      { name: "sb-session", value: "renewed", options: { httpOnly: true, path: "/" } },
    ], { "cache-control": "private, no-store" }));
    const request = new NextRequest("https://biblioshare.test/login");
    const response = await updateSession(request);
    expect(response.headers.get("location")).toBe("https://biblioshare.test/");
    expect(request.cookies.get("sb-session")?.value).toBe("renewed");
    expect(response.cookies.get("sb-session")?.value).toBe("renewed");
    expect(response.cookies.get("bs_onb")?.value).toBe("user-a");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each([
    [null, null],
    [{ claims: { sub: "user-a" } }, { message: "invalid signature" }],
    [{ claims: {} }, null],
  ])("no acepta una identidad sin validar (%j)", async (data, error) => {
    getClaims.mockResolvedValue({ data, error });
    const response = await updateSession(new NextRequest("https://biblioshare.test/onboarding", {
      headers: { cookie: "bs_onb=user-a" },
    }));
    expect(response.headers.get("location")).toBe("https://biblioshare.test/login");
  });

  it("no hereda el onboarding de otra cuenta", async () => {
    profile.mockResolvedValue({ data: null });
    const response = await updateSession(new NextRequest("https://biblioshare.test/coleccion", {
      headers: { cookie: "bs_onb=user-b" },
    }));
    expect(response.headers.get("location")).toBe("https://biblioshare.test/onboarding");
  });

  it.each(["/auth/confirm", "/cuenta/contrasena"])("conserva el acceso a recuperación %s sin perfil", async (path) => {
    profile.mockResolvedValue({ data: null });
    const response = await updateSession(new NextRequest(`https://biblioshare.test${path}`));
    expect(response.status).toBe(200);
  });

  it("permite terminar el onboarding cuando ya hay perfil pero falta el asistente", async () => {
    profile.mockResolvedValue({ data: { user_id: "user-a", onboarded_at: null } });
    const response = await updateSession(new NextRequest("https://biblioshare.test/onboarding"));
    expect(response.status).toBe(200);
    expect(response.cookies.get("bs_onb")).toBeUndefined();
  });
});
