// Contrato C4: el servidor NUNCA simula un log sin pasar por aquí. Devuelve
// copias (el objeto del cliente no entra en el motor) y un código, no un texto:
// el código viaja al cliente y a los tests.
import { isUltiOrder } from "./ulti";
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
  | "NONEMPTY_PAYLOAD"
  | "ULTI_NOT_READY"
  | "ULTI_ALREADY_USED"
  | "BAD_CHAIN";

const KEYS = "action,payload,seq,tick";

export function validateInputs(
  raw: unknown,
  ruleset: Ruleset,
  fights = 1,
): { ok: true; inputs: BattleInput[] } | { ok: false; code: InputsError; index?: number } {
  if (!Number.isInteger(fights) || fights < 1 || fights > ruleset.adventure.chainLength) return { ok: false, code: "BAD_CHAIN" };
  if (!Array.isArray(raw)) return { ok: false, code: "NOT_ARRAY" };
  if (raw.length > ruleset.maxInputs * fights) return { ok: false, code: "TOO_MANY" };
  // Cota global inclusiva del reloj continuo (§3): un tick por tramo más el propio límite.
  const lastTick = fights * (ruleset.maxTicks + 1) - 1;
  const inputs: BattleInput[] = [];
  let prevTick = 0;
  let ultiUsed = false;
  for (let i = 0; i < raw.length; i++) {
    const item: unknown = raw[i];
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return { ok: false, code: "BAD_SHAPE", index: i };
    }
    if (Object.keys(item).sort().join(",") !== KEYS) return { ok: false, code: "BAD_SHAPE", index: i };
    const { seq, tick, action, payload } = item as Record<string, unknown>;
    if (seq !== i) return { ok: false, code: "BAD_SEQ", index: i };
    if (!Number.isSafeInteger(tick) || (tick as number) < 0 || (tick as number) > lastTick) {
      return { ok: false, code: "BAD_TICK", index: i };
    }
    if ((tick as number) < prevTick) return { ok: false, code: "TICK_ORDER", index: i };
    if (action !== "skill" && action !== "ulti") return { ok: false, code: "BAD_ACTION", index: i };
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      return { ok: false, code: "BAD_PAYLOAD", index: i };
    }
    const keys = Object.keys(payload);
    const prototype = Object.getPrototypeOf(payload);
    if ((prototype !== Object.prototype && prototype !== null) || Reflect.ownKeys(payload).length !== keys.length) {
      return { ok: false, code: "BAD_PAYLOAD", index: i };
    }
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      // "__proto__" no crea propiedad propia (dispara el setter heredado): se perdería en silencio.
      if (key === "__proto__") return { ok: false, code: "BAD_PAYLOAD", index: i };
      if (typeof value !== "string" && !Number.isSafeInteger(value)) return { ok: false, code: "BAD_PAYLOAD", index: i };
    }
    if (action === "skill" && keys.length !== 0) return { ok: false, code: "NONEMPTY_PAYLOAD", index: i };
    if (action === "ulti") {
      if (keys.length !== 1 || keys[0] !== "order" || !isUltiOrder((payload as Record<string, unknown>).order)) return { ok: false, code: "BAD_PAYLOAD", index: i };
      if ((tick as number) < ruleset.ulti.readyAt) return { ok: false, code: "ULTI_NOT_READY", index: i };
      // En cadena la segunda ulti la juzga el motor tramo a tramo (§3 «Validación de inputs»).
      if (fights === 1 && ultiUsed) return { ok: false, code: "ULTI_ALREADY_USED", index: i };
      ultiUsed = true;
    }
    prevTick = tick as number;
    inputs.push({ seq: i, tick: tick as number, action, payload: action === "ulti" ? { order: (payload as {order: string}).order } : {} });
  }
  return { ok: true, inputs };
}
