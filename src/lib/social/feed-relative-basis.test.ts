import { describe, it, expect } from "vitest";
import { getFeed } from "./feed";
import { fakeSupabase } from "./fake-feed-supabase";
import { todayISO } from "@/lib/stats/dates";

// `TODAY` se calcula con el MISMO helper que usa producción
// (`sessionRelativeBasis` cae a `todayISO()`), para que el test no dependa del
// día en que se ejecute.
const TODAY = todayISO();

describe("base del «hace x» de las fechas sin hora", () => {
  it("una reseña de hoy usa created_at, y una backdateada se queda en el día", async () => {
    const { client } = fakeSupabase({
      finished: [
        { id: "hoy", finished_on: TODAY, created_at: `${TODAY}T18:22:06.000+00:00` },
        { id: "vieja", finished_on: "2026-07-15", created_at: `${TODAY}T18:30:00.000+00:00` },
      ],
    });
    const page = await getFeed(client, "viewer-1");

    const byId = new Map(page.events.map((e) => [e.id, e]));
    expect(byId.get("diary_entries:hoy")?.eventDate).toBe(`${TODAY}T18:22:06.000+00:00`);
    expect(byId.get("diary_entries:vieja")?.eventDate).toBe("2026-07-15");
  });

  // Un pase NO nace terminado: se crea al añadir la obra a la biblioteca y el
  // "terminado" llega después como UPDATE (planTransition → updateActive), así
  // que `created_at` puede ir semanas por delante del final de la lectura. La
  // hora real del registro del terminado es `updated_at` (trigger
  // `passes_set_updated_at`), no `created_at`: con created_at, el «hace x» de
  // una reseña acabada hoy mide desde que se añadió el libro.
  it("una reseña terminada hoy sobre un pase antiguo usa updated_at, no created_at", async () => {
    const REGISTERED_AT = `${TODAY}T18:22:06.000+00:00`;
    const { client } = fakeSupabase({
      finished: [
        {
          id: "tardia",
          finished_on: TODAY,
          created_at: "2026-06-30T10:00:00.000+00:00", // alta: semanas antes
          updated_at: REGISTERED_AT,
        },
      ],
    });
    const page = await getFeed(client, "viewer-1");

    const byId = new Map(page.events.map((e) => [e.id, e]));
    expect(byId.get("diary_entries:tardia")?.eventDate).toBe(REGISTERED_AT);
  });
});
