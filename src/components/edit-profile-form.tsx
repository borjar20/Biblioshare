"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { logout } from "@/app/(auth)/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import type { Profile } from "@/lib/profile/get-profile-by-username";
import { updateProfile, type UpdateProfileState } from "@/lib/profile/actions";
import { AvatarUpload } from "./avatar-upload";

const initialState: UpdateProfileState = {};

export function EditProfileForm({ profile }: { profile: Profile }) {
  const t = useTranslations("profile");
  const tCommon = useTranslations();
  const [open, setOpen] = useState(false);

  const boundUpdateProfile = updateProfile.bind(null, profile.username);
  const [state, formAction, pending] = useActionState(
    boundUpdateProfile,
    initialState,
  );

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={buttonVariants("secondary")}
        >
          {t("editProfile")}
        </button>
        <form action={logout}>
          <button type="submit" className={buttonVariants("secondary", "px-4")}>
            {t("logout")}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/importar" className={buttonVariants("secondary", "px-4")}>
          {t("importLibrary")}
        </Link>
        <a
          href="/api/export"
          download
          className={buttonVariants("secondary", "px-4")}
        >
          {t("exportLibrary")}
        </a>
      </div>

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
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t("editCancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
