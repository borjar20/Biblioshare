import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getClub } from "@/lib/clubs/clubs";
import { getActivity } from "@/lib/clubs/activities/core";
import { ActivityDetailView } from "@/components/clubs/activity-detail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const activity = await getActivity(id);
  return { title: activity ? `${activity.title} — Biblioshare` : "Actividad — Biblioshare" };
}

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const club = await getClub(slug);
  if (!club || !club.viewerRole) notFound();

  const activity = await getActivity(id);
  if (!activity || activity.clubId !== club.id) notFound();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <ActivityDetailView
        activity={activity}
        viewerId={user.id}
        viewerRole={club.viewerRole}
        clubSlug={slug}
        clubName={club.name}
      />
    </div>
  );
}
