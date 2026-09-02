import type { ReactNode } from "react";
import { RouteMessages } from "@/components/route-messages";

export default function MascotaLayout({ children }: { children: ReactNode }) {
  return <RouteMessages ns={["pet"]}>{children}</RouteMessages>;
}
