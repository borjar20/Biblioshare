import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";
import {experienceActor,deleteExperienceActor,clearExperienceFixtures,experienceRest,experienceClientRest,loginExperienceUser,EXPERIENCE_QA_PREFIX} from "./support/experience-fixtures";
test.use({actionTimeout:20_000});

test("one publication appears in feed and profile, and follows current privacy",async({page,browser})=>{
  test.setTimeout(240_000);
  const actors=[] as Awaited<ReturnType<typeof experienceActor>>[],contexts=[] as Awaited<ReturnType<typeof browser.newContext>>[];
  const title=`${EXPERIENCE_QA_PREFIX}Teatro con amigos`;
  try {
    actors.push(await experienceActor("Organizador social",true),await experienceActor("Visitante social",true));
    await loginExperienceUser(page,actors[0]);await page.goto("/experiencias/nueva");
    await page.getByRole("textbox",{name:"Nombre *",exact:true}).fill(title);
    await page.getByRole("button",{name:"Guardar experiencia",exact:true}).click();await expect(page).toHaveURL(/\/experiencia\/[0-9a-f-]+$/);
    const id=page.url().split("/").at(-1)!;
    await page.getByRole("link",{name:"Editar experiencia",exact:true}).click();await page.getByLabel("Quién puede verlo",{exact:true}).selectOption("profile");
    await page.getByRole("button",{name:"Guardar cambios",exact:true}).click();await expect(page).toHaveURL(`/experiencia/${id}`);
    await page.getByRole("button",{name:"Compartir en el feed",exact:true}).click();
    await expect(page.getByRole("link",{name:"Ver publicación",exact:true})).toBeVisible();
    let posts=await (await experienceRest(`posts?anchor_type=eq.experience&anchor_id=eq.${id}&select=id`)).json();expect(posts).toHaveLength(1);
    await page.reload();expect(await (await experienceRest(`posts?anchor_type=eq.experience&anchor_id=eq.${id}&select=id`)).json()).toEqual(posts);
    const postId=posts[0].id;await page.getByRole("link",{name:"Ver publicación",exact:true}).click();
    await expect(page.getByRole("link",{name:new RegExp("Teatro con amigos")})).toBeVisible();
    await page.goto("/");await expect(page.getByRole("link",{name:new RegExp("Teatro con amigos")})).toBeVisible();
    const visitor=await browser.newContext();contexts.push(visitor);const viewer=await visitor.newPage();await loginExperienceUser(viewer,actors[1]);
    await viewer.goto(`/u/${actors[0].username}?tab=experiencias`);await expect(viewer.getByRole("link",{name:new RegExp("Teatro con amigos")})).toBeVisible();
    await viewer.setViewportSize({width:390,height:844});
    expect(await viewer.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    mkdirSync(".superpowers/experience-visuals",{recursive:true});
    await viewer.screenshot({path:".superpowers/experience-visuals/experience-profile-mobile.png",fullPage:true});
    await viewer.setViewportSize({width:1280,height:900});await viewer.goto(`/post/${postId}`);
    await expect(viewer.getByRole("link",{name:new RegExp("Teatro con amigos")})).toBeVisible();
    await viewer.screenshot({path:".superpowers/experience-visuals/experience-post-desktop.png",fullPage:true});
    await experienceRest(`profiles?user_id=eq.${actors[0].id}`,{method:"PATCH",body:JSON.stringify({is_public:false})});
    expect(await (await experienceClientRest(`posts?id=eq.${postId}&select=id`,actors[1])).json()).toEqual([]);
    await experienceRest(`profiles?user_id=eq.${actors[0].id}`,{method:"PATCH",body:JSON.stringify({is_public:true})});
    await experienceRest("user_blocks",{method:"POST",body:JSON.stringify({blocker_id:actors[0].id,blocked_id:actors[1].id})});
    expect(await (await experienceClientRest(`posts?id=eq.${postId}&select=id`,actors[1])).json()).toEqual([]);
    await page.goto(`/experiencia/${id}/editar`);await page.getByLabel("Quién puede verlo",{exact:true}).selectOption("private");
    await page.getByRole("button",{name:"Guardar cambios",exact:true}).click();await expect(page).toHaveURL(`/experiencia/${id}`);
    expect(await (await experienceClientRest(`posts?id=eq.${postId}&select=id`)).json()).toEqual([]);
    await page.getByRole("button",{name:"Quitar publicación del feed",exact:true}).click();
    await expect(page.getByRole("button",{name:"Compartir en el feed",exact:true})).toBeDisabled();
    await expect(page.getByRole("heading",{level:1,name:title,exact:true})).toBeVisible();
    posts=await (await experienceRest(`posts?id=eq.${postId}&select=id`)).json();expect(posts).toEqual([]);
  } finally {for(const context of contexts)await context.close();for(const actor of actors){await clearExperienceFixtures(actor.id);await deleteExperienceActor(actor);}}
});
