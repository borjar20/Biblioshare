import { createBattle, stepBattle, viewOf } from "@/lib/pet/battle/engine";
import { RULESET, BROTE } from "@/lib/pet/battle/content";
import type { BattleEvent, BattleInit, BattleInput, BattleState, BattleView } from "@/lib/pet/battle/types";
import type { TrainingBattle, TrainingResponse } from "@/lib/pet/training/types";

interface Actions {
  start: (intent: string) => Promise<TrainingResponse>;
  resolve: (intent: string, inputs: BattleInput[]) => Promise<TrainingResponse>;
  replay: (intent: string) => Promise<TrainingResponse>;
}

/** Mutable session held in a React ref: input acceptance and ticks are synchronous. */
export class TrainingSession {
  phase: "idle" | "starting" | "playing" | "resolving" | "resolve-error" | "done" | "replaying" = "idle";
  paused = false;
  hidden = false;
  error: string | null = null;
  battle: TrainingBattle | null = null;
  view: BattleView | null = null;
  inputs: BattleInput[] = [];
  events: BattleEvent[] = [];
  private intent: string | null = null;
  private ctx: BattleInit | null = null;
  private state: BattleState | null = null;
  private replayEvents: BattleEvent[] = [];
  private replayTick = 0;
  private pending = false;

  constructor(private actions: Actions, private newId: () => string) {}

  togglePause() { this.paused = !this.paused; }

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

  async start(fresh = false) {
    if (this.pending || (this.phase !== "idle" && !(fresh && this.phase === "done"))) return;
    if (fresh || !this.intent) this.intent = this.newId();
    this.phase = "starting";
    this.error = null;
    this.pending = true;
    try {
      const response = await this.actions.start(this.intent);
      if (!response.ok) throw new Error(response.code);
      const b = response.battle;
      if (b.rulesetVersion !== RULESET.version || b.enemyId !== BROTE.id) throw new Error("UNSUPPORTED_BATTLE");
      this.ctx = { snapshot: b.snapshot, seed: b.seed, ruleset: RULESET, enemy: BROTE };
      this.state = createBattle(this.ctx);
      this.view = viewOf(this.state);
      this.battle = b;
      this.inputs = [];
      this.events = [];
      this.paused = false;
      this.phase = b.status === "resolved" ? "done" : "playing";
      if (b.status === "resolved") this.acceptResolved(b, response.events);
    } catch (e) { this.error = e instanceof Error && e.message ? e.message : "NETWORK"; this.phase = "idle"; }
    finally { this.pending = false; }
  }

  skill() {
    if (this.phase !== "playing" || this.paused || this.hidden || !this.state) return false;
    const tick = this.state.tick;
    if (tick < this.state.pet.skillReadyAt || this.inputs.at(-1)?.tick === tick) return false;
    this.inputs.push({ seq: this.inputs.length, tick, action: "skill", payload: {} });
    return true;
  }

  tick() {
    if (this.paused || this.hidden) return;
    if (this.phase === "replaying" && this.view) {
      const current = this.replayEvents.filter(e => e.tick === this.replayTick);
      for (const event of current) {
        if ("petHp" in event) this.view.petHp = event.petHp;
        if ("enemyHp" in event) this.view.enemyHp = event.enemyHp;
        if (event.type === "TELEGRAPH_STARTED") { this.view.enemyPhase = event.kind === "charge" ? "windup" : "guard"; this.view.enemyPhaseUntil = event.resolvesAt; }
        if (event.type === "TELEGRAPH_RESOLVED" || event.type === "STATUS_EXPIRED") this.view.enemyPhase = "idle";
        if (event.type === "STATUS_APPLIED") { this.view.enemyPhase = "stagger"; this.view.enemyPhaseUntil = event.until; }
        if (event.type === "SKILL_USED") this.view.skillReadyAt = event.tick + RULESET.pet.skillCooldown;
        if (event.type === "BATTLE_ENDED") { this.view.ended = true; this.phase = "done"; }
      }
      this.events.push(...current);
      this.view = { ...this.view, tick: this.replayTick++ };
      if (this.replayTick > (this.replayEvents.at(-1)?.tick ?? 0)) this.phase = "done";
      return;
    }
    if (this.phase !== "playing" || !this.state || !this.ctx) return;
    this.events.push(...stepBattle(this.ctx, this.state, this.inputs.filter(i => i.tick === this.state!.tick)));
    this.view = viewOf(this.state);
    if (this.state.ended) this.phase = "resolving";
  }

  async resolve() {
    if (this.pending || !this.intent || !["resolving", "resolve-error"].includes(this.phase)) return;
    this.pending = true; this.phase = "resolving"; this.error = null;
    try {
      const response = await this.actions.resolve(this.intent, this.inputs.map(i => ({ ...i, payload: {} })));
      if (!response.ok) throw new Error(response.code);
      this.acceptResolved(response.battle, response.events);
    } catch (e) { this.error = e instanceof Error && e.message ? e.message : "NETWORK"; this.phase = "resolve-error"; }
    finally { this.pending = false; }
  }

  async replay() {
    if (this.pending || !this.intent || this.phase !== "done") return;
    this.pending = true; this.error = null;
    try {
      const response = await this.actions.replay(this.intent);
      if (!response.ok) throw new Error(response.code);
      if (!response.events) throw new Error("REPLAY_UNAVAILABLE");
      this.battle = response.battle;
      this.replayEvents = response.events;
      this.events = []; this.replayTick = 0; this.paused = false;
      const first = response.events.find(e => e.type === "BATTLE_STARTED");
      if (this.view && first?.type === "BATTLE_STARTED") this.view = { ...this.view, tick: 0, petHp: first.petHp, enemyHp: first.enemyHp, enemyPhase: "idle", enemyPhaseUntil: 0, skillReadyAt: 0, ended: false };
      this.phase = "replaying";
    } catch (e) { this.error = e instanceof Error && e.message ? e.message : "NETWORK"; }
    finally { this.pending = false; }
  }
}
