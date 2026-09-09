import { createBattle, stepBattle, viewOf } from "@/lib/pet/battle/engine";
import * as legacy from "@/lib/pet/battle/versions/r2.2/engine";
import * as r3 from "@/lib/pet/battle/versions/r3.1/engine";
import * as r4 from "@/lib/pet/battle/versions/r4.1/engine";
import { RULESET as R4, ENEMIES as R4_ENEMIES } from "@/lib/pet/battle/versions/r4.1/content";
import { isBattleSnapshot } from "@/lib/pet/battle/snapshot";
import { getBattleRelease } from "@/lib/pet/battle/replay";
import { RULESET as R2, BROTE as R2_BROTE } from "@/lib/pet/battle/versions/r2.2/content";
import { RULESET as R3, ENEMIES as R3_ENEMIES } from "@/lib/pet/battle/versions/r3.1/content";
import type { BattleInput as R2Input } from "@/lib/pet/battle/versions/r2.2/types";
import type { BattleInput as R3Input } from "@/lib/pet/battle/versions/r3.1/types";
import { RULESET, ENEMIES } from "@/lib/pet/battle/content";
import { parseEnemyList } from "@/lib/pet/battle/adventure";
import type { BattleEvent, BattleInput, BattleView } from "@/lib/pet/battle/types";
import type { TrainingBattle, TrainingResponse } from "@/lib/pet/training/types";

interface Actions {
  resume?: (intent: string) => Promise<TrainingResponse>;
  start: (intent: string, enemyId?: string) => Promise<TrainingResponse>;
  resolve: (intent: string, inputs: BattleInput[]) => Promise<TrainingResponse>;
  replay: (intent: string) => Promise<TrainingResponse>;
}

type LocalLog = { inputs: BattleInput[]; tick: number; awaitingContinue?: boolean };
interface SessionOptions { storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">; storagePrefix?: string; userId?: string; kind?: "training" | "adventure" }

/** Mutable session held in a React ref: input acceptance and ticks are synchronous. */
export class TrainingSession {
  phase: "idle" | "starting" | "playing" | "resolving" | "resolve-error" | "done" | "replaying" = "idle";
  paused = false;
  ultiOpen = false;
  /** Interludio entre tramos de una cadena (R4a): el reloj se detiene hasta continueFight(). */
  awaitingContinue = false;
  enemyId = "brote";
  private intentEnemy = "brote";
  hidden = false;
  error: string | null = null;
  battle: TrainingBattle | null = null;
  view: BattleView | null = null;
  inputs: BattleInput[] = [];
  events: BattleEvent[] = [];
  /** Effects from a restored log are history, not fresh activations. */
  visualFromTick = 0;
  private intent: string | null = null;
  private advance: ((inputs: BattleInput[]) => { events: BattleEvent[]; view: BattleView }) | null = null;
  private replayEvents: BattleEvent[] = [];
  private replayTick = 0;
  private skillCooldown = RULESET.pet.skillCooldown;
  private ultiDelay = RULESET.ulti.readyAt;
  private pending = false;
  private active = true;

  constructor(private actions: Actions, private newId: () => string, private options: SessionOptions = {}) {}

  selectEnemy(id: string) { if (id in ENEMIES) this.enemyId = id; }

  hasSavedSession() {
    const key = this.pointerKey();
    try { return !!key && !!this.options.storage?.getItem(key); } catch { return false; }
  }

  acknowledgeResult() { if (this.phase === "done" && this.active && !this.hidden) this.forget(); }

  togglePause() { this.paused = !this.paused; if (!this.paused && this.error === "LOCAL_RECOVERY") this.error = null; if (this.paused) this.save(); }

  setActive(active: boolean) { this.active = active; if (!active) this.prepareLeave(); }

  /** Synchronous checkpoint lets navigation cancel before the component disappears. */
  prepareLeave() {
    this.ultiOpen = false;
    this.paused = true;
    if (["idle", "done", "replaying"].includes(this.phase)) return true;
    if (this.phase === "starting") return false;
    return this.save();
  }

