import {expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/server",()=>({getCurrentUser:async()=>null}));
vi.mock("@/lib/experiences/queries",()=>({getExperiencePreviews:async(_client:unknown,roots:{id:string;title:string}[])=>roots.map(root=>({...root,moments:[],participants:[],coverPhotoId:null}))}));
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
