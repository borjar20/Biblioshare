import { describe, expect, it, vi } from "vitest";
import { getUsedEditionIds } from "./get-used-edition-ids";

type Client = Parameters<typeof getUsedEditionIds>[0];

// Doble mínimo del cliente de Supabase: solo la cadena from().select().in(),
// que es lo único que usa la función. `inSpy` deja comprobar que NO se
// consulta cuando no hay ids que preguntar.
function fakeClient(rows: Array<{ edition_id: string | null }>) {
  const inSpy = vi.fn().mockResolvedValue({ data: rows, error: null });
  const client = {
    from: () => ({ select: () => ({ in: inSpy }) }),
  } as unknown as Client;
  return { client, inSpy };
}

describe("getUsedEditionIds", () => {
  it("no consulta nada si no hay ediciones", async () => {
    const { client, inSpy } = fakeClient([]);
    expect(await getUsedEditionIds(client, [])).toEqual([]);
    expect(inSpy).not.toHaveBeenCalled();
  });

  it("deduplica cuando varios pases usan la misma edicion", async () => {
    const { client } = fakeClient([
      { edition_id: "ed-1" },
      { edition_id: "ed-1" },
      { edition_id: "ed-2" },
    ]);
    expect(await getUsedEditionIds(client, ["ed-1", "ed-2", "ed-3"])).toEqual([
      "ed-1",
      "ed-2",
    ]);
  });

  it("descarta los pases sin edicion fijada", async () => {
    const { client } = fakeClient([{ edition_id: null }, { edition_id: "ed-9" }]);
    expect(await getUsedEditionIds(client, ["ed-9"])).toEqual(["ed-9"]);
  });

  it("devuelve lista vacia si la consulta falla", async () => {
    const { client } = fakeClient([]);
    expect(await getUsedEditionIds(client, ["ed-1"])).toEqual([]);
  });
});
