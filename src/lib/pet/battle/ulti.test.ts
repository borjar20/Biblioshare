import { describe, expect, it } from "vitest";
import { createUltiPuzzle, scoreUlti } from "./ulti";
import { CAPARAZON, RULESET, contentHash } from "./content";
import { createBattle, simulate, stepBattle, viewOf } from "./engine";
import { validateInputs } from "./inputs";
import { seedFromIndex } from "./prng";
import { snapshotForProfile } from "./profiles";
import { getBattleRelease, replayBattle } from "./replay";
import type { BattleInput } from "./types";
const seed = seedFromIndex(7);
const ctx = { seed, snapshot: snapshotForProfile("lectora_larga", "wizard"), enemy: CAPARAZON, ruleset: RULESET };
const input = (order: string, tick = 120, seq = 0): BattleInput => ({ seq, tick, action: "ulti", payload: { order } });
function ready() { const st = createBattle(ctx); while(st.tick < 120) stepBattle(ctx, st, []); return st; }
describe("R3 ulti", () => {
  it("generates distinct permutations and scores positional matches, ties to power", () => {
    for (let i = 0; i < 100; i++) {
      const s = seedFromIndex(i), puzzle = createUltiPuzzle(s, 120);
      expect(puzzle).toEqual(createUltiPuzzle(s, 120));
      expect(puzzle.recipes[0].order).not.toEqual(puzzle.recipes[1].order);
      for(const r of puzzle.recipes) {
        expect([...r.order].sort()).toEqual([0,1,2,3]);
        expect(scoreUlti(s,120,r.order.join(""))).toEqual({recipe:r.id,matches:4});
      }
    }
    expect(scoreUlti(seed,120,"")).toEqual({recipe:null,matches:0});
  });
  it("rejects premature, duplicate and manipulated payloads", () => {
    for (const inputs of [[input("",119)], [input(""),input("0123",121,1)], [input("0012")], [input("01234")], [{...input(""),payload:{order:"",score:4}}]]) expect(validateInputs(inputs,RULESET).ok).toBe(false);
    expect(validateInputs([input("")],RULESET).ok).toBe(true);
    const st=ready(); expect(() => stepBattle(ctx,st,[input("0012")])).toThrow("INVALID_INPUTS");
    stepBattle(ctx,st,[input("")]); expect(() => stepBattle(ctx,st,[input("",121)])).toThrow("INVALID_INPUTS");
  });
  it("keeps the base hit on skip and isolates enemy RNG", () => {
    const a=ready(), b=ready();
    const out=stepBattle(ctx,a,[input("")]); stepBattle(ctx,b,[]);
    const ev=out.find(e=>e.type==="ULTI_USED");
    expect(ev).toMatchObject({recipe:null,matches:0,damage:ctx.snapshot.atk*4,shield:0});
    expect(a.rng).toEqual(b.rng);
    expect(viewOf(a)).toMatchObject({ultiReadyAt:120,ultiUsed:true,shield:0});
  });
  it("power adds 2x attack and guard absorbs future damage", () => {
    const recipes=createUltiPuzzle(seed,120).recipes;
    const a=ready(),b=ready();
    expect(stepBattle(ctx,a,[input(recipes[0].order.join(""))]).find(e=>e.type==="ULTI_USED")).toMatchObject({damage:ctx.snapshot.atk*6});
    stepBattle(ctx,b,[input(recipes[1].order.join(""))]);
    const initial=Math.floor(ctx.snapshot.hpMax/5); expect(b.pet.shield).toBe(initial);
    const hp=b.pet.hp; b.enemy.phase="idle";b.enemy.phaseUntil=200;b.enemy.nextBasic=b.tick;
    stepBattle(ctx,b,[]);expect(b.pet.hp).toBe(hp);expect(b.pet.shield).toBeLessThan(initial);
  });
  it("caparazon cycles guard/vulnerable/idle and doubles hits", () => {
    const st=createBattle(ctx);while(st.enemy.phase!=="vulnerable") stepBattle(ctx,st,[]);
    const out=stepBattle(ctx,st,[{seq:0,tick:st.tick,action:"skill",payload:{}}]);
    expect(out.find(e=>e.type==="SKILL_USED")).toMatchObject({effect:"vulnerable",damage:ctx.snapshot.atk*4});
    while(st.enemy.phase==="vulnerable")stepBattle(ctx,st,[]);expect(st.enemy.phase).toBe("idle");
  });
  it("rejects inputs after an input KO in the same tick", () => {
    const st=ready();st.enemy.hp=1;
    expect(()=>stepBattle(ctx,st,[input(""),{seq:1,tick:120,action:"skill",payload:{}}])).toThrow("INPUTS_AFTER_END");
  });
  it("replays R3 deterministically including barrier and ulti", async () => {
    const inputs=[input(createUltiPuzzle(seed,120).recipes[1].order.join(""))];
    const a=simulate(ctx,inputs);expect(a).toEqual(simulate(ctx,inputs));
    const out=await replayBattle({rulesetVersion:RULESET.version,contentHash:await contentHash(),enemyId:CAPARAZON.id,seed,snapshot:ctx.snapshot,inputs});
    expect(out.ok).toBe(true);if(out.ok)expect(out.events).toEqual(a.events);
  });
});

it("R2 resolution retains strict payload validation while replay stays historical", () => {
  const release=getBattleRelease("r2.2","2c40a90c9f141ffd2eda8241c83eb8859a712dbe4606798b56b90fb056b159d3")!;
  const hidden=Object.defineProperty({},"hidden",{value:1});
  for(const payload of [new Date(), {[Symbol("secret")]:1}, hidden, Object.create({x:1})]) {
    expect(release.validateInputs([{seq:0,tick:0,action:"skill",payload}]).ok).toBe(false);
  }
});

it("an intent selected before a lethal transition is ignored at that same tick", () => {
 const st=ready();st.pet.hp=1;st.enemy.phase="windup";st.enemy.phaseUntil=120;
 const events=stepBattle(ctx,st,[input("")]);
 expect(st.ended).toBe(true);expect(events.some(e=>e.type==="ULTI_USED")).toBe(false);
 expect(()=>stepBattle(ctx,st,[])).toThrow("BATTLE_ENDED");
});
