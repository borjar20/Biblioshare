import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { shopRepository } from "./repository";

// Un id retirado del catálogo (o corrompido en la fila) no puede propagarse:
// `campScene()` lanza con un id desconocido y `pet-game.tsx` la llama sin red,
// así que un `scene` inválido aquí tumbaría ficha, madriguera y entrenamiento
// enteros, no solo el fondo (issue de revisión, Important). Se lee como si
// nunca se hubiera elegido escena.
it("un id de escena desconocido en la base se lee como null, no se propaga", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { balance: 5, pending: [], owned: ["creek"], scene: "escena-retirada-del-catalogo" }, error: null });
  const admin = { rpc } as unknown as Parameters<typeof shopRepository>[0];
  const state = await shopRepository(admin, "user-a").state();
  expect(state.scene).toBeNull();
  expect(state.balance).toBe(5);
});

it("una escena vigente del catálogo se lee tal cual", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { balance: 0, pending: [], owned: ["creek"], scene: "creek" }, error: null });
  const admin = { rpc } as unknown as Parameters<typeof shopRepository>[0];
  const state = await shopRepository(admin, "user-a").state();
  expect(state.scene).toBe("creek");
});
