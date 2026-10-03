// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";
import type { ExperienceDetail } from "@/lib/experiences/types";
import { MomentEditor } from "./moment-editor";
const h=vi.hoisted(()=>({save:vi.fn(),refresh:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:h.refresh}),usePathname:()=>"/experiencia/memory"}));
vi.mock("@/lib/experiences/actions",()=>({saveMoment:h.save,removeMoment:vi.fn(),reorderMoments:vi.fn(),createExperience:vi.fn(),updateExperience:vi.fn()}));
afterEach(cleanup);
beforeEach(()=>{
  vi.clearAllMocks();
  h.save.mockResolvedValue({ok:true,data:{}});
  HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event("close"));};
});
const experience:ExperienceDetail={id:"memory",creatorId:"owner",viewerId:"owner",title:"Madrid",revision:12,shape:"single",state:"planned",audience:"private",startsOn:null,endsOn:null,coverPhotoId:null,createdAt:"2026-10-03",canEdit:true,canContribute:true,moments:[{id:"existing",title:"Primer concierto",kind:"concert",placeLabel:null,startsOn:null,endsOn:null,position:0}],participants:[],attendance:[],favorites:[],photos:[],publicationId:null,interactionTargetId:null};
function show(){return render(<NextIntlClientProvider locale="es" messages={messages}><MomentEditor experience={experience} {...{variant:"inline" as const}}/></NextIntlClientProvider>);}
describe("composición de momentos desde el recuerdo",()=>{
  it("ofrece añadir sin volver a dibujar los momentos que ya aparecen en el recorrido",()=>{
    show();
    expect(screen.getByRole("button",{name:"Añadir momento"})).toBeTruthy();
    expect(screen.queryByText("Primer concierto")).toBeNull();
  });
  it("añade un momento con la revisión vigente y sus opcionales plegados",async()=>{
    show();fireEvent.click(screen.getByRole("button",{name:"Añadir momento"}));
    fireEvent.click(screen.getByRole("radio",{name:"Museo"}));
    fireEvent.change(screen.getByLabelText("Nombre del momento *"),{target:{value:"Museo por la mañana"}});
    fireEvent.click(screen.getByRole("button",{name:"Guardar momento"}));
    await waitFor(()=>expect(h.refresh).toHaveBeenCalled());
    expect(h.save).toHaveBeenCalledWith("memory",12,{title:"Museo por la mañana",kind:"museum",placeLabel:null,startsOn:null,endsOn:null});
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
