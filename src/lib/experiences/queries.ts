import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { ExperienceDetail, ExperienceFilters, ExperiencePage, ExperiencePreview, ExperienceInvitation,ExperiencePhoto,ExperienceOwnPhotoPage,ExperienceCompanion,ExperienceOwnMembership,ExperienceRating,ExperienceReview } from "./types";
import { MOMENT_KINDS } from "./types";
import { isExperienceId } from "./validation";

type Client=Awaited<ReturnType<typeof createClient>>;
type Root=Database["public"]["Tables"]["experiences"]["Row"];
function cursor(value?:string):{createdAt:string;id:string}|null {
  if(!value||value.length>240) return null;
  try {
    const parsed=JSON.parse(Buffer.from(value,"base64url").toString("utf8"));
    if(typeof parsed.createdAt!=="string"||!/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|\+00:00)$/.test(parsed.createdAt)||!Number.isFinite(Date.parse(parsed.createdAt))||!isExperienceId(parsed.id)) return null;
    return parsed;
  } catch {return null;}
}
// moment_id is NULL on the experience-level row (SQL GROUPING SETS), though the generated types say string.
type SummaryRow={experience_id:string;moment_id:string|null;avg_rating:number;rating_count:number};
export function ratingsByRoot(rows:SummaryRow[]):Map<string,{rating:ExperienceRating|null;momentRatings:Record<string,ExperienceRating>}> {
  const map=new Map<string,{rating:ExperienceRating|null;momentRatings:Record<string,ExperienceRating>}>();
  for(const row of rows) {
    const entry=map.get(row.experience_id)??{rating:null,momentRatings:{}};
    const value={avg:Number(row.avg_rating),count:row.rating_count};
    if(row.moment_id) entry.momentRatings[row.moment_id]=value; else entry.rating=value;
    map.set(row.experience_id,entry);
  }
  return map;
}
type ReviewRow={id:string;moment_id:string;author_id:string;rating:number|null;body:string|null;share_with_profile:boolean;created_at:string;updated_at:string};
type Identity={username:string|null;display_name:string|null;avatar_url:string|null};
export function mapReviews(rows:ReviewRow[],identities:Map<string,Identity>,publications:Map<string,string>,viewerId:string|null):ExperienceReview[] {
  return rows.map(r=>({id:r.id,momentId:r.moment_id,authorId:r.author_id,authorName:identities.get(r.author_id)?.display_name??null,authorUsername:identities.get(r.author_id)?.username??null,authorAvatarUrl:identities.get(r.author_id)?.avatar_url??null,
    rating:r.rating,body:r.body,shareWithProfile:r.share_with_profile,isAuthor:r.author_id===viewerId,publicationId:publications.get(r.id)??null,createdAt:r.created_at,updatedAt:r.updated_at}));
}
export function parseExperienceFilters(params:Record<string,string|string[]|undefined>):ExperienceFilters {
  const first=(key:string)=>typeof params[key]==="string" ? params[key] as string : undefined;
  const state=first("state"),kind=first("kind"),companion=first("companion");
  return {
    state:["planned","lived","cancelled"].includes(state??"") ? state as ExperienceFilters["state"] : "all",
    kind:MOMENT_KINDS.includes(kind as never) ? kind as ExperienceFilters["kind"] : undefined,
    companion:isExperienceId(companion) ? companion : undefined,
    cursor:cursor(first("cursor")) ? first("cursor") : undefined,
    sort:first("sort")==="rating" ? "rating" : "recent",
    offset:(()=>{const n=Number(first("offset"));return Number.isInteger(n)&&n>=0&&n<=10000 ? n : 0;})(),
  };
}
/** Uses the caller's RLS for every relation; shared with the social batch mapper. */
export async function getExperiencePreviews(client:Client,roots:Root[]):Promise<ExperiencePreview[]> {
  if(!roots.length) return [];
  if(roots.length>20) {
    const batches=[];for(let start=0;start<roots.length;start+=20) batches.push(roots.slice(start,start+20));
    return (await Promise.all(batches.map(batch=>getExperiencePreviews(client,batch)))).flat();
  }
  const ids=roots.map(r=>r.id);
  const [moments,people,covers,summaries]=await Promise.all([
    client.from("experience_moments").select("*").in("experience_id",ids).order("position"),
    client.from("experience_participants").select("*").in("experience_id",ids).order("created_at").order("id"),
    client.rpc("get_experience_cover_photos",{p_ids:ids}),
    client.rpc("get_experience_rating_summaries",{p_ids:ids}),
  ]);
  if(moments.error) throw moments.error;
  if(people.error) throw people.error;
  if(covers.error) throw covers.error;
  if(summaries.error) throw summaries.error;
  const ratings=ratingsByRoot((summaries.data??[]) as SummaryRow[]);
  const coverByRoot=new Map((covers.data as {experienceId:string;id:string}[]).map(p=>[p.experienceId,p.id]));
  const userIds=[...new Set((people.data??[]).flatMap(p=>p.user_id ? [p.user_id] : []))];
  const identities=userIds.length ? await client.from("profile_identities").select("user_id,username,display_name,avatar_url").in("user_id",userIds) : {data:[],error:null};
  if(identities.error) throw identities.error;
  const byId=new Map((identities.data??[]).map(p=>[p.user_id,p]));
  return roots.map(root=>({
    id:root.id,creatorId:root.creator_id,title:root.title,shape:root.shape as ExperiencePreview["shape"],state:root.state as ExperiencePreview["state"],audience:root.audience as ExperiencePreview["audience"],rating:ratings.get(root.id)?.rating??null,momentRatings:ratings.get(root.id)?.momentRatings??{},startsOn:root.starts_on,endsOn:root.ends_on,coverPhotoId:coverByRoot.get(root.id)??null,createdAt:root.created_at,revision:root.revision,
    moments:(moments.data??[]).filter(m=>m.experience_id===root.id).map(m=>({id:m.id,title:m.title,kind:m.kind as ExperiencePreview["moments"][number]["kind"],placeLabel:m.place_label,startsOn:m.starts_on,endsOn:m.ends_on,position:m.position})),
    participants:(people.data??[]).filter(p=>p.experience_id===root.id).map(p=>({id:p.id,userId:p.user_id,guestName:p.guest_name,invitationState:p.invitation_state as ExperiencePreview["participants"][number]["invitationState"],shareIdentity:p.share_identity,username:byId.get(p.user_id)?.username??null,displayName:byId.get(p.user_id)?.display_name??null,avatarUrl:byId.get(p.user_id)?.avatar_url??null})),
  }));
}
export async function getExperiences(filters:ExperienceFilters={}):Promise<ExperiencePage> {
  const client=await createClient();
  const {data:{user}}=await client.auth.getUser();
  if(!user) return {items:[],nextCursor:null};
  if(filters.sort==="rating") {
    const offset=filters.offset??0;
    const {data,error}=await client.rpc("get_own_experiences_ranked",{p_state:filters.state??"all",p_kind:filters.kind,p_companion:filters.companion,p_offset:offset});
    if(error) throw error;
    const rows=(data??[]) as unknown as Root[],page=rows.slice(0,20);
    return {items:await getExperiencePreviews(client,page),nextCursor:rows.length>20?String(offset+20):null};
  }
  const attendance=filters.state==="lived" ? ",experience_moment_participants!inner(attendance_state)" : "";
  const kind=filters.kind ? ",kinds:experience_moments!inner(kind)" : "";
  const companion=filters.companion&&isExperienceId(filters.companion) ? ",companion:experience_participants!inner(id,user_id)" : "";
  let query=client.from("experiences").select(`*,mine:experience_participants!inner(id,user_id,invitation_state${attendance})${kind}${companion}`)
    .eq("mine.user_id",user.id).eq("mine.invitation_state","accepted")
    .order("created_at",{ascending:false}).order("id",{ascending:false}).limit(21);
  if(filters.state==="lived") query=query.eq("mine.experience_moment_participants.attendance_state","attended").neq("state","cancelled");
  else if(filters.state==="planned"||filters.state==="cancelled") query=query.eq("state",filters.state);
  if(filters.kind) query=query.eq("kinds.kind",filters.kind);
  if(companion) query=query.or(`user_id.eq.${filters.companion},id.eq.${filters.companion}`,{referencedTable:"companion"});
  const after=cursor(filters.cursor);
  if(after) query=query.or(`created_at.lt.${after.createdAt},and(created_at.eq.${after.createdAt},id.lt.${after.id})`);
  const {data,error}=await query;
  if(error) throw error;
  const rows=(data??[]) as unknown as Root[];
  const page=rows.slice(0,20),last=page.at(-1);
  return {items:await getExperiencePreviews(client,page),nextCursor:rows.length>20&&last ? Buffer.from(JSON.stringify({createdAt:last.created_at,id:last.id})).toString("base64url") : null};
}
export async function getExperience(id:string):Promise<ExperienceDetail|null> {
  if(!isExperienceId(id)) return null;
  const client=await createClient();
  const {data:root,error}=await client.from("experiences").select("*").eq("id",id).maybeSingle();
  if(error) throw error;
  if(!root) return null;
  const [previews,auth,attendance,favorites,photos]=await Promise.all([
    getExperiencePreviews(client,[root]),client.auth.getUser(),
    readAttendance(client,id),
    client.from("experience_favorites").select("*").eq("experience_id",id),
    client.rpc("get_experience_visible_photos",{p_id:id}),
  ]);
  if(attendance.error) throw attendance.error;
  if(favorites.error) throw favorites.error;
  if(photos.error) throw photos.error;
  const viewerId=auth.data.user?.id??null,preview=previews[0];
  const canEdit=viewerId!==null&&root.creator_id===viewerId;
  const reviewRows=await client.from("experience_moment_reviews").select("id,moment_id,author_id,rating,body,share_with_profile,created_at,updated_at").eq("experience_id",id).order("created_at");
  if(reviewRows.error) throw reviewRows.error;
  const ownReviewIds=(reviewRows.data??[]).filter(r=>r.author_id===viewerId).map(r=>r.id);
  const authorIds=[...new Set((reviewRows.data??[]).map(r=>r.author_id))];
  const [authors,pubs]=await Promise.all([
    authorIds.length?client.from("profile_identities").select("user_id,username,display_name,avatar_url").in("user_id",authorIds):Promise.resolve({data:[],error:null}),
    viewerId&&ownReviewIds.length?client.rpc("get_experience_review_publications",{p_ids:ownReviewIds}):Promise.resolve({data:[],error:null}),
  ]);
  if(authors.error) throw authors.error; if(pubs.error) throw pubs.error;
  const reviews=mapReviews(reviewRows.data??[],new Map((authors.data??[]).flatMap(a=>a.user_id?[[a.user_id,a] as const]:[])),new Map((pubs.data??[]).map(p=>[p.review_id,p.post_id])),viewerId);
  const [publication,target]=await Promise.all([
    canEdit?client.rpc("get_experience_publication",{p_id:id}):Promise.resolve({data:null,error:null}),
    client.from("interaction_targets").select("id").eq("kind","experience").eq("source_id",id).maybeSingle(),
  ]);
  if(publication.error)throw publication.error;if(target.error)throw target.error;
  return {...preview,viewerId,canEdit,canContribute:canEdit||(viewerId!==null&&preview.participants.some(p=>p.userId===viewerId&&p.invitationState==="accepted")),
    publicationId:publication.data,interactionTargetId:target.data?.id??null,reviews,
    attendance:(attendance.data??[]).map(a=>({momentId:a.moment_id,participantId:a.participant_id,state:a.attendance_state as ExperienceDetail["attendance"][number]["state"]})),
    favorites:(favorites.data??[]).map(f=>({userId:f.user_id,momentId:f.moment_id})),
    photos:(photos.data as unknown as ExperiencePhoto[]).map(p=>({...p,canManage:p.canManage===true,isAuthor:p.isAuthor===true})),
  };
}
export async function getProfileExperiences(userId:string,filters:ExperienceFilters={}):Promise<ExperiencePage> {
  if(!isExperienceId(userId))return {items:[],nextCursor:null};
  const client=await createClient(),after=cursor(filters.cursor);
  const {data,error}=await client.rpc("get_profile_experiences",{p_user_id:userId,p_state:filters.state??"all",p_kind:filters.kind,p_after_created:after?.createdAt,p_after_id:after?.id});
  if(error)throw error;
  const rows=data??[],page=rows.slice(0,20),last=page.at(-1);
  return {items:await getExperiencePreviews(client,page),nextCursor:rows.length>20&&last?Buffer.from(JSON.stringify({createdAt:last.created_at,id:last.id})).toString("base64url"):null};
}
/** Mejor reseña propia por experiencia para la pestaña del perfil: la de nota más alta, y a igualdad la más reciente.
 * Solo las que su autor decidió mostrar en el perfil (share_with_profile): la RLS dejaría ver al propio autor y al
 * grupo también las no compartidas, y el perfil no es el sitio para ellas. Sin `use cache` (depende de la sesión, #437). */
