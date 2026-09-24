// El ancho de la ficha, en UN sitio (spec 2026-09-23 ficha cinemática §1).
// Hero, barra de pestañas y cuerpo lo comparten para que los bordes alineen de
// arriba abajo. Sustituye al `max-w-4xl` de las pestañas y al
// `lg:max-w-[1200px]` + raíl de 300px del shell viejo, que dejaban el cuerpo de
// cualquier pestaña en ~771px a cualquier viewport (plan 06 §6e).
export const DETAIL_CONTAINER = "mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-10";

// El `top` de los laterales pegajosos de las pestañas (Info, Comunidad). Van
// DEBAJO de la barra de pestañas, que también se pega: 49px de barra (py-3.5 +
// línea de 20px + borde) y 24px de aire. Antes cada lateral calculaba el suyo
// desde el raíl de PC (topbar + 34px) y, con la barra pegada, se metía debajo.
export const DETAIL_ASIDE_STICKY = "lg:sticky lg:top-[calc(var(--topbar-h)+73px)]";
