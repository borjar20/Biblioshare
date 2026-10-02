import { expect, type Page } from "@playwright/test";
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
  await experienceRest(`posts?anchor_type=eq.experience&anchor_id=in.(${ids})`,{method:"DELETE"});
  await experienceRest(`experiences?id=in.(${ids})&creator_id=eq.${owner}`,{method:"DELETE"});
}
export async function loginExperienceUser(page:Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(process.env.TEST_USER_EMAIL!);
  await page.locator('input[name="password"]').fill(process.env.TEST_USER_PASSWORD!);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login/);
}
