import type { ReactNode } from "react";
import { RouteMessages } from "@/components/route-messages";

// El reproductor y las acciones del cierre son cliente y leen `wrapUps.ui` (#444).
export default function WrapLayout({ children }: { children: ReactNode }) {
  return <RouteMessages ns={["wrapUps"]}>{children}</RouteMessages>;
}
