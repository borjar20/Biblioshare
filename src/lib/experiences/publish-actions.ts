"use server";
import type {ExperienceResult} from "./types";
import {createClient} from "@/lib/supabase/server";
import {revalidateExperiences} from "@/lib/reactivity/revalidate";
import {notifyFollowersOfPost} from "@/lib/social/notify-followers";
import {isExperienceId} from "./validation";
import {experienceMutation,experienceSqlError} from "./mutation";
export async function publishExperience(id:string):Promise<ExperienceResult<{id:string}>> {
  try {
    const client=await createClient();const {data:{user}}=await client.auth.getUser();
    if(!user)return {ok:false,error:"unauthenticated"};
    if(!isExperienceId(id))return {ok:false,error:"invalid"};
    const result=await client.rpc("experience_publish",{p_id:id});
    if(result.error)return {ok:false,error:experienceSqlError(result.error.code)};
    const data=result.data as {id:string;created:boolean;actorId:string;targetId:string};
    if(!isExperienceId(data?.id))return {ok:false,error:"unknown"};
    revalidateExperiences(id);
    if(data.created&&data.actorId===user.id&&isExperienceId(data.targetId))await notifyFollowersOfPost(client,user.id,{postId:data.id,kind:"experience",interactionTargetId:data.targetId});
    return {ok:true,data:{id:data.id}};
  } catch {return {ok:false,error:"unknown"};}
}
export async function unpublishExperience(id:string):Promise<ExperienceResult<null>> {
  const result=await experienceMutation(isExperienceId(id),client=>client.rpc("experience_unpublish",{p_id:id}),id);
  return result.ok?{ok:true,data:null}:result;
}
