import { test,expect } from "@playwright/test";
import { clearExperienceFixtures,EXPERIENCE_QA_PREFIX,experienceActor,deleteExperienceActor,experienceRest,loginExperienceUser,chooseExperienceRadio,editExperience,setExperienceAudience } from "./support/experience-fixtures";

test("a category plan submitted with Enter grows into a trip inline with stable root and first moment",async({page})=>{
  const actor=await experienceActor("Álbum de escapadas");
  try {
    await clearExperienceFixtures(actor.id);
    await loginExperienceUser(page,actor);
    await page.goto("/experiencias");
    await page.getByRole("link",{name:"Concierto",exact:true}).click();
    await expect(page.getByRole("radio",{name:"Concierto",exact:true})).toBeChecked();
    await chooseExperienceRadio(page.getByRole("radio",{name:"Museo",exact:true}));
    await page.getByRole("link",{name:"Cancelar",exact:true}).click();
    await expect(page).toHaveURL("/experiencias");
    await page.getByRole("link",{name:"Concierto",exact:true}).click();
    await expect(page.getByRole("radio",{name:"Concierto",exact:true})).toBeChecked();
    await page.getByRole("link",{name:"Cancelar",exact:true}).click();
    await expect(page).toHaveURL("/experiencias");
    await page.getByRole("link",{name:"Espectáculo",exact:true}).click();
    await expect(page).toHaveURL("/experiencias/nueva?kind=show");
    await expect(page.getByRole("radio",{name:"Espectáculo",exact:true})).toBeChecked();
    await expect(page.locator("form:visible").getByLabel("Fecha de inicio",{exact:true})).toBeHidden();
    const title=page.getByRole("textbox",{name:"Nombre *",exact:true});
    await title.fill(`${EXPERIENCE_QA_PREFIX}Una noche de teatro`);
    await title.press("Enter");
    await expect(page).toHaveURL(/\/experiencia\/[0-9a-f-]+$/);
    const id=page.url().split("/").at(-1)!;
    const roots=await (await experienceRest(`experiences?id=eq.${id}&select=id,audience,shape,state`)).json();
    expect(roots).toEqual([{id,audience:"private",shape:"single",state:"planned"}]);
    const moments=await (await experienceRest(`experience_moments?experience_id=eq.${id}&select=id,kind`)).json() as {id:string;kind:string}[];
    expect(moments).toHaveLength(1);expect(moments[0].kind).toBe("show");
    const add=page.getByRole("button",{name:"Añadir momento",exact:true});
    await add.click();
    const sheet=page.getByRole("dialog",{name:"Añadir momento",exact:true});
    await expect(sheet).toBeVisible();
    await sheet.press("Escape");
    await expect(sheet).not.toBeVisible();
    await expect(add).toBeFocused();
    await add.click();
    await sheet.getByRole("textbox",{name:"Nombre del momento *",exact:true}).fill("Paseo por el centro");
    await chooseExperienceRadio(sheet.getByRole("radio",{name:"Paseo",exact:true}));
    await sheet.getByRole("button",{name:"Guardar momento",exact:true}).click();
    await expect(sheet).not.toBeVisible();
    await expect(page).toHaveURL(`/experiencia/${id}`);
    await expect(page.getByRole("heading",{name:"Paseo por el centro",exact:true})).toBeVisible();
    const after=await (await experienceRest(`experience_moments?experience_id=eq.${id}&select=id,position,kind&order=position`)).json() as {id:string;position:number;kind:string}[];
    expect(after).toHaveLength(2);expect(after[0].id).toBe(moments[0].id);expect(after[1].kind).toBe("walk");
    expect(await (await experienceRest(`experiences?id=eq.${id}&select=shape`)).json()).toEqual([{shape:"trip"}]);
    await page.getByRole("button",{name:"Acciones de Paseo por el centro",exact:true}).click();
    await page.getByRole("menuitem",{name:"Subir Paseo por el centro",exact:true}).click();
    await expect.poll(async()=> (await (await experienceRest(`experience_moments?id=eq.${after[1].id}&select=position`)).json())[0].position).toBe(0);
    await editExperience(page,id);
    await page.getByRole("textbox",{name:"Nombre *",exact:true}).fill(`${EXPERIENCE_QA_PREFIX}Fin de semana`);
    await chooseExperienceRadio(page.getByRole("radio",{name:"Cancelada",exact:true}));
    await page.getByRole("button",{name:"Guardar cambios",exact:true}).click();
    await expect(page).toHaveURL(`/experiencia/${id}`);
    await expect(page.getByText("Cancelada",{exact:true}).first()).toBeVisible();
    await page.goto("/experiencias?state=cancelled");
    await expect(page.getByRole("link",{name:new RegExp("Fin de semana")})).toBeVisible();
  } finally {await clearExperienceFixtures(actor.id);await deleteExperienceActor(actor);}
});

