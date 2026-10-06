import type { ReactNode } from "react";
import { RouteMessages } from "@/components/route-messages";

export default function ReleasesLayout({ children }: { children: ReactNode }) {
  return <RouteMessages ns={["releases"]}>{children}</RouteMessages>;
}
