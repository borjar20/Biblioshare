import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({createClient:vi.fn(),revalidateExperiences:vi.fn(),rpc:vi.fn(),getUser:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/server",()=>({createClient:mocks.createClient}));
vi.mock("@/lib/reactivity/revalidate",()=>({revalidateExperiences:mocks.revalidateExperiences}));
import { createExperience, updateExperience, saveMoment, removeMoment, reorderMoments, deleteExperience } from "./actions";
const id="78f7377a-73c6-40c4-8c86-a395518d4bb0";
const second="78f7377a-73c6-40c4-8c86-a395518d4bb1";
const capture={title:"  Plan  ",state:"planned" as const,kind:"walk" as const};
const update={title:"Plan",shape:"single" as const,state:"planned" as const,audience:"private" as const,startsOn:null,endsOn:null};
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({data:{user:{id:"user"}},error:null});
  mocks.rpc.mockResolvedValue({data:{id},error:null});
  mocks.createClient.mockResolvedValue({auth:{getUser:mocks.getUser},rpc:mocks.rpc});
});
describe("experience actions",()=>{
  it("rejects no session without invoking RPC or invalidation",async()=>{
    mocks.getUser.mockResolvedValue({data:{user:null},error:null});
    expect(await createExperience(capture)).toEqual({ok:false,error:"unauthenticated"});
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidateExperiences).not.toHaveBeenCalled();
  });
  it("normalizes minimal capture and invalidates only after success",async()=>{
    expect(await createExperience(capture)).toEqual({ok:true,data:{id}});
    expect(mocks.rpc).toHaveBeenCalledWith("experience_create",{p_input:{title:"Plan",state:"planned",kind:"walk",placeLabel:null,startsOn:null,endsOn:null}});
    expect(mocks.revalidateExperiences).toHaveBeenCalledWith(id);
  });
  it.each([["42501","forbidden"],["PT409","conflict"],["22023","invalid"],["PT429","limit"],["23503","invalid"],["XX000","unknown"]])("maps SQL %s without leaking SQL messages",async(code,error)=>{
    mocks.rpc.mockResolvedValue({data:null,error:{code,message:"private SQL details"}});
    expect(await updateExperience(id,3,update)).toEqual({ok:false,error});
    expect(mocks.revalidateExperiences).not.toHaveBeenCalled();
  });
  it("rejects invalid ID, revision, ordering and title before mutation",async()=>{
    expect(await updateExperience("../root",0,update)).toEqual({ok:false,error:"invalid"});
    expect(await updateExperience(id,-1,update)).toEqual({ok:false,error:"invalid"});
    expect(await reorderMoments(id,0,[id,id])).toEqual({ok:false,error:"invalid"});
    expect(await createExperience({...capture,title:" "})).toEqual({ok:false,error:"invalid"});
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("preserves optimistic revision and calls the structural RPCs",async()=>{
    await saveMoment(id,4,{title:"Museo",kind:"museum"});
    expect(mocks.rpc).toHaveBeenLastCalledWith("experience_save_moment",{p_id:id,p_revision:4,p_input:{title:"Museo",kind:"museum",placeLabel:null,startsOn:null,endsOn:null}});
    await removeMoment(id,4,second);
    expect(mocks.rpc).toHaveBeenLastCalledWith("experience_remove_moment",{p_id:id,p_revision:4,p_moment_id:second});
    await reorderMoments(id,4,[second,id]);
    expect(mocks.rpc).toHaveBeenLastCalledWith("experience_reorder_moments",{p_id:id,p_revision:4,p_ordered_ids:[second,id]});
  });
  it("does not bypass RLS with service role for deletion",async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:{code:"42501"}});
    expect(await deleteExperience(id,"Plan")).toEqual({ok:false,error:"forbidden"});
    expect(mocks.rpc).toHaveBeenCalledWith("experience_delete",{p_id:id,p_confirmation:"Plan"});
  });
  it("turns transport errors into a recoverable inline error",async()=>{
    mocks.rpc.mockRejectedValue(new Error("connection lost"));
    expect(await createExperience(capture)).toEqual({ok:false,error:"unknown"});
  });
});
