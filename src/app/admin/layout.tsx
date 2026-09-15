import { Suspense, type ReactNode } from "react";
import { RouteMessages } from "@/components/route-messages";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUserRole } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { AdminNav } from "./admin-nav";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// Provider i18n de ruta (#444): namespaces de cliente medidos para esta ruta.
async function AdminSession({ children }: { children: ReactNode }) {
  // Authorization and evidence are evaluated only for an actual request.
  await connection();
  if (!await getCurrentUser()) redirect(loginHref("/admin"));
  if (await getCurrentUserRole() !== "admin") redirect("/");
  return <RouteMessages ns={["admin", "adminModeration"]}><AdminNav />{children}</RouteMessages>;
}

export default function MessagesLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}><AdminSession>{children}</AdminSession></Suspense>;
}
