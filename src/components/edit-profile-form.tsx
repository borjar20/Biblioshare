"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import type { Profile } from "@/lib/profile/get-profile-by-username";
import { updateProfile, type UpdateProfileState } from "@/lib/profile/actions";
import { AvatarUpload } from "./avatar-upload";

const initialState: UpdateProfileState = {};

// Editar perfil en hoja modal (plan 05, P3): "Editar perfil" abre un <dialog>
// nativo con el formulario (nombre, avatar, bio) en vez del despliegue inline.
// Mismo patrón que las hojas de la ficha — foco atrapado y Escape gratis.
export function EditProfileForm({ profile }: { profile: Profile }) {
  const t = useTranslations("profile");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const boundUpdateProfile = updateProfile.bind(null, profile.username);
  const [state, formAction, pending] = useActionState(
    boundUpdateProfile,
    initialState,
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Tras guardar sin error, cerrar la hoja. Se compara con initialState:
  // useActionState devuelve la misma referencia hasta que una acción resuelve.
  useEffect(() => {
    if (state === initialState) return;
    if (!state.error) dialogRef.current?.close();
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonVariants("secondary")}
      >
        {t("editProfile")}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-labelledby="edit-profile-title"
        className="m-auto w-[min(460px,92vw)] rounded-card border border-border bg-surface p-0 text-foreground shadow-card backdrop:bg-scrim"
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="flex flex-col">
          <div className="border-b border-border px-5 py-4">
            <h2 id="edit-profile-title" className="font-serif text-lg font-semibold">
              {t("editProfile")}
            </h2>
          </div>

          {/* Importar/Exportar CSV vivían AQUÍ, dentro de la hoja de editar el
              perfil: mover tu biblioteca entera no es editar tu nombre y tu bio,
              y esconderlo tras «Editar perfil» era la razón de que nadie
              encontrara el importador (F3-010). Se han ido a /ajustes, sección
              «Tus datos». Esta hoja se queda con lo que de verdad es el perfil. */}
          <div className="flex flex-col gap-4 px-5 py-4">
            <form action={formAction} className="flex flex-col gap-3">
              <Field label={t("displayName")} htmlFor="edit-profile-display-name">
                <Input
                  id="edit-profile-display-name"
                  name="displayName"
                  defaultValue={profile.displayName ?? ""}
                />
              </Field>
              <AvatarUpload userId={profile.userId} initialUrl={profile.avatarUrl} />
              <Field label={t("bio")} htmlFor="edit-profile-bio">
                <textarea
                  id="edit-profile-bio"
                  name="bio"
                  rows={3}
                  defaultValue={profile.bio ?? ""}
                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </Field>

              {state.error && (
                <p className="text-xs text-status-dropped">
                  {t(`errors.${state.error}`)}
                </p>
              )}

              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending ? t("editSubmitting") : t("editSubmit")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => dialogRef.current?.close()}
                >
                  {t("editCancel")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}
