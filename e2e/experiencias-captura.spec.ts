import { test,expect } from "@playwright/test";
import { clearExperienceFixtures,EXPERIENCE_QA_PREFIX,experienceOwner,experienceRest,loginExperienceUser } from "./support/experience-fixtures";

test("minimal plan grows into a trip with stable root and first moment",async({page})=>{
  const owner=await experienceOwner();
  try {
    await clearExperienceFixtures(owner);
    await loginExperienceUser(page);
    await page.goto("/experiencias/nueva");
    await page.getByRole("textbox",{name:"Nombre *",exact:true}).fill(`${EXPERIENCE_QA_PREFIX}Una noche de teatro`);
    await page.getByRole("button",{name:"Guardar experiencia",exact:true}).click();
    await expect(page).toHaveURL(/\/experiencia\/[0-9a-f-]+$/);
    const id=page.url().split("/").at(-1)!;
    const moments=await (await experienceRest(`experience_moments?experience_id=eq.${id}&select=id`)).json() as {id:string}[];
    expect(moments).toHaveLength(1);
    await page.getByRole("link",{name:"Editar experiencia",exact:true}).click();
    await page.getByRole("textbox",{name:"Nombre *",exact:true}).fill(`${EXPERIENCE_QA_PREFIX}Fin de semana`);
    await page.getByLabel("Forma",{exact:true}).selectOption("trip");
    await page.getByRole("button",{name:"Guardar cambios",exact:true}).click();
    await expect(page).toHaveURL(`/experiencia/${id}`);
    await page.getByRole("link",{name:"Editar experiencia",exact:true}).click();
    await page.getByRole("button",{name:"Añadir momento",exact:true}).click();
    await page.getByRole("textbox",{name:"Nombre del momento *",exact:true}).fill("Paseo por el centro");
    await page.getByLabel("Tipo del momento",{exact:true}).selectOption("walk");
    await page.getByRole("button",{name:"Guardar momento",exact:true}).click();
    await expect(page.getByRole("heading",{name:"Paseo por el centro",exact:true})).toBeVisible();
    const after=await (await experienceRest(`experience_moments?experience_id=eq.${id}&select=id,position&order=position`)).json() as {id:string;position:number}[];
    expect(after).toHaveLength(2);
    expect(after[0].id).toBe(moments[0].id);
    await page.getByRole("button",{name:"Subir Paseo por el centro",exact:true}).click();
    await expect.poll(async()=> (await (await experienceRest(`experience_moments?id=eq.${after[1].id}&select=position`)).json())[0].position).toBe(0);
    await page.goto(`/experiencia/${id}/editar`);
    await page.getByLabel("Estado",{exact:true}).selectOption("cancelled");
    await page.getByRole("button",{name:"Guardar cambios",exact:true}).click();
    await expect(page.getByText("Cancelada",{exact:true}).first()).toBeVisible();
    await page.goto("/experiencias?state=cancelled");
    await expect(page.getByRole("link",{name:new RegExp("Fin de semana")})).toBeVisible();
  } finally {await clearExperienceFixtures(owner);}
});

test("a lived solo memory needs no text and hidden or unknown IDs return 404",async({page,browser})=>{
  const owner=await experienceOwner();
  try {
    await clearExperienceFixtures(owner);
    await loginExperienceUser(page);
    await page.goto("/experiencias/nueva");
    await page.getByRole("textbox",{name:"Nombre *",exact:true}).fill(`${EXPERIENCE_QA_PREFIX}Museo en solitario`);
    await page.getByLabel("Estado",{exact:true}).selectOption("lived");
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
  } finally {await clearExperienceFixtures(owner);}
});
