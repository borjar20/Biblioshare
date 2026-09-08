import {test,expect,type APIRequestContext} from "@playwright/test";
import {withBattleUsers} from "./support/battle-users";
import old from "../src/lib/pet/battle/versions/r4.1/normative.json";
import current from "../src/lib/pet/battle/versions/r4.2/normative.json";
import {LOOT_ITEMS} from "../src/lib/pet/loot/catalog";

const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const headers={apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Prefer:"return=representation"};
const names=["r4bequipmenta","r4bequipmentb"];
test.beforeAll(()=>expect(["tyvzpuhxfwxrnkcpzxyg.supabase.co","localhost","127.0.0.1"]).toContain(new URL(url).hostname));
async function clean(request:APIRequestContext) {
 const response=await request.get(`${url}/rest/v1/profiles?username=in.(${names.join(",")})&select=user_id`,{headers});
 expect(response.ok()).toBe(true);
 for(const row of await response.json() as {user_id:string}[]) {
  const account=await request.get(`${url}/auth/v1/admin/users/${row.user_id}`,{headers});
  expect(account.ok()).toBe(true);
  expect(names.map(name=>`${name}@example.com`)).toContain((await account.json()).email);
  expect((await request.delete(`${url}/auth/v1/admin/users/${row.user_id}`,{headers})).ok()).toBe(true);
 }
}
const day=(ago:number)=>new Date(Date.now()-ago*86400000).toLocaleDateString("sv-SE",{timeZone:"Europe/Madrid"});
function battleRow(userId:string,ago:number,modern=false) {
 const f=modern?current:old;
 return {id:crypto.randomUUID(),user_id:userId,intent_id:crypto.randomUUID(),kind:"adventure",adventure_day:day(ago),attempt:1,
  enemy_id:f.record.enemyId,ruleset_version:f.record.rulesetVersion,content_hash:f.record.contentHash,seed:f.record.seed,
  snapshot:f.record.snapshot,status:"resolved",inputs:f.record.inputs,result:f.record.result,digest:f.digest,resolved_at:new Date().toISOString()};
}
async function seed(request:APIRequestContext,userId:string) {
 const a={...battleRow(userId,11),reward:{itemId:"sharp_bookmark",slot:"weapon"}};
 const b={...battleRow(userId,12,true),reward:{itemId:"sharp_bookmark",slot:"weapon",qualityBp:12000,qualityVersion:1}};
 const c={...battleRow(userId,13,true),reward:{itemId:"last_page_amulet",slot:"amulet",qualityBp:12000,qualityVersion:1}};
 expect((await request.post(`${url}/rest/v1/pet_battles`,{headers,data:[a,b,c]})).ok()).toBe(true);
 return {a,b,c};
}
async function rpc(request:APIRequestContext,name:string,data:unknown) {
 const response=await request.post(`${url}/rest/v1/rpc/${name}`,{headers,data});
 expect(response.ok(),`${name}: ${await response.text()}`).toBe(true);
 return await response.json();
}
async function token(request:APIRequestContext,user:{email:string;password:string}) {
 const response=await request.post(`${url}/auth/v1/token?grant_type=password`,{headers:{apikey:anon},data:user});
 expect(response.ok()).toBe(true);
 return {apikey:anon,Authorization:`Bearer ${(await response.json()).access_token}`,"Content-Type":"application/json"};
}

