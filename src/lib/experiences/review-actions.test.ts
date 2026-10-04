import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({rpc:vi.fn(),getUser:vi.fn(),revalidate:vi.fn(),notify:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:m.getUser},rpc:m.rpc})}));
vi.mock("@/lib/reactivity/revalidate",()=>({revalidateExperiences:m.revalidate}));
vi.mock("@/lib/social/notifications",()=>({notify:m.notify}));
import {saveMomentReview,setReviewSharing,deleteMomentReview,publishReview,unpublishReview} from "./review-actions";
const root="de9eb8c7-08f5-464d-8c5b-76f5b58bfce4",moment="de9eb8c7-08f5-464d-8c5b-76f5b58bfce5",review="de9eb8c7-08f5-464d-8c5b-76f5b58bfce6",friend="de9eb8c7-08f5-464d-8c5b-76f5b58bfce7",me="de9eb8c7-08f5-464d-8c5b-76f5b58bfce8";
beforeEach(()=>{vi.clearAllMocks();m.getUser.mockResolvedValue({data:{user:{id:me}}});m.rpc.mockResolvedValue({data:{id:review,experienceId:root,created:false,notifyUserIds:[]},error:null});});
it("requires a session",async()=>{m.getUser.mockResolvedValue({data:{user:null}});expect(await saveMomentReview(moment,{rating:8,body:null})).toEqual({ok:false,error:"unauthenticated"});expect(m.rpc).not.toHaveBeenCalled();});
it("validates before calling SQL",async()=>{
  expect(await saveMomentReview("bad",{rating:8,body:null})).toEqual({ok:false,error:"invalid"});
  expect(await saveMomentReview(moment,{rating:11,body:null})).toEqual({ok:false,error:"invalid"});
  expect(await setReviewSharing(review,"yes" as never)).toEqual({ok:false,error:"invalid"});
  expect(m.rpc).not.toHaveBeenCalled();
});
it("saves normalized input and invalidates the root",async()=>{
  expect(await saveMomentReview(moment,{rating:8,body:"  Bien "})).toEqual({ok:true,data:{id:review}});
  expect(m.rpc).toHaveBeenCalledWith("experience_save_moment_review",{p_moment_id:moment,p_rating:8,p_body:"Bien"});
  expect(m.revalidate).toHaveBeenCalledWith(root);
});
it("notifies the group once, only on creation, without the review text",async()=>{
  m.rpc.mockResolvedValue({data:{id:review,experienceId:root,created:true,notifyUserIds:[friend]},error:null});
  await saveMomentReview(moment,{rating:8,body:"secreto"});
  expect(m.notify).toHaveBeenCalledTimes(1);
  expect(m.notify).toHaveBeenCalledWith(expect.anything(),{userId:friend,actorId:me,type:"experience_reviewed",targetType:"experience",targetId:root,dedupeKey:`experience_reviewed:${review}:${friend}`,context:undefined});
});
it("sends one notice per recipient with distinct dedupe keys",async()=>{
  const other="de9eb8c7-08f5-464d-8c5b-76f5b58bfce9";
  m.rpc.mockResolvedValue({data:{id:review,experienceId:root,created:true,notifyUserIds:[friend,other]},error:null});
  await saveMomentReview(moment,{rating:8,body:null});
  expect(m.notify).toHaveBeenCalledTimes(2);
  const calls=m.notify.mock.calls.map(c=>c[1] as {userId:string;dedupeKey:string});
  expect(calls.map(c=>c.userId)).toEqual([friend,other]);
  expect(new Set(calls.map(c=>c.dedupeKey)).size).toBe(2);
});
it("sends the group notices concurrently, not one after another",async()=>{
  const other="de9eb8c7-08f5-464d-8c5b-76f5b58bfce9",pending:Array<()=>void>=[];
  m.notify.mockImplementation(()=>new Promise<void>(resolve=>{pending.push(resolve);}));
  m.rpc.mockResolvedValue({data:{id:review,experienceId:root,created:true,notifyUserIds:[friend,other]},error:null});
  const saving=saveMomentReview(moment,{rating:8,body:null});
  await vi.waitFor(()=>expect(m.notify).toHaveBeenCalledTimes(2),{timeout:500});
  pending.forEach(resolve=>resolve());
  expect(await saving).toEqual({ok:true,data:{id:review}});
});
it("does not notify when the review was not created, even with recipients",async()=>{
  m.rpc.mockResolvedValue({data:{id:review,experienceId:root,created:false,notifyUserIds:[friend]},error:null});
  await saveMomentReview(moment,{rating:8,body:null});
  expect(m.notify).not.toHaveBeenCalled();
});
it("maps SQL errors and does not notify on failure",async()=>{
  m.rpc.mockResolvedValue({data:null,error:{code:"42501"}});
  expect(await saveMomentReview(moment,{rating:8,body:null})).toEqual({ok:false,error:"forbidden"});
  expect(m.notify).not.toHaveBeenCalled();
});
it("sharing, deletion and publication go through author-only RPCs",async()=>{
  m.rpc.mockResolvedValue({data:{experienceId:root},error:null});
  expect(await setReviewSharing(review,true)).toEqual({ok:true,data:null});
  expect(m.rpc).toHaveBeenLastCalledWith("experience_set_review_sharing",{p_review_id:review,p_enabled:true});
  expect(await deleteMomentReview(review)).toEqual({ok:true,data:null});
  expect(m.rpc).toHaveBeenLastCalledWith("experience_delete_moment_review",{p_review_id:review});
  m.rpc.mockResolvedValue({data:{id:friend,experienceId:root,created:true},error:null});
  expect(await publishReview(review)).toEqual({ok:true,data:{id:friend}});
  m.rpc.mockResolvedValue({data:{experienceId:root},error:null});
  expect(await unpublishReview(review)).toEqual({ok:true,data:null});
  expect(m.rpc).toHaveBeenLastCalledWith("experience_unpublish_review",{p_review_id:review});
});