  private prefix() { return this.options.storagePrefix ?? `pet-${this.options.kind ?? "adventure"}:${this.options.userId ? `${encodeURIComponent(this.options.userId)}:` : ""}`; }
  private pointerKey() { return this.options.userId ? `${this.prefix()}current` : null; }
  private storageKey() { return this.intent ? `${this.prefix()}${this.intent}` : null; }
  private restoreIntent() {
    const key = this.pointerKey();
    if (!key || !this.options.storage) return false;
    let raw: string | null = null;
    try {
      raw = this.options.storage.getItem(key);
      if (!raw) return false;
      const pointer = JSON.parse(raw);
      if (typeof pointer?.intent !== "string" || !pointer.intent || pointer.intent.length > 100) throw new Error("LOCAL_RECOVERY");
      this.intent = pointer.intent;
      // Existing rows are returned before enemy validation. Invalid enemy ensures a
      // stale pointer cannot insert a replacement if the server has lost the row.
      this.intentEnemy = "";
      return true;
    } catch {
      if (raw) {
        this.error = "LOCAL_RECOVERY";
        try { this.options.storage.removeItem(key); } catch { /* Leave remains available with a warning. */ }
      }
      return false;
    }
  }
  private save() {
    if (this.error === "LOCAL_RECOVERY") return false;
    const key = this.storageKey();
    if (!key || !this.options.storage || !this.view) return false;
    try {
      this.options.storage.setItem(key, JSON.stringify({ inputs: this.inputs, tick: this.view.tick, awaitingContinue: this.awaitingContinue } satisfies LocalLog));
      const pointer = this.pointerKey();
      if (pointer) this.options.storage.setItem(pointer, JSON.stringify({ intent: this.intent }));
      return true;
    } catch { return false; }
  }
  private forget() {
    const key = this.storageKey();
    if (key && this.options.storage) try { this.options.storage.removeItem(key); } catch { /* idem */ }
    const pointer = this.pointerKey();
    if (pointer && this.options.storage) try {
      const saved = this.options.storage.getItem(pointer);
      if (saved && JSON.parse(saved)?.intent === this.intent) this.options.storage.removeItem(pointer);
    } catch { /* A different session's pointer must never be removed. */ }
  }
  private loadLocal(): LocalLog | null {
    const key = this.storageKey();
    if (!key || !this.options.storage) return null;
    try {
      const raw = this.options.storage.getItem(key);
      if (!raw) {
        if (this.intentEnemy === "") throw new Error("LOCAL_RECOVERY");
        return null;
      }
      const parsed = JSON.parse(raw) as LocalLog;
      const release = this.battle && getBattleRelease(this.battle.rulesetVersion, this.battle.contentHash);
      const fights = this.battle?.enemyId.split(",").length ?? 1;
      if (!release || !Number.isSafeInteger(parsed.tick) || parsed.tick < 0 || parsed.tick > fights * (release.ruleset.maxTicks + 1) || !release.validateInputs(parsed.inputs, fights).ok || parsed.inputs.some(i => i.tick > parsed.tick) || (parsed.awaitingContinue !== undefined && typeof parsed.awaitingContinue !== "boolean")) throw new Error("LOCAL_RECOVERY");
      return parsed;
    } catch { this.error = "LOCAL_RECOVERY"; this.paused = true; return null; }
  }

  private acceptResolved(battle: TrainingBattle, events?: BattleEvent[]) {
    this.battle = battle;
    this.inputs = battle.inputs;
    this.events = events ?? [];
    const result = battle.result;
    if (this.view && result) this.view = {
      ...this.view,
      petHp: result.petHp, petHpMax: result.petHpMax,
      enemyHp: result.enemyHp, enemyHpMax: result.enemyHpMax,
      tick: result.ticks, ended: true,
    };
    this.phase = "done";
  }

