// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";
import { ExperiencePhotoUpload } from "./experience-photo-upload";
const h=vi.hoisted(()=>({upload:vi.fn(),refresh:vi.fn(),createUrl:vi.fn(),revokeUrl:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:h.refresh}),usePathname:()=>"/experiencia/memory"}));
vi.mock("@/lib/experiences/photo-actions",()=>({uploadExperiencePhoto:h.upload}));
afterEach(cleanup);
beforeEach(()=>{
  vi.clearAllMocks();h.upload.mockResolvedValue({ok:true,data:{}});
  h.createUrl.mockReturnValueOnce("blob:photo-one").mockReturnValueOnce("blob:photo-two");
  URL.createObjectURL=h.createUrl;URL.revokeObjectURL=h.revokeUrl;
  HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event("close"));};
});
function show(){return render(<NextIntlClientProvider locale="es" messages={messages}><ExperiencePhotoUpload experienceId="memory" moments={[{id:"one",title:"Un paseo",kind:"walk",placeLabel:null,startsOn:null,endsOn:null,position:0}]}/></NextIntlClientProvider>);}
describe("foto antes de subirla",()=>{
  it("no pide asociar una foto a un único momento",()=>{
    show();fireEvent.click(screen.getByRole("button",{name:"Añadir foto"}));
    expect(screen.queryByRole("combobox")).toBeNull();
  });
  it("muestra el archivo elegido y libera cada preview al reemplazar y cerrar",async()=>{
    show();fireEvent.click(screen.getByRole("button",{name:"Añadir foto"}));
    const input=screen.getByLabelText("Imagen");
    fireEvent.change(input,{target:{files:[new File(["photo"],"photo.png",{type:"image/png"})]}});
    await waitFor(()=>expect(screen.getByRole("img").getAttribute("src")).toBe("blob:photo-one"));
    fireEvent.change(input,{target:{files:[new File(["next"],"next.png",{type:"image/png"})]}});
    await waitFor(()=>expect(screen.getByRole("img").getAttribute("src")).toBe("blob:photo-two"));
    expect(h.revokeUrl).toHaveBeenCalledWith("blob:photo-one");
    fireEvent.click(screen.getByRole("button",{name:"Cerrar"}));
    await waitFor(()=>expect(h.revokeUrl).toHaveBeenCalledWith("blob:photo-two"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
