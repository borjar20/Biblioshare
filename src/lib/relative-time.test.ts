// TZ fijada a un huso SIN DST y con offset grande (UTC+9) para que la diferencia
// entre "medianoche local" y "medianoche UTC" sea observable y determinista sin
// depender del reloj de la máquina de CI. Debe ir ANTES de importar nada que use
// Date. Sin el fix de #351b, la aserción date-only baja de 14 h a 5 h.
process.env.TZ = "Asia/Tokyo";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { timeAgo } from "./relative-time";

const t = (key: string, values?: Record<string, number>) =>
  values?.count !== undefined ? `${key}:${values.count}` : key;

describe("timeAgo", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("ancla una fecha date-only a medianoche LOCAL, no UTC (#351b)", () => {
    // now = 2026-07-20 14:00 en Tokio (UTC+9).
    vi.setSystemTime(new Date("2026-07-20T05:00:00Z"));
    // Medianoche local del 20 en Tokio (= 2026-07-19T15:00Z) → hace 14 h.
    // Con el bug (new Date("2026-07-20") = medianoche UTC) daría 5 h.
    expect(timeAgo("2026-07-20", t)).toBe("hoursAgo:14");
    // Y coincide con su equivalente local explícito.
    expect(timeAgo("2026-07-20", t)).toBe(timeAgo("2026-07-20T00:00:00", t));
  });

  it("usa la hora real cuando el iso la trae (no toca el caso con hora)", () => {
    vi.setSystemTime(new Date("2026-07-20T05:00:00Z"));
    expect(timeAgo("2026-07-20T04:00:00Z", t)).toBe("hoursAgo:1");
    expect(timeAgo("2026-07-20T04:59:30Z", t)).toBe("justNow");
  });
});