  /** Construye el motor (r2.2/r3.1 congelados, o el actual con cadena) según el ruleset del combate. */
  private buildEngine(b: TrainingBattle) {
    this.visualFromTick = 0;
    const release = getBattleRelease(b.rulesetVersion,b.contentHash);
    if (!release || !release.isSnapshot(b.snapshot)) throw new Error("UNSUPPORTED_BATTLE");
    this.skillCooldown = release.ruleset.pet.skillCooldown;
    this.ultiDelay = "ulti" in release.ruleset ? release.ruleset.ulti.readyAt : Infinity;
    const withFight = <V extends object>(v: V) => ({ ...v, fight: 1, fights: 1 });
    if (b.rulesetVersion === R2.version && b.enemyId === R2_BROTE.id) {
      const ctx = { snapshot: b.snapshot, seed: b.seed, ruleset: R2, enemy: R2_BROTE };
      const state = legacy.createBattle(ctx);
      const view = () => withFight({ ...legacy.viewOf(state), ultiReadyAt: Infinity, ultiUsed: false, shield: 0 });
      this.view = view();
      this.advance = inputs => ({ events: legacy.stepBattle(ctx, state, inputs as R2Input[]).map(event => (event.type === "ENEMY_BASIC" || event.type === "TELEGRAPH_RESOLVED" || event.type === "SKILL_USED") ? { ...event, shield: 0 } : event), view: view() });
    } else if (b.rulesetVersion === R3.version && Object.hasOwn(R3_ENEMIES, b.enemyId)) {
      const ctx = { snapshot: b.snapshot, seed: b.seed, ruleset: R3, enemy: R3_ENEMIES[b.enemyId] };
      const state = r3.createBattle(ctx);
      this.view = withFight(r3.viewOf(state));
      this.advance = inputs => ({ events: r3.stepBattle(ctx, state, inputs as R3Input[]) as BattleEvent[], view: withFight(r3.viewOf(state)) });
    } else if (b.rulesetVersion === R4.version) {
      const enemies = parseEnemyList(b.enemyId, R4_ENEMIES);
      if (!enemies) throw new Error("UNSUPPORTED_BATTLE");
      const ctx = { snapshot:b.snapshot,seed:b.seed,ruleset:R4,enemies };
      const state = r4.createBattle(ctx);
      this.view = r4.viewOf(state);
      this.advance = inputs => ({events:r4.stepBattle(ctx,state,inputs),view:r4.viewOf(state)});
    } else if (b.rulesetVersion === RULESET.version && isBattleSnapshot(b.snapshot)) {
      const enemies = parseEnemyList(b.enemyId, ENEMIES);
      if (!enemies) throw new Error("UNSUPPORTED_BATTLE");
      const ctx = { snapshot: b.snapshot, seed: b.seed, ruleset: RULESET, enemies };
      const state = createBattle(ctx);
      this.view = viewOf(state);
      this.advance = inputs => ({ events: stepBattle(ctx, state, inputs), view: viewOf(state) });
    } else throw new Error("UNSUPPORTED_BATTLE");
  }

  /** Reanuda un intento abierto desde el log local, si lo hay. Un log corrupto se olvida
   *  y el combate arranca desde el tick 0 (el motor ya está construido en tick 0). */
  private restoreLocal() {
    const log = this.loadLocal();
    if (!log) return;
    try {
      this.inputs = log.inputs;
      while (this.view && !this.view.ended && this.view.tick < log.tick) {
        const next = this.advance!(this.inputs.filter(i => i.tick === this.view!.tick));
        this.events.push(...next.events);
        this.view = next.view;
      }
      this.visualFromTick = this.view?.tick ?? 0;
      if (this.view?.ended) {
        this.phase = "resolving";
        this.paused = false;
        this.awaitingContinue = false;
      } else {
        this.paused = true;
        this.awaitingContinue = log.awaitingContinue ?? this.events.at(-1)?.type === "FIGHT_ENDED";
      }
    } catch {
      this.forget();
      this.error = "LOCAL_RECOVERY";
      this.paused = true;
      this.inputs = [];
      this.events = [];
      this.buildEngine(this.battle!);
    }
  }