test("R4b autoridad: aislamiento, captura atómica y resolución concurrente única",async({request})=>{
 test.setTimeout(120000);
 await clean(request);
 await withBattleUsers(url,key,async create=>{
  const a=await create(names[0]),b=await create(names[1]);
  const copies=await seed(request,a.id); const otherCopies=await seed(request,b.id);
  const equip=(copy:string|null)=>rpc(request,"set_pet_equipment",{p_user:a.id,p_slot:"weapon",p_copy:copy});
  await equip(copies.a.id);
  const intent=crypto.randomUUID();
  const start={p_user:a.id,p_intent:intent,p_seed:current.record.seed,p_enemy:"brote",p_ruleset_version:"r4.2",p_content_hash:current.record.contentHash,
   p_snapshot:{...current.record.snapshot,equipment:{weapon:{copyId:copies.b.id,itemId:"sharp_bookmark",qualityBp:999999},amulet:null}}};
  // Independent requests use separate pooled connections and the same per-user lock.
  const [,rows]=await Promise.all([equip(copies.b.id),rpc(request,"start_pet_training",start)]);
  const captured=rows[0].snapshot.equipment;
  expect([{copyId:copies.a.id,itemId:"sharp_bookmark",qualityBp:10000},{copyId:copies.b.id,itemId:"sharp_bookmark",qualityBp:12000}]).toContainEqual(captured.weapon);
  expect(captured.amulet).toBeNull();
  await equip(copies.a.id);
  expect((await rpc(request,"start_pet_training",start))[0].snapshot).toEqual(rows[0].snapshot);
  const after=await rpc(request,"start_pet_training",{...start,p_intent:crypto.randomUUID()});
  expect(after[0].snapshot.equipment.weapon).toEqual({copyId:copies.a.id,itemId:"sharp_bookmark",qualityBp:10000});
  // A genuine retained record supplies inputs/result/digest; only the fixture's row identity changes.
  const open={...battleRow(a.id,0,true),status:"open",inputs:null,result:null,digest:null,resolved_at:null};
  expect((await request.post(`${url}/rest/v1/pet_battles`,{headers,data:open})).ok()).toBe(true);
  const resolve={p_user:a.id,p_intent:open.intent_id,p_inputs:current.record.inputs,p_result:current.record.result,p_digest:current.digest,
   p_reward_order:LOOT_ITEMS.map(item=>({itemId:item.id,slot:item.slot}))};
  const [first,second]=await Promise.all([rpc(request,"resolve_pet_adventure",resolve),rpc(request,"resolve_pet_adventure",{...resolve,p_reward_order:[...resolve.p_reward_order].reverse()})]);
  expect(first[0].reward).toEqual(second[0].reward);
  expect(first[0].reward.qualityVersion).toBe(1);
  expect([8000,9000,10000,11000,12000]).toContain(first[0].reward.qualityBp);
  const duplicate=await request.post(`${url}/rest/v1/pet_battles`,{headers,data:{...first[0],id:crypto.randomUUID(),intent_id:crypto.randomUUID(),attempt:2}});
  expect(duplicate.status()).toBe(409);
  const other=await request.post(`${url}/rest/v1/rpc/set_pet_equipment`,{headers,data:{p_user:b.id,p_slot:"weapon",p_copy:copies.a.id}});
  expect(other.ok()).toBe(false);expect((await other.json()).message).toBe("NOT_OWNED");
  const authA=await token(request,a),authB=await token(request,b);
  expect(await (await request.get(`${url}/rest/v1/pet_loadout?select=*`,{headers:authB})).json()).toEqual([]);
  expect((await (await request.get(`${url}/rest/v1/pet_loadout?select=*`,{headers:authA})).json())).toHaveLength(1);
  await rpc(request,"set_pet_equipment",{p_user:b.id,p_slot:"weapon",p_copy:otherCopies.b.id});
  for(const [auth,id,copy] of [[authA,a.id,copies.a.id],[authB,b.id,otherCopies.b.id]] as const) {
   const own=await request.get(`${url}/rest/v1/pet_loadout?select=*`,{headers:auth});
   expect(await own.json()).toEqual([expect.objectContaining({user_id:id,weapon_battle_id:copy})]);
   const rewards=await request.get(`${url}/rest/v1/pet_battles?user_id=neq.${id}&select=id`,{headers:auth});
   expect(await rewards.json()).toEqual([]);
  }
  for(const auth of [authA,authB,{apikey:anon}]) {
   const denied=await request.post(`${url}/rest/v1/rpc/set_pet_equipment`,{headers:auth,data:{p_user:a.id,p_slot:"weapon",p_copy:copies.b.id}});
   expect([401,403]).toContain(denied.status());
   const write=await request.patch(`${url}/rest/v1/pet_loadout?user_id=eq.${a.id}`,{headers:auth,data:{weapon_battle_id:copies.b.id}});
   expect([401,403]).toContain(write.status());
  }
  const legacy=await request.get(`${url}/rest/v1/pet_battles?id=eq.${copies.a.id}&select=reward`,{headers});
  expect((await legacy.json())[0].reward).toEqual(copies.a.reward);
 });
});

