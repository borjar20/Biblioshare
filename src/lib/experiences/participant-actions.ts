"use server";
import {createClient} from "@/lib/supabase/server";
import {usersAreBlocked} from "@/lib/social/block-state";
import {notify} from "@/lib/social/notifications";
import type {Json} from "@/lib/supabase/database.types";
import type {AttendanceState,ExperienceResult} from "./types";
import {experienceMutation} from "./mutation";
import {isExperienceId,validateGuestName} from "./validation";
type Client=Awaited<ReturnType<typeof createClient>>;
type Result={id?:string;experienceId:string;notifyUserId?:string;notifyActorId?:string};
async function participation(valid:boolean,work:(client:Client)=>PromiseLike<{data:Json|null;error:{code?:string}|null}>,kind?:"experience_invited"|"experience_accepted",root?:string):Promise<ExperienceResult<Result>> {
  return experienceMutation<Result>(valid,async client=>{
    const result=await work(client),data=result.data as Result|null;
    if(!result.error&&kind&&data?.notifyUserId&&data.notifyActorId&&data.id) {
      await notify(client,{userId:data.notifyUserId,actorId:data.notifyActorId,type:kind,targetType:"experience",targetId:data.experienceId,dedupeKey:`${kind}:${data.id}`,context:undefined});
    }
    return result;
  },root);
}
export async function inviteParticipant(id:string,person:string) {
  return participation(isExperienceId(id)&&isExperienceId(person),client=>client.rpc("experience_invite",{p_id:id,p_user_id:person}),"experience_invited",id);
}
export async function addGuest(id:string,name:string) {
  const value=validateGuestName(name);
  return participation(isExperienceId(id)&&Boolean(value),client=>client.rpc("experience_add_guest",{p_id:id,p_name:value!}),undefined,id);
}
export async function respondInvitation(id:string,response:"accept"|"decline") {
  return participation(isExperienceId(id)&&["accept","decline"].includes(response),client=>client.rpc("experience_respond_invitation",{p_participant_id:id,p_response:response}),response==="accept" ? "experience_accepted" : undefined);
}
export async function setMomentAttendance(id:string,state:AttendanceState,dropReviews=false) {
  return participation(isExperienceId(id)&&["planned","attended","skipped"].includes(state)&&typeof dropReviews==="boolean",client=>client.rpc("experience_set_attendance",{p_moment_id:id,p_state:state,p_drop_reviews:dropReviews}));
}
export async function setGuestAttendance(moment:string,person:string,state:AttendanceState) {
  return participation(isExperienceId(moment)&&isExperienceId(person)&&["planned","attended","skipped"].includes(state),client=>client.rpc("experience_set_guest_attendance",{p_moment_id:moment,p_participant_id:person,p_state:state}));
}
export async function setFavorite(id:string,moment:string|null) {
  return participation(isExperienceId(id)&&(moment===null||isExperienceId(moment)),client=>client.rpc("experience_set_favorite",{p_id:id,p_moment_id:moment??undefined}),undefined,id);
}
export async function setShareIdentity(id:string,enabled:boolean) {
  return participation(isExperienceId(id)&&typeof enabled==="boolean",client=>client.rpc("experience_set_share_identity",{p_id:id,p_enabled:enabled}),undefined,id);
}
export async function removeParticipant(id:string) {
  return participation(isExperienceId(id),client=>client.rpc("experience_remove_participant",{p_participant_id:id}));
}
export async function findExperienceAccount(username:string):Promise<ExperienceResult<{id:string;username:string;name:string}>> {
  try {
    const client=await createClient(),{data:{user}}=await client.auth.getUser();
    if(!user) return {ok:false,error:"unauthenticated"};
    if(typeof username!=="string"||!/^@?[a-zA-Z0-9_]{3,30}$/.test(username.trim())) return {ok:false,error:"invalid"};
    const {data,error}=await client.from("profile_identities").select("user_id,username,display_name").eq("username",username.trim().replace(/^@/,"").toLowerCase()).maybeSingle();
    if(error) return {ok:false,error:"unknown"};
    if(!data?.user_id||!data.username||data.user_id===user.id||await usersAreBlocked(client,data.user_id)) return {ok:false,error:"not_found"};
    return {ok:true,data:{id:data.user_id,username:data.username,name:data.display_name??data.username}};
  } catch {return {ok:false,error:"unknown"};}
}
