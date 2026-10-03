"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { UserAvatar } from "@/components/social/user-avatar";

// La identidad abre el perfil directamente en cualquier viewport. Las
// herramientas de la app tienen un disparador independiente (AppMenu).
export function UserMenu({
  username,
  avatarUrl,
}: {
  username: string;
  avatarUrl: string | null;
}) {
  const t = useTranslations("nav");
  return (
    <Link
      href={`/u/${username}`}
      aria-label={t("you.profile")}
      className="ml-1 grid h-11 w-11 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <UserAvatar name={username} avatarUrl={avatarUrl} size={34} />
    </Link>
  );
}
