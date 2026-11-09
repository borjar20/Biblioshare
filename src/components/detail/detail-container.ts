// El ancho de la ficha, en UN sitio (spec 2026-09-23 ficha cinemática §1).
// Hero, barra de pestañas y cuerpo lo comparten para que los bordes alineen de
// arriba abajo. Sustituye al `max-w-4xl` de las pestañas y al
// `lg:max-w-[1200px]` + raíl de 300px del shell viejo, que dejaban el cuerpo de
// cualquier pestaña en ~771px a cualquier viewport (plan 06 §6e).
export const DETAIL_CONTAINER = "mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-10";

// La geometría del cartel (spec 2026-11-09), compartida por ItemShell, ItemHero y
// su esqueleto para que al llegar la ficha no salte nada.
export const POSTER_LAYOUT = "xl:grid xl:grid-cols-[min(33%,520px)_minmax(0,1fr)]";
export const POSTER_AREA =
  "relative isolate h-[min(68svh,560px)] overflow-hidden xl:sticky xl:top-[var(--topbar-h)] xl:h-[calc(100dvh-var(--topbar-h))]";
// El título nunca va sobre la foto: el degradado llega al fondo antes.
export const POSTER_GRADIENT =
  "pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent from-30% via-background/85 via-60% to-background to-[82%] xl:bg-gradient-to-r xl:from-transparent xl:from-[70%] xl:via-transparent xl:to-background xl:to-100%";
export const POSTER_HEADER = `relative ${DETAIL_CONTAINER} -mt-[clamp(110px,20svh,170px)] pb-5 xl:mt-0 xl:pt-10 xl:pb-8`;
export const POSTER_BAR = "absolute inset-x-4 top-3.5 z-10 flex items-center justify-between gap-3 lg:hidden";

// El `top` de los laterales pegajosos de las pestañas (Info, Comunidad). Van
// DEBAJO de la barra de pestañas, que también se pega: 49px de barra (py-3.5 +
// línea de 20px + borde) y 24px de aire. Antes cada lateral calculaba el suyo
// desde el raíl de PC (topbar + 34px) y, con la barra pegada, se metía debajo.
export const DETAIL_ASIDE_STICKY = "xl:sticky xl:top-[calc(var(--topbar-h)+73px)]";
