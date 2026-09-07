import { describe, expect, it } from "vitest";
import { getBurrowPets } from "./get-burrow";

const row = {
  user_id: "neighbor", username: "ana", display_name: null, avatar_url: null,
  pet_name: "Nube", pet_class: "wizard", pet_stage: "acorn", pet_level: 7, total: 85,
};

describe("getBurrowPets", () => {
  it.each([0, -1, 1.5, null, "12", Number.MAX_SAFE_INTEGER + 1])("rejects invalid social levels: %j", async (pet_level) => {
    expect(await getBurrowPets({ rpc: async () => ({ data: [{ ...row, pet_level }], error: null }) }))
      .toEqual({ ok: false });
  });
  it("descarta las filas sin identidad, clase o etapa válidas", async () => {
    const result = await getBurrowPets({ rpc: async () => ({ data: [
      { ...row, pet_stage: "future" }, { ...row, username: "" },
      { ...row, pet_class: "unknown" }, row,
    ], error: null }) });
    expect(result.ok && result.rows.map((p) => p.name)).toEqual(["Nube"]);
  });

  it.each([null, {}, [{ ...row, total: -1 }], [{ ...row, pet_stage: "future" }]])(
    "una respuesta inválida se muestra como fallo, no como madriguera vacía: %j", async (data) => {
      expect(await getBurrowPets({ rpc: async () => ({ data, error: null }) })).toEqual({ ok: false });
    },
  );

  it("distingue vacío, error de RPC y fallo de transporte sin lanzar", async () => {
    expect(await getBurrowPets({ rpc: async () => ({ data: [], error: null }) }))
      .toEqual({ ok: true, rows: [], total: 0 });
    expect(await getBurrowPets({ rpc: async () => ({ data: null, error: { message: "unavailable" } }) }))
      .toEqual({ ok: false });
    expect(await getBurrowPets({ rpc: async () => { throw new Error("offline"); } }))
      .toEqual({ ok: false });
  });
  it("devuelve solo la apariencia y conserva el total anterior al límite", async () => {
    const result = await getBurrowPets({ rpc: async () => ({
      data: [{ ...row, last_level: 99, companion_hidden: true }], error: null,
    }) });
    expect(result).toEqual({ ok: true, total: 85, rows: [{
      userId: "neighbor", username: "ana", displayName: null, avatarUrl: null,
      name: "Nube", petClass: "wizard", stage: "acorn", level: 7,
    }] });
  });
});
