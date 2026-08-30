import type { ReactNode } from "react";
import { RouteMessages } from "@/components/route-messages";

// Provider i18n de sección (#444): los providers de next-intl REEMPLAZAN, no mergean.
export default function PlayGameMessagesLayout({ children }: { children: ReactNode }) {
  return <RouteMessages ns={["play"]}>{children}</RouteMessages>;
}
