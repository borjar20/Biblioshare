import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { ManualAddForm } from "./manual-add-form";
import { TypePills } from "../type-pills";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: "Añadir manualmente — Biblioshare",
};

const TYPES: ItemType[] = ["book", "movie", "series"];

export default async function ManualAddPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const params = await searchParams;
  const itemType: ItemType = TYPES.includes(params.type as ItemType)
    ? (params.type as ItemType)
    : "book";

  // Contribución curada → colaborador+ (§7.35). Guard a nivel de página además
  // del check en la server action.
  if (!hasMinRole(await getCurrentUserRole(), "collaborator")) {
    redirect("/buscar");
  }

  const t = await getTranslations("search");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="font-serif text-[26px] font-semibold tracking-tight">
        {t("manual.title")}
      </h1>

      <TypePills active={itemType} href={(type) => `/buscar/manual?type=${type}`} />

      <ManualAddForm itemType={itemType} />
    </div>
  );
}
