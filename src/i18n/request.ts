import { getRequestConfig } from "next-intl/server";

// Single locale for now (Spanish). Wiring through next-intl from the start
// means adding more locales later is a config change, not a rewrite.
export default getRequestConfig(async () => {
  const locale = "es";

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // Sin `now` global a propósito (#475). Un `new Date()` aquí se evalúa en el
    // camino de PRERENDER y con Cache Components (#448) rompe el build de TODA
    // ruta (valor inestable). La única fecha relativa del proyecto vive en un
    // componente cliente (session-list.tsx), que fija su propio "ahora" tras
    // montar y pinta la fecha absoluta en SSR — así no hay desajuste de
    // hidratación sin sacar todas las rutas del shell estático.
  };
});
