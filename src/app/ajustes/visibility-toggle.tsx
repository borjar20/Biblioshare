"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { updateProfileVisibility } from "@/app/u/[username]/actions";

// Lo único de la vieja hoja de ajustes que necesitaba cliente: la visibilidad
// del perfil escribe con una Server Action y quiere pending state. Se queda en
// su propio fichero para que /ajustes siga siendo un server component.
export function VisibilityToggle({
  username,
  isPublic,
}: {
  username: string;
  isPublic: boolean;
}) {
  const t = useTranslations("profile");
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={isPending}
      onClick={() =>
        startTransition(() => updateProfileVisibility(username, !isPublic))
      }
    >
      {isPublic ? t("makePrivate") : t("makePublic")}
    </Button>
  );
}