export async function getProfileReviewExcerpts(userId:string,experienceIds:string[]):Promise<Map<string,{momentId:string;rating:number|null;body:string|null}>> {
  if(!isExperienceId(userId)||!experienceIds.length) return new Map();
  const client=await createClient();
  const {data,error}=await client.from("experience_moment_reviews").select("experience_id,moment_id,rating,body,created_at").eq("author_id",userId).eq("share_with_profile",true).in("experience_id",experienceIds)
    .order("rating",{ascending:false,nullsFirst:false}).order("created_at",{ascending:false});
  if(error) throw error;
  const map=new Map<string,{momentId:string;rating:number|null;body:string|null}>();
  for(const r of data??[]) if(!map.has(r.experience_id)) map.set(r.experience_id,{momentId:r.moment_id,rating:r.rating,body:r.body});
  return map;
}
async function readAttendance(client:Client,id:string) {
  // 50 moments × 30 people exceeds PostgREST's 1,000-row response cap.
  const query=()=>client.from("experience_moment_participants").select("*").eq("experience_id",id).order("moment_id").order("participant_id");
  const first=await query().range(0,999);
  if(first.error||first.data.length<1000) return first;
  const rest=await query().range(1000,1999);
  return {data:[...first.data,...(rest.data??[])],error:rest.error};
}
export async function getExperienceInvitations():Promise<ExperienceInvitation[]> {
  const client=await createClient(),{data,error}=await client.rpc("get_experience_invitations");
  if(error) throw error;
  return (data??[]).map(row=>({participantId:row.participant_id,experienceId:row.experience_id,title:row.title,startsOn:row.starts_on,endsOn:row.ends_on,organizer:{id:row.creator_id,username:row.username,name:row.display_name??row.username,avatarUrl:row.avatar_url}}));
}
export async function getExperienceOwnPhotos(afterCursor?:string):Promise<ExperienceOwnPhotoPage> {
  const client=await createClient(),after=cursor(afterCursor);
  let query=client.rpc("get_experience_orphan_photos").order("created_at",{ascending:false}).order("id",{ascending:false}).limit(21);
  if(after) query=query.or(`created_at.lt.${after.createdAt},and(created_at.eq.${after.createdAt},id.lt.${after.id})`);
  const {data,error}=await query;if(error) throw error;
  const rows=(data??[]).slice(0,20),last=rows.at(-1);
  return {items:rows.map(p=>({id:p.id,createdAt:p.created_at})),nextCursor:data!.length>20&&last ? Buffer.from(JSON.stringify({createdAt:last.created_at,id:last.id})).toString("base64url") : null};
}
export async function getExperienceCompanions():Promise<ExperienceCompanion[]> {
  const client=await createClient(),people:ExperienceCompanion[]=[];
  for(let offset=0;;offset+=1000) {
    const {data,error}=await client.rpc("get_experience_companions").order("user_id",{nullsFirst:true}).order("id").range(offset,offset+999);
    if(error)throw error;
    people.push(...(data??[]).map(p=>({id:p.id,userId:p.user_id,guestName:p.guest_name,username:p.username,displayName:p.display_name,avatarUrl:p.avatar_url})));
    if(!data||data.length<1000)return people;
  }
}
export async function getExperienceOwnMemberships():Promise<ExperienceOwnMembership[]> {
  const client=await createClient(),memberships:ExperienceOwnMembership[]=[];
  for(let offset=0;;offset+=1000) {
    const {data,error}=await client.rpc("get_experience_own_memberships").order("created_at",{ascending:false}).order("participant_id").range(offset,offset+999);
    if(error)throw error;
    memberships.push(...(data??[]).map(p=>({participantId:p.participant_id,experienceId:p.experience_id,title:p.title,createdAt:p.created_at,shareIdentity:p.share_identity})));
    if(!data||data.length<1000)return memberships;
  }
}
