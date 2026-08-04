import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import messages from "../../messages/es.json";

const noopRouter: AppRouterInstance = {
  // `bfcacheId` lo añadió Next 16.3.0 a AppRouterInstance. Aquí es un router de
  // pega para la preview de diseño: basta un valor estable.
  bfcacheId: "preview",
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
};

export function PreviewProvider({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="es" messages={messages}>
      <AppRouterContext.Provider value={noopRouter}>{children}</AppRouterContext.Provider>
    </NextIntlClientProvider>
  );
}
