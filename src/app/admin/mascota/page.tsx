import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { PageHeader } from "@/components/ui/page-header";
import { PetGallery } from "@/components/admin/pet-gallery";

// Misma guardia que /admin (page.tsx de al lado); misma excepción de Cache Components.
export const instant = false;

export const metadata: Metadata = { title: "Animaciones de la mascota — Biblioshare" };

export default async function AdminPetPage() {
  const t = await getTranslations("admin");
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/admin/mascota"));
  if (!hasMinRole(await getCurrentUserRole(), "admin")) redirect("/");
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-1">
        <PageHeader title={t("pet.title")} />
        <p className="text-sm text-muted-foreground">{t("pet.description")}</p>
      </div>
      <PetGallery />
    </div>
  );
}
