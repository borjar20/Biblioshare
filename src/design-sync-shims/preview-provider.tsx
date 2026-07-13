import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import messages from "../../messages/es.json";

const noopRouter: AppRouterInstance = {
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