  async start(fresh = false) {
    if (this.pending || (this.phase !== "idle" && !(fresh && this.phase === "done"))) return;
    this.error = null;
    const recovering = !fresh && !this.intent && this.restoreIntent();
    if (this.error) return;
    if (fresh || !this.intent) { this.intent = this.newId(); this.intentEnemy = this.enemyId; }
    this.phase = "starting";
    this.paused = false;
    this.error = null;
    this.pending = true;
    try {
      const resuming = this.intentEnemy === "";
      const response = resuming && this.actions.resume
        ? await this.actions.resume(this.intent!)
        : resuming && this.options.kind === "adventure"
          ? {ok:false as const, code:"RESUME_UNAVAILABLE"}
          : await this.actions.start(this.intent!, this.intentEnemy);
      if (!response.ok && resuming && ["UNKNOWN_ENEMY", "INVALID_INTENT", "NOT_FOUND"].includes(response.code)) { this.forget(); this.intent = null; }
      if (!response.ok) throw new Error(response.code);
      const b = response.battle;
      this.intent = b.intentId; // en aventuras, el servidor decide el intent.
      this.buildEngine(b);
      this.battle = b;
      if (this.options.kind === "training") this.enemyId = b.enemyId;
      this.inputs = [];
      this.events = [];
      this.paused = this.paused || recovering || !this.active; this.ultiOpen = false; this.awaitingContinue = false;
      this.phase = b.status === "resolved" ? "done" : "playing";
      if (b.status === "resolved") { this.acceptResolved(b, response.events); if (!this.pointerKey()) this.forget(); }
      else { this.restoreLocal(); this.save(); }
    } catch (e) { this.error = e instanceof Error && e.message ? e.message : "NETWORK"; this.phase = "idle"; }
    finally { this.pending = false; }
  }

  skill() {
    if (!this.active || this.phase !== "playing" || this.paused || this.hidden || this.ultiOpen || !this.view) return false;
    const tick = this.view.tick;
    if (tick < this.view.skillReadyAt || this.inputs.at(-1)?.tick === tick) return false;
    this.inputs.push({ seq: this.inputs.length, tick, action: "skill", payload: {} });
    this.save();
    return true;
  }

  openUlti() {
    if (!this.active || this.phase !== "playing" || this.hidden || !this.view || this.view.ultiUsed || this.view.tick < this.view.ultiReadyAt || this.inputs.at(-1)?.tick === this.view.tick) return false;
    this.ultiOpen = true; return true;
  }
  cancelUlti() { this.ultiOpen = false; }
  confirmUlti(order: string) {
    if (!this.ultiOpen || this.hidden || this.phase !== "playing" || !this.view || this.view.ultiUsed || (order !== "" && !/^(?!.*(.).*\1)[0-3]{4}$/.test(order))) return false;
    this.inputs.push({ seq: this.inputs.length, tick: this.view.tick, action: "ulti", payload: { order } });
    this.ultiOpen = false;
    this.save();
    return true;
  }

  /** Cierra el interludio entre tramos y deja que el reloj vuelva a correr. */
  continueFight() { if (this.active && this.awaitingContinue) { this.awaitingContinue = false; this.save(); } }

