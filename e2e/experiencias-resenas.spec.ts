import {test,expect} from "@playwright/test";
import {EXPERIENCE_QA_PREFIX,experienceActor,deleteExperienceActor,clearExperienceFixtures,loginExperienceUser,experienceRest} from "./support/experience-fixtures";
// Reseñas de momento contra build de producción: el organizador marca el plan como vivido,
// confirma su asistencia y reseña; una acompañante ve la reseña y la media; retirar la
// asistencia con reseña pide confirmación y la borra.
test.describe.configure({mode:"serial"});
test.use({actionTimeout:20_000});
type Actor=Awaited<ReturnType<typeof experienceActor>>;
const title=`${EXPERIENCE_QA_PREFIX}Cena reseñable`;
let organizer:Actor|undefined,friend:Actor|undefined,id="";
test.beforeAll(async()=>{
  organizer=await experienceActor("Organizador de la cena");
  friend=await experienceActor("Amiga de la cena");
  await clearExperienceFixtures(organizer.id);
});
test.afterAll(async()=>{
  if(organizer){await clearExperienceFixtures(organizer.id);await deleteExperienceActor(organizer);}
  if(friend) await deleteExperienceActor(friend);
});
test("organizer marks a plan lived, confirms attendance and reviews",async({page})=>{
  test.setTimeout(120_000);
  await loginExperienceUser(page,organizer);
  await page.goto("/experiencias/nueva?kind=food");
  await page.getByRole("textbox",{name:"Nombre *",exact:true}).fill(title);
  await page.getByRole("button",{name:"Guardar experiencia",exact:true}).click();
  await expect(page).toHaveURL(/\/experiencia\/[0-9a-f-]+$/);
  id=page.url().split("/").at(-1)!;
  await page.getByRole("button",{name:"Lo vivimos",exact:true}).click();
  const lived=page.getByRole("dialog",{name:"¿A qué fuiste?",exact:true});
  await expect(lived).toBeVisible();
  await expect(lived.getByRole("checkbox")).toBeChecked();
  await lived.getByRole("button",{name:"Guardar",exact:true}).click();
  await lived.getByRole("link",{name:"Reseñar ahora",exact:true}).click();
  await expect(lived).not.toBeVisible();
  // «Lo vivimos» no vuelve tras pasar a Vivida.
  await expect(page.getByRole("button",{name:"Lo vivimos",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Reseñar",exact:true}).click();
  const sheet=page.getByRole("dialog",{name:/^Tu reseña de /});
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button",{name:"8/10",exact:true}).click();
  await sheet.getByLabel("Qué tal fue").fill("Repetiría");
  await sheet.getByRole("button",{name:"Guardar reseña",exact:true}).click();
  await expect(sheet).not.toBeVisible();
  await expect(page.getByText("Repetiría",{exact:true})).toBeVisible();
  const rows=await (await experienceRest(`experience_moment_reviews?experience_id=eq.${id}&select=rating,body,author_id`)).json();
  expect(rows).toEqual([{rating:8,body:"Repetiría",author_id:organizer!.id}]);
});
test("a companion sees the review and the average",async({browser})=>{
  test.setTimeout(120_000);
  // Seed the accepted companion with the service role, as experiencias-participacion.spec.ts does.
  const [moment]=await (await experienceRest(`experience_moments?experience_id=eq.${id}&select=id`)).json() as {id:string}[];
  await experienceRest(`experiences?id=eq.${id}`,{method:"PATCH",body:JSON.stringify({audience:"participants"})});
  const [person]=await (await experienceRest("experience_participants",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({experience_id:id,user_id:friend!.id,invitation_state:"accepted"})})).json() as {id:string}[];
  await experienceRest("experience_moment_participants",{method:"POST",body:JSON.stringify({experience_id:id,moment_id:moment.id,participant_id:person.id,attendance_state:"attended"})});
  const context=await browser.newContext();
  try {
    const page=await context.newPage();
    await loginExperienceUser(page,friend);
    await page.goto(`/experiencia/${id}`);
    await expect(page.getByText("Repetiría",{exact:true})).toBeVisible();
    await expect(page.getByText("Organizador de la cena",{exact:true}).first()).toBeVisible();
    // Media visible del momento: 8,0 sobre una reseña.
    await expect(page.getByText("8.0",{exact:true}).first()).toBeVisible();
    await expect(page.getByText("· 1 reseña",{exact:true}).first()).toBeVisible();
    // La acompañante fue al momento, así que puede reseñarlo ella también.
    await expect(page.getByRole("button",{name:"Reseñar",exact:true})).toBeVisible();
  } finally {await context.close();}
});
test("unattending with a review asks to delete it",async({page})=>{
  test.setTimeout(120_000);
  await loginExperienceUser(page,organizer);
  await page.goto(`/experiencia/${id}`);
  await expect(page.getByText("Repetiría",{exact:true})).toBeVisible();
  const skipped=page.getByRole("radiogroup",{name:/^Tu presencia en /}).getByRole("radio",{name:"No fui",exact:true});
  await skipped.focus();await skipped.press("Space");
  const confirm=page.getByRole("dialog",{name:"Borrar tu reseña",exact:true});
  await expect(confirm.getByText(/se borrará junto con su publicación/)).toBeVisible();
  // Hasta confirmar, la asistencia y la reseña siguen intactas.
  expect(await (await experienceRest(`experience_moment_reviews?experience_id=eq.${id}&select=id`)).json()).toHaveLength(1);
  await confirm.getByRole("button",{name:"Cambiar y borrar la reseña",exact:true}).click();
  await expect(confirm).not.toBeVisible();
  await expect(page.getByText("Repetiría",{exact:true})).toHaveCount(0);
  await expect(skipped).toBeChecked();
  expect(await (await experienceRest(`experience_moment_reviews?experience_id=eq.${id}&select=id`)).json()).toEqual([]);
});
