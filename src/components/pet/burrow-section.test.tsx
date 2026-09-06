// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { BurrowSection } from "./burrow-section";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => () => "No se ha podido cargar la madriguera." }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe("BurrowSection", () => {
  it("un error del RPC devuelve el mensaje local, sin propagar el fallo a la página", async () => {
    const counts = { select: () => ({ eq: () => ({ eq: async () => ({ count: 0, error: null }) }) }) };
    vi.mocked(createClient).mockResolvedValue({
      rpc: async () => ({ data: null, error: { message: "unavailable" } }),
      from: () => counts,
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    render(await BurrowSection({ own: null, viewerId: "viewer" }));
    expect(screen.getByRole("status").textContent).toBe("No se ha podido cargar la madriguera.");
  });

  it("un fallo al abrir la conexión también queda contenido en la sección", async () => {
    vi.mocked(createClient).mockRejectedValue(new Error("offline"));
    render(await BurrowSection({ own: null, viewerId: "viewer" }));
    expect(screen.getByRole("status").textContent).toBe("No se ha podido cargar la madriguera.");
  });
});
