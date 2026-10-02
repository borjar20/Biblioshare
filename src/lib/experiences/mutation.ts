import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { revalidateExperiences } from "@/lib/reactivity/revalidate";
import type { ExperienceError, ExperienceResult } from "./types";
type Client=Awaited<ReturnType<typeof createClient>>;
type Query=PromiseLike<{data:Json|null;error:{code?:string}|null}>;

export function experienceSqlError(code?:string):ExperienceError {
  if(code==="42501") return "forbidden";
  if(code==="PT409"||code==="40001") return "conflict";
  if(code==="PT404"||code==="PGRST116") return "not_found";
  if(code==="PT429") return "limit";
  if(code?.startsWith("22")||code?.startsWith("23")) return "invalid";
  return "unknown";
}
export function validRevision(value:unknown):value is number {
  return typeof value==="number" && Number.isSafeInteger(value) && value>=0;
}
export async function experienceMutation<T>(valid:boolean,work:(client:Client)=>Query,rootId?:string):Promise<ExperienceResult<T>> {
  try {
    const client=await createClient();
    const {data:{user}}=await client.auth.getUser();
    if(!user) return {ok:false,error:"unauthenticated"};
    if(!valid) return {ok:false,error:"invalid"};
    const {data,error}=await work(client);
    if(error) return {ok:false,error:experienceSqlError(error.code)};
    const createdId=data && typeof data==="object" && !Array.isArray(data) ? typeof data.experienceId==="string" ? data.experienceId : typeof data.id==="string" ? data.id : undefined : undefined;
    revalidateExperiences(rootId??createdId);
    return {ok:true,data:data as T};
  } catch {return {ok:false,error:"unknown"};}
}
