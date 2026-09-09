import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { expect, it } from "vitest";
import { LOOT_ITEMS } from "./catalog";
import { LOOT_ART, LOOT_FX, LOOT_FX_CELL, LOOT_FX_FRAMES } from "./art";
it("every item and effect has transparent pixel art and a matching cache hash", async () => {
  expect(Object.keys(LOOT_ART).sort()).toEqual(LOOT_ITEMS.map(item => item.id).sort());
  for (const [url,width] of [...LOOT_ITEMS.map(item => [LOOT_ART[item.id].icon,64] as const), ...Object.values(LOOT_FX).map(url => [url,LOOT_FX_CELL * LOOT_FX_FRAMES] as const)]) {
    const [path,query]=url.split("?");
    const data=readFileSync(`public${path}`);
    expect(new URLSearchParams(query).get("v")).toBe(createHash("sha1").update(data).digest("hex").slice(0,10));
    expect(await sharp(data).metadata()).toMatchObject({width,height:64,hasAlpha:true});
    const raw=await sharp(data).ensureAlpha().raw().toBuffer();
    const alphas=raw.filter((_,i)=>i%4===3);
    expect(alphas.some(alpha=>alpha===0)).toBe(true);
    expect(alphas.some(alpha=>alpha>0)).toBe(true);
  }
});
