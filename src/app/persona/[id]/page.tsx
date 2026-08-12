import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { CreditRole } from "@/lib/people/types";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getPersonProfile } from "@/lib/people/get-person-profile";
import { PersonCard } from "@/components/people/person-card";
import { PersonWorks } from "@/components/people/person-works";
import { PersonRail } from "@/components/people/person-rail";
import { parseRoleSlug, parseTypeSlug } from "@/components/people/role-labels";
import { PersonSkeleton } from "./person-skeleton";
import { SHELL_PERSON } from "@/lib/ui/layout";

// La ficha depende de `passes` del VISITANTE (estado, nota, progreso, "te falta
// ver", "tu actividad"): es una lectura filtrada por RLS por usuario y por tanto
// NO es cacheable en servidor (regla #437). Nada de `use cache`, ruta dinámica.
//
// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: person } = await supabase
    .from("people")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  return { title: person ? `${person.name} — Biblioshare` : "Biblioshare" };
}

/**
 * El cuerpo entero va dentro del <Suspense>: la PRIMERA visita a una persona
 * hidrata su obra completa desde TMDB / Open Library (una llamada a la API + ~6
 * consultas en lote) y eso no debe bloquear el primer pintado de la página.
 *
 * Se persiste AQUÍ y no en after(): con after() las obras recién traídas todavía
 * no tienen id de catálogo en este render, así que no se podrían enlazar. Ver el
 * spec de 2026-08-12.
 */
async function PersonBody({
  id,
  activeType,
  activeRole,
}: {
  id: string;
  activeType?: ItemType;
  activeRole?: CreditRole;
}) {
  const t = await getTranslations("person");
  const user = await getCurrentUser();
  const supabase = await createClient();

  const profile = await getPersonProfile(supabase, user?.id ?? null, id);
  if (!profile) notFound();

  const total = profile.works.length;

  // Estados de VOLUMEN (spec): con 0 o 1 obra no se rellena el ancho con cajas
  // vacías — no se pinta raíl y la página se queda en dos columnas.
  const rail = total >= 2 ? <PersonRail profile={profile} /> : null;

  return (
    <>
      <div data-area="ficha">
        <PersonCard profile={profile} loggedIn={Boolean(user)} />
      </div>

      <div data-area="obras">
        {total === 0 ? (
          <p className="text-[13px] text-muted-foreground">{t("noWorks")}</p>
        ) : (
          <PersonWorks
            profile={profile}
            basePath={`/persona/${id}`}
            activeType={activeType}
            activeRole={activeRole}
          />
        )}
      </div>

      {rail && <div data-area="rail">{rail}</div>}
    </>
  );
}

export default async function PersonDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tipo?: string; credito?: string }>;
}) {
  const { id } = await params;
  const { tipo, credito } = await searchParams;

  return (
    <div className={`mx-auto w-full ${SHELL_PERSON} px-5 pb-10 pt-[26px] lg:px-[30px]`}>
      <div className="person-grid">
        <Suspense fallback={<PersonSkeleton />}>
          <PersonBody
            id={id}
            activeType={parseTypeSlug(tipo)}
            activeRole={parseRoleSlug(credito)}
          />
        </Suspense>
      </div>
    </div>
  );
}