  tick() {
    if (!this.active || this.paused || this.hidden || this.ultiOpen || this.awaitingContinue) return;
    if (this.phase === "replaying" && this.view) {
      const current = this.replayEvents.filter(e => e.tick === this.replayTick);
      for (const event of current) {
        if ("petHp" in event) this.view.petHp = event.petHp;
        if ("enemyHp" in event) this.view.enemyHp = event.enemyHp;
        if ("shield" in event) this.view.shield = event.shield ?? this.view.shield;
        if (event.type === "ULTI_USED") this.view.ultiUsed = true;
        if (event.type === "TELEGRAPH_STARTED") { this.view.enemyPhase = event.kind === "charge" ? "windup" : "guard"; this.view.enemyPhaseUntil = event.resolvesAt; }
        if (event.type === "TELEGRAPH_RESOLVED" || event.type === "STATUS_EXPIRED") this.view.enemyPhase = "idle";
        if (event.type === "STATUS_APPLIED") { this.view.enemyPhase = event.status; this.view.enemyPhaseUntil = event.until; }
        if (event.type === "SKILL_USED") this.view.skillReadyAt = event.tick + this.skillCooldown;
        if (event.type === "LOOT_EFFECT" && event.effect === "heal") this.view.petHp = Math.min(this.view.petHpMax,this.view.petHp + event.amount);
        if (event.type === "LOOT_EFFECT" && event.effect === "cooldown") this.view.skillReadyAt -= event.amount;
        if (event.type === "FIGHT_STARTED") { this.view.fight = event.fight; this.view.enemyHp = event.enemyHp; this.view.enemyHpMax = event.enemyHp; this.view.enemyPhase = "idle"; this.view.skillReadyAt = event.tick; this.view.ultiReadyAt = event.tick + this.ultiDelay; this.view.ultiUsed = false; this.view.shield = 0; }
        if (event.type === "BATTLE_ENDED") { this.view.ended = true; this.phase = "done"; }
      }
      this.events.push(...current);
      this.view = { ...this.view, tick: this.replayTick++ };
      if (this.replayTick > (this.replayEvents.at(-1)?.tick ?? 0)) this.phase = "done";
      return;
    }
    if (this.phase !== "playing" || !this.advance || !this.view) return;
    const next = this.advance(this.inputs.filter(i => i.tick === this.view!.tick));
    this.events.push(...next.events); this.view = next.view;
    if (next.events.some(e => e.type === "FIGHT_ENDED")) { this.awaitingContinue = true; this.save(); }
    if (this.view.ended) this.phase = "resolving";
  }

  async resolve() {
    if (this.pending || !this.intent || !["resolving", "resolve-error"].includes(this.phase)) return;
    this.pending = true; this.phase = "resolving"; this.error = null;
    try {
      const response = await this.actions.resolve(this.intent, this.inputs.map(i => ({ ...i, payload: { ...i.payload } })));
      if (!response.ok) throw new Error(response.code);
      this.acceptResolved(response.battle, response.events);
      if (!this.pointerKey()) this.forget();
    } catch (e) { this.error = e instanceof Error && e.message ? e.message : "NETWORK"; this.phase = "resolve-error"; }
    finally { this.pending = false; }
  }

  async replay() {
    if (this.pending || !this.intent || this.phase !== "done") return;
    this.pending = true; this.error = null;
    this.paused = false;
    try {
      const response = await this.actions.replay(this.intent);
      if (!response.ok) throw new Error(response.code);
      if (!response.events) throw new Error("REPLAY_UNAVAILABLE");
      this.battle = response.battle;
      // Recupera los tiempos iniciales de la versión guardada, no los del último tramo.
      this.buildEngine(response.battle);
      this.replayEvents = response.events;
      this.events = []; this.replayTick = 0; this.paused = this.paused || !this.active; this.ultiOpen = false;
      const first = response.events.find(e => e.type === "BATTLE_STARTED");
      if (this.view && first?.type === "BATTLE_STARTED") this.view = { ...this.view, tick: 0, fight: 1, petHp: first.petHp, enemyHp: first.enemyHp, enemyPhase: "idle", enemyPhaseUntil: 0, skillReadyAt: 0, ultiUsed: false, shield: 0, ended: false };
      this.phase = "replaying";
    } catch (e) { this.error = e instanceof Error && e.message ? e.message : "NETWORK"; }
    finally { this.pending = false; }
  }
}
