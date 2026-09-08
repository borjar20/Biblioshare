import {expect,it} from "vitest";
import fixture from "./versions/r4.2/normative.json";
import {replayBattle,type StoredBattleInput} from "./replay";
it("reproduces the equipped chain including effective loot activations",async()=>{
 const result=await replayBattle(fixture.record as StoredBattleInput);
 expect(result.ok).toBe(true);
 if(!result.ok)return;
 expect(result.digest).toBe(fixture.digest);
 expect(result.events).toEqual(fixture.events);
 expect(result.result).toEqual(fixture.record.result);
 expect(new Set(result.events.filter(event=>event.type==="LOOT_EFFECT").map(event=>event.itemId))).toEqual(new Set(["sharp_bookmark","last_page_amulet"]));
});
