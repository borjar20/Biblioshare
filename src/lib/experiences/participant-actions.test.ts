import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),getUser:vi.fn(),revalidate:vi.fn(),notify:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:mocks.getUser},rpc:mocks.rpc})}));
vi.mock("@/lib/reactivity/revalidate",()=>({revalidateExperiences:mocks.revalidate}));
vi.mock("@/lib/social/notifications",()=>({notify:mocks.notify}));
import {inviteParticipant,addGuest,respondInvitation,setMomentAttendance,setFavorite,setShareIdentity,removeParticipant} from "./participant-actions";
const root="de9eb8c7-08f5-464d-8c5b-76f5b58bfce4",person="de9eb8c7-08f5-464d-8c5b-76f5b58bfce5";
beforeEach(()=>{vi.clearAllMocks();mocks.getUser.mockResolvedValue({data:{user:{id:person}}});mocks.rpc.mockResolvedValue({data:{id:person,experienceId:root},error:null});});
it("requires session for participation",async()=>{mocks.getUser.mockResolvedValue({data:{user:null}});expect(await inviteParticipant(root,person)).toEqual({ok:false,error:"unauthenticated"});expect(mocks.rpc).not.toHaveBeenCalled();});
it("rejects malformed IDs, states and guest labels",async()=>{
  expect((await inviteParticipant("bad",person)).ok).toBe(false);
  expect((await addGuest(root," ")).ok).toBe(false);
  expect((await setMomentAttendance(person,"bogus" as never)).ok).toBe(false);
  expect((await setShareIdentity(root,"yes" as never)).ok).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("normalizes guest and invalidates the root",async()=>{await addGuest(root," Ana ");expect(mocks.rpc).toHaveBeenCalledWith("experience_add_guest",{p_id:root,p_name:"Ana"});expect(mocks.revalidate).toHaveBeenCalledWith(root);});
it("changes only own attendance and own favorite, no supplied user identity",async()=>{
  await setMomentAttendance(person,"skipped");expect(mocks.rpc).toHaveBeenLastCalledWith("experience_set_attendance",{p_moment_id:person,p_state:"skipped",p_drop_reviews:false});
  await setFavorite(root,person);expect(mocks.rpc).toHaveBeenLastCalledWith("experience_set_favorite",{p_id:root,p_moment_id:person});
  await setFavorite(root,null);expect(mocks.rpc).toHaveBeenLastCalledWith("experience_set_favorite",{p_id:root,p_moment_id:undefined});
});
it("response invalidates experience rather than invitation ID",async()=>{await respondInvitation(person,"accept");expect(mocks.revalidate).toHaveBeenCalledWith(root);});
it("does not notify or invalidate failed mutations",async()=>{mocks.rpc.mockResolvedValue({data:null,error:{code:"42501"}});expect(await inviteParticipant(root,person)).toEqual({ok:false,error:"forbidden"});expect(mocks.notify).not.toHaveBeenCalled();expect(mocks.revalidate).not.toHaveBeenCalled();});
it("notifies from SQL-derived recipient and dedupes per invitation without private subject",async()=>{
  mocks.rpc.mockResolvedValue({data:{id:person,experienceId:root,notifyUserId:person,notifyActorId:root},error:null});
  await inviteParticipant(root,person);
  expect(mocks.notify).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({type:"experience_invited",targetType:"experience",targetId:root,dedupeKey:`experience_invited:${person}`,context:undefined}));
});
it("removing a member stays behind authenticated SQL ownership",async()=>{await removeParticipant(person);expect(mocks.rpc).toHaveBeenCalledWith("experience_remove_participant",{p_participant_id:person});});
it("only drops reviews when asked explicitly",async()=>{
  await setMomentAttendance(person,"skipped");
  expect(mocks.rpc).toHaveBeenLastCalledWith("experience_set_attendance",{p_moment_id:person,p_state:"skipped",p_drop_reviews:false});
  await setMomentAttendance(person,"skipped",true);
  expect(mocks.rpc).toHaveBeenLastCalledWith("experience_set_attendance",{p_moment_id:person,p_state:"skipped",p_drop_reviews:true});
});
