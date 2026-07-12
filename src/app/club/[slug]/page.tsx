import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getClub } from "@/lib/clubs/clubs";
import { listClubPosts } from "@/lib/clubs/posts";
import { ClubHeader } from "@/components/clubs/club-header";
import { ManageMembers } from "@/components/clubs/manage-members";
import { ClubFeed } from "@/components/clubs/club-feed";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const club = await getClub(slug);
  return { title: club ? `${club.name} — Biblioshare` : "Club — Biblioshare" };
}

export default async function ClubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const club = await getClub(slug);
  if (!club) notFound();

  const initialPage = club.viewerRole ? await listClubPosts(club.id) : { posts: [], nextCursor: null };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <ClubHeader club={club} userId={user.id} />
      {(club.viewerRole === "moderator" || club.viewerRole === "owner") && (
        <ManageMembers clubId={club.id} viewerRole={club.viewerRole} viewerId={user.id} />
      )}
      {club.viewerRole && (
        <ClubFeed clubId={club.id} viewerId={user.id} viewerRole={club.viewerRole} initialPage={initialPage} />
      )}
    </div>
  );
}
