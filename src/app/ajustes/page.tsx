import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { countMyPending } from "@/lib/import/pending";
import { SHELL_READ } from "@/lib/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";
import { LockIcon } from "@/components/ui/icons";
import { UserAvatar } from "@/components/social/user-avatar";
import { EditProfileForm } from "@/components/edit-profile-form";
import { CelebrationPreferenceToggle } from "@/components/celebrations/celebration-preference-toggle";
import { NotificationPreferences } from "@/components/push/notification-preferences";
import { PostPreferences } from "@/components/social/post-preferences";
import { HideDroppedToggle } from "@/components/settings/hide-dropped-toggle";
import { VisibilityToggle } from "./visibility-toggle";
import { LogoutButton } from "./logout-button";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: "Ajustes — Biblioshare",
};

// La página de ajustes que la app no tenía (F3-010). Hasta ahora «configurar»
// era abrir DOS hojas modales distintas desde el perfil propio —«Editar perfil»,
// que además escondía Importar/Exportar, y el engranaje, que llevaba
// visibilidad, avisos, admin y cerrar sesión— y encima quedaban fuera cosas que
// no vivían en ninguna de las dos: cambiar la contraseña no se podía hacer
// desde dentro de la app (`/cuenta/contrasena` era huérfana: 0 enlaces en src/,
// solo se llegaba por el correo de recuperación).
//
// El criterio de reparto entre esta página y el perfil: **el perfil es lo que
// otros ven de ti; los ajustes son lo que tú decides sobre tu cuenta.** Por eso
// «Editar perfil» sigue existiendo en el perfil (es edición en su contexto) pero
// también está aquí, mientras que Importar/Exportar se van del perfil: mover un
// CSV de tu biblioteca no es un rasgo de tu perfil público.
export default async function AjustesPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/ajustes"));

  // getOwnProfile hace throw si algo falla; aquí NO se tolera con un .catch()
  // como en AppShell: sin perfil no hay nada que ajustar y media página serían
  // controles apuntando a null. Sin username el usuario está a medio onboarding.
  const profile = await getOwnProfile(user.id);
  if (!profile?.username) redirect("/onboarding");

  const [pendingCount, t, tAdmin] = await Promise.all([
    countMyPending(supabase, user.id),
    getTranslations("settings"),
    getTranslations("admin"),
  ]);
  const tProfile = await getTranslations("profile");

  const name = profile.displayName || profile.username;

  return (
    <div
      className={`mx-auto flex w-full ${SHELL_READ} flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8`}
    >
      <PageHeader title={t("title")} />

      <Section title={t("profileSection")}>
        <div className="flex flex-wrap items-center gap-3">
          <UserAvatar name={name} avatarUrl={profile.avatarUrl} size={44} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-foreground">
              {name}
            </span>
            <span className="font-mono text-[12.5px] text-muted-foreground">
              @{profile.username}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={`/u/${profile.username}`}
              className={buttonVariants("ghost", "px-4")}
            >
              {t("viewProfile")}
            </Link>
            <EditProfileForm profile={profile} />
          </div>
        </div>

        <Row
          label={tProfile("visibilityLabel")}
          value={
            profile.isPublic
              ? tProfile("visibilityPublic")
              : tProfile("visibilityPrivate")
          }
          action={
            <VisibilityToggle
              username={profile.username}
              isPublic={profile.isPublic}
            />
          }
        />
      </Section>

      <Section title={t("accountSection")}>
        <Row
          label={t("emailLabel")}
          // El correo se enseña pero no se edita: cambiarlo es un flujo de
          // verificación por partida doble que hoy no existe. Enseñarlo evita la
          // pregunta «¿con qué cuenta entré?», que es la que trae a esta página.
          value={user.email ?? t("emailUnknown")}
          action={
            <Link
              href="/cuenta/contrasena"
              className={buttonVariants("secondary", "px-4")}
            >
              {t("changePassword")}
            </Link>
          }
        />
      </Section>

      <Section title={t("dataSection")} description={t("dataDescription")}>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/importar" className={buttonVariants("secondary", "px-4")}>
            {tProfile("importLibrary")}
          </Link>
          {/* Exportar es una descarga del endpoint, no una navegación: <a download>
              y no <Link>, o Next intentaría enrutar el CSV. */}
          <a
            href="/api/export"
            download
            className={buttonVariants("secondary", "px-4")}
          >
            {tProfile("exportLibrary")}
          </a>
        </div>
        {pendingCount > 0 && (
          <Link
            href="/importar/pendientes"
            className="self-start text-sm text-accent underline"
          >
            {t("pendingLink", { count: pendingCount })}
          </Link>
        )}
      </Section>

      <Section title={t("librarySection")}>
        <HideDroppedToggle hideDropped={profile.hideDropped} />
      </Section>

      <Section title={t("noticesSection")}>
        <NotificationPreferences />
        <PostPreferences />
        <CelebrationPreferenceToggle />
      </Section>

      {profile.role === "admin" && (
        <Section title={t("adminSection")}>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 self-start label-section underline hover:text-foreground"
          >
            <LockIcon className="h-3.5 w-3.5" />
            {tAdmin("navLabel")}
          </Link>
        </Section>
      )}

      {/* Cerrar sesión va suelto al pie, fuera de toda tarjeta: no es un ajuste
          más, es la salida. Alineado a la derecha para que no compita con el
          recorrido de lectura de las secciones. */}
      <div className="flex justify-end pb-4">
        <LogoutButton />
      </div>
    </div>
  );
}

// Tarjeta de sección. Todas las pantallas utilitarias del proyecto (importar,
// contraseña, admin) improvisaban su propio contenedor; aquí al menos las
// secciones de una misma página se parecen entre sí.
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-lg font-semibold text-foreground">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

// Fila «etiqueta + valor + acción». En móvil la acción cae debajo en vez de
// estrujar el valor: es la regla 2 de las móviles (min-w-0 y nada de textos
// aplastados) aplicada a mano, porque aquí el valor puede ser un correo largo.
function Row({
  label,
  value,
  action,
}: {
  label: string;
  value: string;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="label-section">{label}</span>
        <span className="text-sm break-all text-foreground">{value}</span>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}
