import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetDbForTests,
  deleteActive,
  readActive,
  saveFinished,
  writeActive,
  type ActiveGameRecord,
} from "./db";

function record(rev: number): ActiveGameRecord {
  return {
    identity: "anon",
    v: 1,
    committed: [{ id: "e1", type: "game_started", at: 1000, payload: {} }],
    pending: null,
    rev,
  };
}

beforeEach(async () => {
  await __resetDbForTests();
});

describe("active", () => {
  it("escribe y lee el registro por identidad", async () => {
    expect(await writeActive(record(1))).toEqual({ ok: true });
    const read = await readActive("anon");
    expect(read?.rev).toBe(1);
    expect(read?.committed).toHaveLength(1);
  });

  it("sin registro devuelve null, y otra identidad no ve el ajeno", async () => {
    await writeActive(record(1));
    expect(await readActive("uid-x")).toBeNull();
  });

  it("CAS: un rev igual o menor NO pisa y devuelve el registro vigente", async () => {
    await writeActive(record(2));
    const result = await writeActive(record(2));
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "conflict") {
      expect(result.current.rev).toBe(2);
    } else {
      throw new Error("esperaba conflict");
    }
    // rev mayor sí pisa
    expect(await writeActive(record(3))).toEqual({ ok: true });
  });

  it("deleteActive borra y es idempotente", async () => {
    await writeActive(record(1));
    await deleteActive("anon");
    await deleteActive("anon");
    expect(await readActive("anon")).toBeNull();
  });
});

describe("saved", () => {
  it("guarda una partida terminada", async () => {
    const ok = await saveFinished({
      gameId: "e1",
      identity: "anon",
      v: 1,
      committed: [{ id: "e1", type: "game_started", at: 1000, payload: {} }],
      savedAt: 2000,
    });
    expect(ok).toBe(true);
  });
});
