import {expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/server",()=>({getCurrentUser:async()=>null}));
vi.mock("@/lib/experiences/queries",()=>({getExperiencePreviews:async(_client:unknown,roots:{id:string;title:string}[])=>roots.map(root=>({moments:[],...root,participants:[],coverPhotoId:null}))}));
import {getFeed,getPostEvent} from "./feed";
import {fakeSupabase,FAKE_ACTOR_ID} from "./fake-feed-supabase";
const root="d3d6129e-993e-4408-8d15-2d23f7728947";
it("maps an experience in feed and detail without a fictional catalog item",async()=>{
  const sb=fakeSupabase({posts:[{id:"xp",author_id:FAKE_ACTOR_ID,kind:"experience",anchor_type:"experience",anchor_id:root,created_at:"2026-10-02T11:00:00Z"}],experiences:[{id:root,title:"Concierto"}]});
  const page=await getFeed(sb.client,"viewer",{});
  expect(page.events).toHaveLength(1);expect(page.events[0].source).toBe("experience");
  if(page.events[0].source!=="experience")throw new Error("Wrong source");
  expect(page.events[0].id).toBe("posts:xp");expect(page.events[0].event).toHaveProperty("experience.title","Concierto");expect(page.events[0].event).not.toHaveProperty("itemType");
  const detail=await getPostEvent(sb.client,null,"xp");expect(detail?.event).toHaveProperty("experience.id",root);expect(detail?.event.interactionTarget?.interactionTargetId).toBe("interaction-target:post:xp");
});
it("keeps the shared posts cursor across catalog and experience rows",async()=>{
  const posts=Array.from({length:5},(_,i)=>({id:`p${i}`,author_id:FAKE_ACTOR_ID,created_at:`2026-10-02T11:0${5-i}:00Z`,kind:i%2?"experience":"thought",body:"Texto",...(i%2?{anchor_type:"experience",anchor_id:root}:{})}));
  const sb=fakeSupabase({posts,experiences:[{id:root,title:"Paseo"}]});
  const ids=[];let cursor:string|undefined;
  for(let i=0;i<3;i++){const page=await getFeed(sb.client,"viewer",{pageSize:2,cursor});ids.push(...page.events.map(e=>e.id));cursor=page.nextCursor??undefined;}
  expect(ids).toEqual(["posts:p0","posts:p1","posts:p2","posts:p3","posts:p4"]);
});
const moment="7c1f6a0e-4b8e-4d6b-9a51-2f0d3c8e9b12";
const rootRow={id:root,title:"Escapada",moments:[{id:moment,title:"Concierto"}]};
it("maps experience_review posts to the experience entry with its live review",async()=>{
  const sb=fakeSupabase({posts:[{id:"p2",author_id:FAKE_ACTOR_ID,kind:"experience_review",anchor_type:"experience",anchor_id:root,source_kind:"experience_review",source_id:"r1",body:null,created_at:"2026-10-04T10:00:00Z"}],experiences:[rootRow],experienceMomentReviews:[{id:"r1",experience_id:root,moment_id:moment,rating:9,body:"Inolvidable"}]});
  const page=await getFeed(sb.client,"viewer",{});
  const entry=page.events.find(e=>e.id==="posts:p2");
  if(entry?.source!=="experience")throw new Error("Wrong source");
  expect(entry.event.review).toEqual({id:"r1",momentId:moment,momentTitle:"Concierto",rating:9,body:"Inolvidable"});
  expect(sb.inFilters.experience_moment_reviews?.id).toEqual(["r1"]);
});
it("keeps plain experience posts without a review",async()=>{
  const sb=fakeSupabase({posts:[{id:"xp",author_id:FAKE_ACTOR_ID,kind:"experience",anchor_type:"experience",anchor_id:root,created_at:"2026-10-02T11:00:00Z"}],experiences:[rootRow]});
  const page=await getFeed(sb.client,"viewer",{});
  const entry=page.events[0];if(entry?.source!=="experience")throw new Error("Wrong source");
  expect(entry.event.review).toBeNull();
  expect(sb.inFilters.experience_moment_reviews).toBeUndefined();
});
it("drops review posts whose review the viewer cannot read",async()=>{
  const sb=fakeSupabase({posts:[{id:"p3",author_id:FAKE_ACTOR_ID,kind:"experience_review",anchor_type:"experience",anchor_id:root,source_kind:"experience_review",source_id:"gone",body:null,created_at:"2026-10-04T10:00:00Z"}],experiences:[rootRow],experienceMomentReviews:[]});
  const page=await getFeed(sb.client,"viewer",{});
  expect(page.events.some(e=>e.id==="posts:p3")).toBe(false);
});
it("drops review posts whose moment is no longer in the experience",async()=>{
  const sb=fakeSupabase({posts:[{id:"p4",author_id:FAKE_ACTOR_ID,kind:"experience_review",anchor_type:"experience",anchor_id:root,source_kind:"experience_review",source_id:"r2",body:null,created_at:"2026-10-04T10:00:00Z"}],experiences:[rootRow],experienceMomentReviews:[{id:"r2",experience_id:root,moment_id:"other-moment",rating:null,body:"Texto"}]});
  const page=await getFeed(sb.client,"viewer",{});
  expect(page.events.some(e=>e.id==="posts:p4")).toBe(false);
});
it("maps a review post in post detail too",async()=>{
  const sb=fakeSupabase({posts:[{id:"p5",author_id:FAKE_ACTOR_ID,kind:"experience_review",anchor_type:"experience",anchor_id:root,source_kind:"experience_review",source_id:"r1",body:null,created_at:"2026-10-04T10:00:00Z"}],experiences:[rootRow],experienceMomentReviews:[{id:"r1",experience_id:root,moment_id:moment,rating:null,body:"Solo texto"}]});
  const detail=await getPostEvent(sb.client,null,"p5");
  expect(detail?.event).toHaveProperty("review.momentTitle","Concierto");
});
