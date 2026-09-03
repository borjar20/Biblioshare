import { describe, expect, it, vi } from "vitest";
import { deliverPetNudges, type ClaimRow } from "./deliver";

const t = (key: string, values?: Record<string, string | number>) =>
  `${key}${values ? ":" + JSON.stringify(values) : ""}`;

function admin(rows: ClaimRow[] | null, error: { message: string } | null = null) {
  return { rpc: vi.fn(async () => ({ data: rows, error })) } as unknown as Parameters<typeof deliverPetNudges>[0];
}

describe("deliverPetNudges", () => {
  it("claim vacío: no envía nada", async () => {
    const send = vi.fn(async () => {});
    const report = await deliverPetNudges(admin([]), { send, t });
    expect(report).toEqual({ claimed: 0, sent: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("una fila por usuario: título = nombre, cuerpo según kind, categoría pet, ruta /mascota", async () => {
    const send = vi.fn(async () => {});
    const rows: ClaimRow[] = [
      { user_id: "u1", name: "Nuez", kind: "streak_at_risk", streak: 5 },
      { user_id: "u2", name: "Bellota", kind: "mood_sad", streak: null },
    ];
    const report = await deliverPetNudges(admin(rows), { send, t });
    expect(report).toEqual({ claimed: 2, sent: 2 });
    expect(send).toHaveBeenCalledWith("u1", {
      category: "pet",
      type: "pet_streak_at_risk",
      title: "Nuez",
      body: 'nudges.streakAtRisk:{"n":5}',
      path: "/mascota",
    });
    expect(send).toHaveBeenCalledWith("u2", expect.objectContaining({ type: "pet_mood_sad", title: "Bellota", body: "nudges.sad" }));
  });

  it("un kind desconocido se salta y cuenta como reclamado pero no enviado", async () => {
    const send = vi.fn(async () => {});
    const report = await deliverPetNudges(admin([{ user_id: "u1", name: "Nuez", kind: "otro", streak: null }]), { send, t });
    expect(report).toEqual({ claimed: 1, sent: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("si el claim falla, lanza (la ruta responde 500)", async () => {
    await expect(deliverPetNudges(admin(null, { message: "boom" }), { send: vi.fn(), t })).rejects.toBeTruthy();
  });

  it("un envío que revienta no impide los demás", async () => {
    const send = vi.fn(async (userId: string) => {
      if (userId === "u1") throw new Error("push down");
    });
    const rows: ClaimRow[] = [
      { user_id: "u1", name: "A", kind: "mood_sleepy", streak: null },
      { user_id: "u2", name: "B", kind: "mood_sleepy", streak: null },
    ];
    const report = await deliverPetNudges(admin(rows), { send, t });
    expect(report).toEqual({ claimed: 2, sent: 1 });
  });
});
