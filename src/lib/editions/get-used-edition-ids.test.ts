import { describe, expect, it, vi } from "vitest";
import { getUsedEditionIds } from "./get-used-edition-ids";

type Client = Parameters<typeof getUsedEditionIds>[0];

// Doble mínimo del cliente: solo rpc("editions_in_use"). `rpcSpy` deja comprobar
// que NO se llama a la RPC cuando no hay ids que preguntar. La dedup y el filtro
// de nulos ahora los hace la propia RPC (distinct + `= any`), así que aquí solo
// se comprueba el paso de argumentos y el trato del error.
function fakeClient(data: string[] | null, error: unknown = null) {
  const rpcSpy = vi.fn().mockResolvedValue({ data, error });
  const client = { rpc: rpcSpy } as unknown as Client;
  return { client, rpcSpy };
}

describe("getUsedEditionIds", () => {
  it("no consulta nada si no hay ediciones", async () => {
    const { client, rpcSpy } = fakeClient([]);
    expect(await getUsedEditionIds(client, [])).toEqual([]);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("pasa los ids a la RPC y devuelve su resultado", async () => {
    const { client, rpcSpy } = fakeClient(["ed-1", "ed-2"]);
    expect(await getUsedEditionIds(client, ["ed-1", "ed-2", "ed-3"])).toEqual([
      "ed-1",
      "ed-2",
    ]);
    expect(rpcSpy).toHaveBeenCalledWith("editions_in_use", {
      p_edition_ids: ["ed-1", "ed-2", "ed-3"],
    });
  });

  it("devuelve lista vacia si la RPC falla", async () => {
    const { client } = fakeClient(null, { message: "boom" });
    expect(await getUsedEditionIds(client, ["ed-1"])).toEqual([]);
  });
});
