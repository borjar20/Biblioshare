import type { ReactElement, ReactNode } from "react";
import { createTranslator, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "../../messages/es.json";
import { RouteMessages } from "./route-messages";

type LayoutModule = {
  default: (props: { children: ReactNode }) => ReactElement<Parameters<typeof RouteMessages>[0]>;
};

// Los layouts se resuelven por el pathname igual que al entrar directamente
// desde una URL. Un provider anidado reemplaza messages; no se fusiona aquí.
const layouts = import.meta.glob([
  "../app/coleccion/**/layout.tsx",
  "../app/comunidad/**/layout.tsx",
]) as Record<string, () => Promise<LayoutModule>>;

async function clientMessagesFor(pathname: string) {
  let selected: AbstractIntlMessages = RouteMessages({ children: null }).props.messages;
  const segments = pathname.split("?")[0].split("/").filter(Boolean);
  for (let depth = 1; depth <= segments.length; depth += 1) {
    const load = layouts[`../app/${segments.slice(0, depth).join("/")}/layout.tsx`];
    if (!load) continue;
    const layout = await load();
    const provider = layout.default({ children: null });
    expect(provider.type).toBe(RouteMessages);
    selected = RouteMessages(provider.props).props.messages;
  }
  return selected;
}

async function translatorFor(pathname: string) {
  return createTranslator({
    locale: "es",
    // Las claves se tipan contra el catálogo; el payload sigue siendo el
    // subconjunto real y onError detecta las ausentes durante la prueba.
    messages: await clientMessagesFor(pathname) as typeof messages,
    onError: (error) => { throw error; },
  });
}

describe("Mensajes de cliente de la nueva navegación", () => {
  it("la entrada directa al Rincón traduce objetivos, retos, memorizar y sorteo", async () => {
    const t = await translatorFor("/coleccion/rincon?archivados=1");
    expect(t("stats.editGoals")).toBe(messages.stats.editGoals);
    expect(t("challenges.newChallenge")).toBe(messages.challenges.newChallenge);
    expect(t("notes.anotherNote")).toBe(messages.notes.anotherNote);
    expect(t("rincon.drawButton")).toBe(messages.rincon.drawButton);
    expect(t("search.types.book")).toBe(messages.search.types.book);
  });

  it("Comunidad traduce las tarjetas y el formulario de crear un club", async () => {
    const t = await translatorFor("/comunidad");
    expect(t("club.formSaveCreate")).toBe(messages.club.formSaveCreate);
    expect(t("club.join")).toBe(messages.club.join);
    expect(t("club.memberCount", { count: 3 })).not.toContain("club.memberCount");
  });

  it("la entrada directa a Entre nosotros declara el namespace del explorador y del editor", async () => {
    const t = await translatorFor("/comunidad/entre-nosotros");
    expect(t("comparisons.createGroup")).toBe(messages.comparisons.createGroup);
    expect(t("comparisons.loadConflict")).toBe(messages.comparisons.loadConflict);
    expect(t("comparisons.errors.load-failed")).toBe(messages.comparisons.errors["load-failed"]);
    const payload = await clientMessagesFor("/comunidad/entre-nosotros");
    expect(payload.club).toBeUndefined();
    expect(t("nav.moreLabel")).toBe(messages.nav.moreLabel);
  });

  it.each(["/coleccion/rincon", "/comunidad", "/comunidad?tab=personas"])(
    "%s conserva el menú global de opciones al reemplazar el provider padre",
    async (pathname) => {
      const t = await translatorFor(pathname);
      expect(t("nav.moreLabel")).toBe(messages.nav.moreLabel);
      expect(t("nav.you.play")).toBe(messages.nav.you.play);
      expect(t("nav.you.pet")).toBe(messages.nav.you.pet);
      expect(t("nav.you.settings")).toBe(messages.nav.you.settings);
    },
  );

  it("los namespaces privados del Rincón no se añaden a toda Biblioteca o Comunidad", async () => {
    const library = await clientMessagesFor("/coleccion");
    const community = await clientMessagesFor("/comunidad");
    expect(library.stats).toBeUndefined();
    expect(library.rincon).toBeUndefined();
    expect(community.stats).toBeUndefined();
    expect(community.rincon).toBeUndefined();
    expect(community.profile).toBeUndefined();
  });
});
