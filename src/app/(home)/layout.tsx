import type { ReactNode } from "react";
import { HomePanelsProvider } from "@/components/home/home-expandable";
import { RouteMessages } from "@/components/route-messages";
import { WRAP_UP_FEED_MESSAGES } from "@/components/wrap-ups/wrap-up-feed-messages";

// Provider i18n de ruta (#444): namespaces de cliente medidos para esta ruta.
export default function MessagesLayout({ children }: { children: ReactNode }) {
  return <RouteMessages ns={["activity", "feed", "social", "thoughtComposer", "joint", "experiences", ...WRAP_UP_FEED_MESSAGES]}><HomePanelsProvider>{children}</HomePanelsProvider></RouteMessages>;
}
