// Contrato C4: el servidor NUNCA simula un log sin pasar por aquí. Devuelve
// copias (el objeto del cliente no entra en el motor) y un código, no un texto:
// el código viaja al cliente y a los tests.
import type { BattleInput, Ruleset } from "./types";

export type InputsError =
  | "NOT_ARRAY"
  | "TOO_MANY"
  | "BAD_SHAPE"
  | "BAD_SEQ"
  | "BAD_TICK"
  | "TICK_ORDER"
  | "BAD_ACTION"
  | "BAD_PAYLOAD"
  | "NON_EMPTY_PAYLOAD";

const KEYS = "action,payload,seq,tick";

export function validateInputs(
  raw: unknown,
  ruleset: Ruleset,
): { ok: true; inputs: BattleInput[] } | { ok: false; code: InputsError; index?: number } {
  if (!Array.isArray(raw)) return { ok: false, code: "NOT_ARRAY" };
  if (raw.length > ruleset.maxInputs) return { ok: false, code: "TOO_MANY" };
  const inputs: BattleInput[] = [];
  let lastTick = 0;
  for (let i = 0; i < raw.length; i++) {
    const item: unknown = raw[i];
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return { ok: false, code: "BAD_SHAPE", index: i };
    }
    if (Object.keys(item).sort().join(",") !== KEYS) return { ok: false, code: "BAD_SHAPE", index: i };
    const { seq, tick, action, payload } = item as Record<string, unknown>;
    if (seq !== i) return { ok: false, code: "BAD_SEQ", index: i };
    if (!Number.isSafeInteger(tick) || (tick as number) < 0 || (tick as number) > ruleset.maxTicks) {
      return { ok: false, code: "BAD_TICK", index: i };
    }
    if ((tick as number) < lastTick) return { ok: false, code: "TICK_ORDER", index: i };
    if (action !== "skill") return { ok: false, code: "BAD_ACTION", index: i };
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      return { ok: false, code: "BAD_PAYLOAD", index: i };
    }
    const proto = Object.getPrototypeOf(payload);
    if ((proto !== Object.prototype && proto !== null) || Object.hasOwn(payload, "__proto__")) {
      return { ok: false, code: "BAD_PAYLOAD", index: i };
    }
    if (Reflect.ownKeys(payload).length !== 0) return { ok: false, code: "NON_EMPTY_PAYLOAD", index: i };
    const copy = {};
    lastTick = tick as number;
    inputs.push({ seq: i, tick: tick as number, action: "skill", payload: copy });
  }
  return { ok: true, inputs };
}