test("R4b interfaz: comparar copias, equipar, efecto real y entrenamiento sin botín",async({page,request})=>{
 test.setTimeout(180000);
 await clean(request);
 await withBattleUsers(url,key,async create=>{
  const user=await create(names[0]);const copies=await seed(request,user.id);
  expect((await request.post(`${url}/rest/v1/pet_state`,{headers,data:{user_id:user.id,name:"Nuez",class:"wizard"}})).ok()).toBe(true);
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.setViewportSize({width:390,height:844});
  await page.goto("/login?next=/mascota");
  await page.locator('input[name="email"]').fill(user.email);await page.locator('input[name="password"]').fill(user.password);
  await page.locator('button[type="submit"]').click();await expect(page).toHaveURL(/\/mascota$/,{timeout:30000});
  const equipment=page.getByTestId("pet-equipment");await expect(equipment).toBeVisible();
  for(const copy of [copies.b,copies.c]) {
   await equipment.locator(`[data-item="${copy.reward.itemId}"] summary`).click();
   const compare=equipment.locator(`[data-copy="${copy.id}"]`).getByRole("button",{name:"Comparar"});
   await compare.focus();await compare.press("Enter");
   await expect(equipment.getByTestId("loot-comparison")).toContainText("Potencia ×1,2");
   await expect(equipment.getByTestId("loot-comparison")).toBeFocused();
   await equipment.getByRole("button",{name:"Equipar para el próximo combate",exact:true}).click();
   await expect(equipment.getByTestId(`equipped-${copy.reward.slot}`)).toContainText("Potencia ×1,2");
  }
  await equipment.screenshot({path:".superpowers/r4b-equipo-mobile.png"});
  await page.reload();await expect(page.getByTestId("equipped-weapon")).toContainText("Potencia ×1,2");
  const training=page.getByTestId("pet-training");await training.getByRole("button",{name:"Empezar combate",exact:true}).click();
  await expect(training.getByTestId("training-tick")).toBeVisible();
  const rows=await (await request.get(`${url}/rest/v1/pet_battles?user_id=eq.${user.id}&kind=eq.training&select=*`,{headers})).json();
  expect(rows).toHaveLength(1);expect(rows[0].ruleset_version).toBe("r4.2");
  expect(rows[0].snapshot.equipment.weapon).toMatchObject({copyId:copies.b.id,qualityBp:12000});
  expect(rows[0].snapshot.equipment.amulet).toMatchObject({copyId:copies.c.id,qualityBp:12000});
  await training.getByLabel("Velocidad").selectOption("2");
  await training.locator('button[aria-describedby="training-ulti-summary"]').click({timeout:20000});
  await training.getByRole("button",{name:"Saltar · daño base",exact:true}).click();
  await expect(training.getByTestId("loot-feedback")).toContainText("Amuleto de la Última Página");
  await training.screenshot({path:".superpowers/r4b-efecto-mobile.png"});
  await expect(training.getByRole("button",{name:"Ver repetición",exact:true})).toBeVisible({timeout:60000});
  const wins=await (await request.get(`${url}/rest/v1/pet_battles?user_id=eq.${user.id}&reward=not.is.null&select=id`,{headers})).json();
  expect(wins).toHaveLength(3);expect(errors).toEqual([]);
  await page.emulateMedia({reducedMotion:"reduce"});
  await training.getByRole("button",{name:"Ver repetición",exact:true}).click();
  await expect(training.getByTestId("loot-feedback")).toContainText("Amuleto de la Última Página",{timeout:20000});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)).toBe(false);
 });
});
