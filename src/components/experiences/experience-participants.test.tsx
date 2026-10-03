// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";
import type { ExperienceDetail } from "@/lib/experiences/types";
import { ExperienceParticipants } from "./experience-participants";
const h=vi.hoisted(()=>({guest:vi.fn(),identity:vi.fn(),refresh:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:h.refresh,push:vi.fn()}),usePathname:()=>"/experiencia/memory"}));
vi.mock("@/lib/experiences/participant-actions",()=>({addGuest:h.guest,setShareIdentity:h.identity,findExperienceAccount:vi.fn(),inviteParticipant:vi.fn(),removeParticipant:vi.fn()}));
afterEach(cleanup);
beforeEach(()=>{
  vi.clearAllMocks();h.guest.mockResolvedValue({ok:true,data:{}});h.identity.mockResolvedValue({ok:true,data:{}});
  HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event("close"));};
});
const experience:ExperienceDetail={id:"memory",creatorId:"owner",viewerId:"owner",title:"Madrid",revision:12,shape:"single",state:"planned",audience:"private",startsOn:null,endsOn:null,coverPhotoId:null,createdAt:"2026-10-03",canEdit:true,canContribute:true,moments:[],participants:[{id:"person",userId:"owner",guestName:null,displayName:"Clara",username:"clara",avatarUrl:null,shareIdentity:false,invitationState:"accepted"}],attendance:[],favorites:[],photos:[],publicationId:null,interactionTargetId:null};
function show(){return render(<NextIntlClientProvider locale="es" messages={messages}><ExperienceParticipants experience={experience}/></NextIntlClientProvider>);}
describe("añadir personas al recuerdo",()=>{
  it("conserva ambos nombres al alternar entre una cuenta y un invitado",async()=>{
    show();fireEvent.click(screen.getByRole("button",{name:"Añadir acompañante"}));
    fireEvent.change(screen.getByRole("textbox",{name:"Usuario de Biblioshare"}),{target:{value:"ana"}});
    fireEvent.click(screen.getByRole("radio",{name:"Invitado sin cuenta"}));
    fireEvent.change(screen.getByRole("textbox",{name:"Nombre del invitado"}),{target:{value:"Luis"}});
    fireEvent.click(screen.getByRole("radio",{name:"Cuenta de Biblioshare"}));
    expect((screen.getByRole("textbox",{name:"Usuario de Biblioshare"}) as HTMLInputElement).value).toBe("ana");
    fireEvent.click(screen.getByRole("radio",{name:"Invitado sin cuenta"}));
    expect((screen.getByRole("textbox",{name:"Nombre del invitado"}) as HTMLInputElement).value).toBe("Luis");
    fireEvent.click(screen.getByRole("button",{name:"Añadir invitado"}));
    await waitFor(()=>expect(h.guest).toHaveBeenCalledWith("memory","Luis"));
    expect(h.identity).not.toHaveBeenCalled();
  });
  it("plegar la participación no cambia el consentimiento ni dispara una escritura",()=>{
    const {container}=show();
    const details=container.querySelector("details")!;
    expect(details).toBeTruthy();
    details.open=true;
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    details.open=false;
    expect(h.identity).not.toHaveBeenCalled();
  });
});