test("a lived solo memory needs no text and hidden or unknown IDs return 404",async({page,browser})=>{
  const actor=await experienceActor("Recuerdo en solitario");
  try {
    await clearExperienceFixtures(actor.id);
    await loginExperienceUser(page,actor);
    await page.goto("/experiencias/nueva?kind=unknown");
    await expect(page.getByRole("radio",{name:"Otra experiencia",exact:true})).toBeChecked();
    await page.getByRole("textbox",{name:"Nombre *",exact:true}).fill(`${EXPERIENCE_QA_PREFIX}Museo en solitario`);
    await chooseExperienceRadio(page.getByRole("radio",{name:"Museo",exact:true}));
    await chooseExperienceRadio(page.getByRole("radio",{name:"Vivida",exact:true}));
    await page.getByRole("button",{name:"Guardar experiencia",exact:true}).click();
    await expect(page.getByRole("heading",{level:1,name:`${EXPERIENCE_QA_PREFIX}Museo en solitario`,exact:true})).toBeVisible();
    const privateUrl=page.url();
    const visitor=await browser.newContext();
    try {
      const copied=await (await visitor.newPage()).goto(privateUrl);
      expect(copied?.status()).toBe(404);
    } finally {await visitor.close();}
    await page.goto("/experiencias?state=lived");
    await expect(page.getByRole("link",{name:new RegExp("Museo en solitario")})).toBeVisible();
    const response=await page.goto("/experiencia/00000000-0000-4000-8000-000000000000");
    expect(response?.status()).toBe(404);
  } finally {await clearExperienceFixtures(actor.id);await deleteExperienceActor(actor);}
});

test("collapsed optional details survive creation, editing and contextual audience changes",async({page})=>{
  const actor=await experienceActor("Recuerdo con fechas",true),title=`${EXPERIENCE_QA_PREFIX}Museo con fechas`;
  try {
    await clearExperienceFixtures(actor.id);await loginExperienceUser(page,actor);
    await page.goto("/experiencias/nueva?kind=museum");
    await page.getByRole("textbox",{name:"Nombre *",exact:true}).fill(title);
    const optional=page.locator("summary").filter({hasText:"Añadir fecha o lugar"});
    await optional.click();
    await page.getByLabel("Lugar",{exact:true}).fill("Museo del centro");
    await page.getByLabel("Fecha de inicio",{exact:true}).fill("2026-11-05");
    await page.getByLabel("Fecha de fin",{exact:true}).fill("2026-11-06");
    await optional.click();
    await expect(page.getByLabel("Lugar",{exact:true})).toBeHidden();
    await page.getByRole("button",{name:"Guardar experiencia",exact:true}).click();
    await expect(page).toHaveURL(/\/experiencia\/[0-9a-f-]+$/);
    const id=page.url().split("/").at(-1)!;
    const moments=await (await experienceRest(`experience_moments?experience_id=eq.${id}&select=id,place_label,kind`)).json();
    expect(moments).toHaveLength(1);expect(moments[0]).toMatchObject({place_label:"Museo del centro",kind:"museum"});
    await editExperience(page,id);
    await expect(page.locator("form:visible").getByLabel("Fecha de inicio",{exact:true})).toBeHidden();
    await chooseExperienceRadio(page.getByRole("radio",{name:"Vivida",exact:true}));
    await page.getByRole("button",{name:"Guardar cambios",exact:true}).click();
    await expect(page).toHaveURL(`/experiencia/${id}`);
    const sharing=await setExperienceAudience(page,"profile");
    expect(await (await experienceRest(`experiences?id=eq.${id}&select=title,shape,state,audience,starts_on,ends_on`)).json()).toEqual([{title,shape:"single",state:"lived",audience:"profile",starts_on:"2026-11-05",ends_on:"2026-11-06"}]);
    expect(await (await experienceRest(`posts?anchor_type=eq.experience&anchor_id=eq.${id}&select=id`)).json()).toEqual([]);
    await sharing.press("Escape");
    const row=page.locator("li").filter({has:page.getByRole("heading",{level:3,name:title,exact:true})});
    await row.getByRole("button",{name:"Editar momento",exact:true}).click();
    const momentSheet=page.getByRole("dialog",{name:"Editar momento",exact:true});
    await expect(momentSheet.getByLabel("Lugar",{exact:true})).toBeHidden();
    await momentSheet.getByRole("textbox",{name:"Nombre del momento *",exact:true}).fill("Visita a la exposición");
    await momentSheet.getByRole("button",{name:"Guardar momento",exact:true}).click();
    await expect(momentSheet).not.toBeVisible();
    expect(await (await experienceRest(`experience_moments?id=eq.${moments[0].id}&select=title,kind,place_label`)).json()).toEqual([{title:"Visita a la exposición",kind:"museum",place_label:"Museo del centro"}]);
  } finally {await clearExperienceFixtures(actor.id);await deleteExperienceActor(actor);}
});
