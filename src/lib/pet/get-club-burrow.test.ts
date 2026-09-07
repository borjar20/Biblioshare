import { expect, it } from "vitest";
import { getClubBurrowPets } from "./get-club-burrow";

const pet = { user_id: "owner", username: "ana", display_name: null, avatar_url: null,
  pet_name: "Nuez", pet_class: "wizard", pet_stage: "acorn", pet_level: 7, total: 0 };
function read(data: unknown, error: unknown = null) {
  return getClubBurrowPets({ rpc: async () => ({ data, error }) }, "club", "owner");
}
it("proyecta la propia sin contarla como vecina y no expone estado privado", async () => {
  expect(await read([{ ...pet, companion_hidden: true, mood: "sad" }])).toEqual({
    ok: true, total: 0, neighbors: [], own: { userId: "owner", username: "ana", displayName: null,
      avatarUrl: null, name: "Nuez", petClass: "wizard", stage: "acorn", level: 7 },
  });
});
it("permite leer antes de eclosionar sin inventar mascota propia", async () => {
  const result = await read([{ ...pet, user_id: "neighbor", total: 1 }]);
  expect(result.ok && result.own).toBeNull();
  expect(result.ok && result.neighbors.length).toBe(1);
});
it.each([null, [pet, pet], [{ ...pet, pet_level: -1 }], [{ ...pet, total: 1 }],
  [{ ...pet, user_id: "neighbor", total: 0 }], [{ ...pet, username: "" }]])(
  "una respuesta incompleta o inconsistente es fallo, no vacío: %j", async (data) => {
    expect(await read(data)).toEqual({ ok: false });
  },
);
it("distingue vacío, acceso denegado y transporte fallido", async () => {
  expect(await read([])).toEqual({ ok: true, own: null, neighbors: [], total: 0 });
  expect(await read(null, { code: "42501" })).toEqual({ ok: false });
  expect(await getClubBurrowPets({ rpc: async () => { throw new Error("offline"); } }, "club", "owner")).toEqual({ ok: false });
});
