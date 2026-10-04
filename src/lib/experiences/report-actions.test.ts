import {beforeEach,it,expect,vi} from "vitest";
const h=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),invalidate:vi.fn()}));
vi.mock("server-only",()=>({}));vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:h.auth},rpc:h.rpc})}));vi.mock("@/lib/reactivity/revalidate",()=>({revalidateExperiences:h.invalidate}));
import {reportExperience,reportReview} from "./report-actions";
const id="bc6e2524-c7dd-4b1e-a2b3-ea1ab4fbd020";
beforeEach(()=>{vi.clearAllMocks();h.auth.mockResolvedValue({data:{user:{id}}});h.rpc.mockResolvedValue({data:{id,experienceId:id},error:null});});
it("requires a session and a bounded valid reason before RPC",async()=>{h.auth.mockResolvedValue({data:{user:null}});expect(await reportExperience(id,"spam","")).toEqual({ok:false,error:"unauthenticated"});h.auth.mockResolvedValue({data:{user:{id}}});expect(await reportExperience(id,"unknown","")).toEqual({ok:false,error:"invalid"});expect(await reportExperience(id,"spam","a".repeat(2001))).toEqual({ok:false,error:"invalid"});expect(h.rpc).not.toHaveBeenCalled();});
it("reports only a permitted root without returning private evidence",async()=>{expect(await reportExperience(id,"spam"," contexto ")).toEqual({ok:true,data:null});expect(h.rpc).toHaveBeenCalledWith("experience_report",{p_id:id,p_reason:"spam",p_details:"contexto"});h.rpc.mockResolvedValue({data:null,error:{code:"42501"}});expect(await reportExperience(id,"spam","")).toEqual({ok:false,error:"forbidden"});});
it("reports a review, and maps a duplicate pending report to conflict",async()=>{
  expect(await reportReview(id,"spam"," contexto ")).toEqual({ok:true,data:null});
  expect(h.rpc).toHaveBeenCalledWith("experience_report_review",{p_review_id:id,p_reason:"spam",p_details:"contexto"});
  expect(await reportReview(id,"unknown","")).toEqual({ok:false,error:"invalid"});
  h.rpc.mockResolvedValue({data:null,error:{code:"23505"}});
  expect(await reportReview(id,"spam","")).toEqual({ok:false,error:"conflict"});
  h.rpc.mockResolvedValue({data:null,error:{code:"23514"}});
  expect(await reportReview(id,"spam","")).toEqual({ok:false,error:"invalid"});
});
