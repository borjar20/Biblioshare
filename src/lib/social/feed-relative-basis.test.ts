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
});
