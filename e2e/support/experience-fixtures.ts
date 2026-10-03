import { expect, type Locator, type Page } from "@playwright/test";
export const EXPERIENCE_QA_PREFIX="[QA Experiences] ";
export async function experienceRest(path:string,init:RequestInit={}) {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const host=new URL(url).hostname;
  if(!["127.0.0.1","localhost","tyvzpuhxfwxrnkcpzxyg.supabase.co"].includes(host)) throw new Error("Experience fixtures require local or biblioshare-dev");
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if(!key) throw new Error("Missing fixture service key");
  const response=await fetch(`${url}/rest/v1/${path}`,{...init,headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",...init.headers}});
  if(!response.ok) throw new Error(`Experience fixture REST ${response.status}: ${await response.text()}`);
  return response;
}
export async function experienceOwner() {
  const query=new URLSearchParams({username:`eq.${process.env.TEST_USER_USERNAME}`,select:"user_id"});
  const rows=await (await experienceRest(`profiles?${query}`)).json() as {user_id:string}[];
  expect(rows.length,"persistent QA profile exists").toBe(1);
  return rows[0].user_id;
}
export async function clearExperienceFixtures(owner:string) {
  const query=new URLSearchParams({creator_id:`eq.${owner}`,title:`like.${EXPERIENCE_QA_PREFIX}*`,select:"id"});
  const roots=await (await experienceRest(`experiences?${query}`)).json() as {id:string}[];
  if(!roots.length) return;
  const ids=roots.map(r=>r.id).join(",");
  const photos=await (await experienceRest(`experience_photos?experience_id=in.(${ids})&select=storage_path`)).json() as {storage_path:string}[];
  if(photos.length) {
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,key=process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if(photos.some(p=>!roots.some(r=>p.storage_path.startsWith(`${r.id}/`)))) throw new Error("Photo fixture outside owned roots");
    const removed=await fetch(`${url}/storage/v1/object/experience-photos`,{method:"DELETE",headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({prefixes:photos.map(p=>p.storage_path)})});
    if(!removed.ok) throw new Error(`Photo fixture cleanup ${removed.status}`);
  }
  await experienceRest(`posts?anchor_type=eq.experience&anchor_id=in.(${ids})`,{method:"DELETE"});
  await experienceRest(`experiences?id=in.(${ids})&creator_id=eq.${owner}`,{method:"DELETE"});
  for(const photo of photos) await experienceRest("rpc/experience_ack_photo_cleanup",{method:"POST",body:JSON.stringify({p_path:photo.storage_path})});
}
export async function loginExperienceUser(page:Page,actor?:{email:string;password:string}) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(actor?.email??process.env.TEST_USER_EMAIL!);
  await page.locator('input[name="password"]').fill(actor?.password??process.env.TEST_USER_PASSWORD!);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login/);
}
/** Native radio choices stay operable by keyboard, even with their input visually hidden. */
export async function chooseExperienceRadio(radio:Locator) {
  await expect(radio).toBeEnabled();
  await radio.focus();
  await radio.press("Space");
  await expect(radio).toBeChecked();
}
export async function editExperience(page:Page,id:string) {
  await page.getByRole("button",{name:"Acciones de la experiencia",exact:true}).click();
  await page.getByRole("menuitem",{name:"Editar experiencia",exact:true}).click();
  await expect(page).toHaveURL(`/experiencia/${id}/editar`);
}
/** Leaves the contextual sheet open; saving audience is deliberately separate from publishing. */
export async function setExperienceAudience(page:Page,audience:"private"|"participants"|"profile") {
  await page.getByRole("button",{name:"Compartir el recuerdo",exact:true}).click();
  const sheet=page.getByRole("dialog",{name:"Compartir el recuerdo",exact:true});
  await expect(sheet).toBeVisible();
  const labels={private:"Solo yo",participants:"Acompañantes aceptados",profile:"Quien pueda ver mi perfil"};
  const radio=sheet.getByRole("radio",{name:labels[audience],exact:true});
  if(!await radio.isChecked()) {
    await chooseExperienceRadio(radio);
    const save=sheet.getByRole("button",{name:/^(Guardar cambios|Guardando…)$/});
    await save.click();
    // The save button disappears only when the refreshed projection agrees with the choice.
    await expect(save).toHaveCount(0);
  }
  await expect(radio).toBeChecked();
  return sheet;
}
export async function experienceActor(name:string,isPublic=false) {
  const suffix=crypto.randomUUID().replaceAll("-","").slice(0,12),username=`qa_exp_${suffix}`;
  const actor={email:`${username}@example.invalid`,password:crypto.randomUUID(),username,id:"",name};
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,key=process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if(new URL(url).hostname!=="tyvzpuhxfwxrnkcpzxyg.supabase.co") throw new Error("Synthetic actors require dev");
  const response=await fetch(`${url}/auth/v1/admin/users`,{method:"POST",headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({email:actor.email,password:actor.password,email_confirm:true})});
  if(!response.ok) throw new Error(`Synthetic actor creation ${response.status}`);
  actor.id=(await response.json()).id;
  try {
    await experienceRest("profiles",{method:"POST",headers:{Prefer:"resolution=merge-duplicates"},body:JSON.stringify({user_id:actor.id,username,display_name:name,is_public:isPublic,onboarded_at:new Date().toISOString()})});
    return actor;
  } catch(error) {await deleteExperienceActor(actor);throw error;}
}
export async function deleteExperienceActor(actor:{id:string;email:string}) {
  if(!actor.email.startsWith("qa_exp_")||!actor.email.endsWith("@example.invalid")||!actor.id) throw new Error("Refuse deleting a persistent actor");
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,key=process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if(new URL(url).hostname!=="tyvzpuhxfwxrnkcpzxyg.supabase.co") throw new Error("Synthetic cleanup requires dev");
  const response=await fetch(`${url}/auth/v1/admin/users/${actor.id}`,{method:"DELETE",headers:{apikey:key,Authorization:`Bearer ${key}`}});
  if(!response.ok) throw new Error(`Synthetic cleanup ${response.status}`);
  const absent=await fetch(`${url}/auth/v1/admin/users/${actor.id}`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
  expect(absent.status,"disposable experience actor removed from Auth").toBe(404);
  expect(await (await experienceRest(`profiles?user_id=eq.${actor.id}&select=user_id`)).json(),"disposable experience profile removed").toEqual([]);
}
export async function experienceClientRest(path:string,actor?:{email:string;password:string}) {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if(new URL(url).hostname!=="tyvzpuhxfwxrnkcpzxyg.supabase.co") throw new Error("Actor REST requires dev");
  let token=key;
  if(actor) {
    const auth=await fetch(`${url}/auth/v1/token?grant_type=password`,{method:"POST",headers:{apikey:key,"Content-Type":"application/json"},body:JSON.stringify({email:actor.email,password:actor.password})});
    if(!auth.ok) throw new Error(`Fixture authentication ${auth.status}`);
    token=(await auth.json()).access_token;
  }
  return fetch(`${url}/rest/v1/${path}`,{headers:{apikey:key,Authorization:`Bearer ${token}`}});
}
