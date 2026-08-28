// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HydrationWatch } from "./hydration-watch";

// La isla existe para UNA cosa: la primera visita a una ficha recién creada
// llega antes de que la hidratación de after() termine, y sin esto la ficha
// vacía se quedaba así hasta que el usuario recargara a mano. El contrato:
// sondear `books.hydrated_at` con paciencia acotada, y UN `router.refresh()`
// cuando la fila ya está hidratada — ni bucles de refresco, ni sondeo eterno
// contra una hidratación que falló.

const h = vi.hoisted(() => ({
  refresh: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: h.refresh }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: h.maybeSingle }),
      }),
    }),
  }),
}));

async function advance(ms: number) {
  // `act` para que React procese; los sondeos encadenan promesas, así que tras
  // avanzar el reloj hay que drenar la microtarea del await.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  h.maybeSingle.mockResolvedValue({ data: { hydrated_at: null } });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("HydrationWatch", () => {
  it("no refresca mientras la fila siga sin hidratar", async () => {
    render(<HydrationWatch bookId="b1" />);
    await advance(10_000);
    expect(h.maybeSingle).toHaveBeenCalled();
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("refresca UNA vez cuando hydrated_at aparece, y deja de sondear", async () => {
    render(<HydrationWatch bookId="b1" />);
    await advance(3_000);
    expect(h.refresh).not.toHaveBeenCalled();

    h.maybeSingle.mockResolvedValue({ data: { hydrated_at: "2026-08-28T00:00:00Z" } });
    await advance(4_000);
    expect(h.refresh).toHaveBeenCalledTimes(1);

    const polls = h.maybeSingle.mock.calls.length;
    await advance(60_000);
    expect(h.maybeSingle).toHaveBeenCalledTimes(polls);
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });

  it("se rinde tras agotar los sondeos: hidratación fallida se reintenta en la próxima visita, no aquí", async () => {
    render(<HydrationWatch bookId="b1" />);
    await advance(120_000);
    const polls = h.maybeSingle.mock.calls.length;
    expect(polls).toBeGreaterThan(0);
    expect(polls).toBeLessThanOrEqual(8);

    await advance(120_000);
    expect(h.maybeSingle).toHaveBeenCalledTimes(polls);
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("al desmontar cancela el sondeo pendiente", async () => {
    const { unmount } = render(<HydrationWatch bookId="b1" />);
    unmount();
    await advance(60_000);
    expect(h.maybeSingle).not.toHaveBeenCalled();
  });

  it("un fallo del sondeo no rompe la cadena: se sigue intentando", async () => {
    h.maybeSingle.mockRejectedValueOnce(new Error("network"));
    render(<HydrationWatch bookId="b1" />);
    await advance(3_000);
    h.maybeSingle.mockResolvedValue({ data: { hydrated_at: "2026-08-28T00:00:00Z" } });
    await advance(4_000);
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });
});
