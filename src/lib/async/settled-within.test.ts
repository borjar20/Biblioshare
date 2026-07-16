import { describe, expect, it, vi } from "vitest";
import { settledWithin } from "./settled-within";

describe("settledWithin", () => {
  it("devuelve true si la promesa termina dentro del presupuesto", async () => {
    await expect(settledWithin(Promise.resolve("ok"), 50)).resolves.toBe(true);
  });

  it("devuelve false si se agota el presupuesto", async () => {
    vi.useFakeTimers();
    try {
      const nunca = new Promise<void>(() => {});
      const result = settledWithin(nunca, 1000);
      await vi.advanceTimersByTimeAsync(1000);
      await expect(result).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  // Una promesa que revienta ya no va a tardar más: cuenta como terminada, y su
  // error NO se propaga al llamador (que solo quiere saber si sigue esperando).
  it("una promesa rechazada cuenta como terminada y no propaga el error", async () => {
    await expect(
      settledWithin(Promise.reject(new Error("boom")), 50),
    ).resolves.toBe(true);
  });
});
