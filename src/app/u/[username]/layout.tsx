import type { ReactNode } from "react";
import { RouteMessages } from "@/components/route-messages";
import { WRAP_UP_FEED_MESSAGES } from "@/components/wrap-ups/wrap-up-feed-messages";

// Provider i18n de sección (#444): unión de los namespaces de cliente que usan
// las rutas de esta sección. Ver src/components/route-messages.tsx.
export default function SectionMessagesLayout({ children }: { children: ReactNode }) {
  return <RouteMessages ns={["activity", "challenges", "collection", "feed", "library", "notes", "profile", "rincon", "search", "social", "stats", "experiences", ...WRAP_UP_FEED_MESSAGES]}>{children}</RouteMessages>;
}
