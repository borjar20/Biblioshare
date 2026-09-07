import { ImageResponse } from "next/og";
import { createPublicClient } from "@/lib/supabase/server";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { getProfilePet } from "@/lib/pet/get-profile-pet";
import { getProfilePetImage } from "@/lib/pet/profile-pet-image";
import { getProfileByUsername } from "@/lib/profile/get-profile-by-username";
import { getLibraryStats } from "@/lib/library/get-library-stats";

export const alt = "Perfil de Biblioshare";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  await connection();
  // A share image must not embed a private profile visible only to the caller.
  const supabase = createPublicClient();
  const profile = await getProfileByUsername(supabase, username);

  const name = profile?.displayName || profile?.username || username;
  const [stats, pet] = profile ? await Promise.all([
    getLibraryStats(supabase, profile.userId), getProfilePet(supabase, profile.userId),
  ]) : [null, null];
  const art = pet ? await getProfilePetImage(pet) : null;
  const t = await getTranslations({ locale: "es", namespace: "pet" });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 24,
          padding: 80,
          // Satori no resuelve CSS vars: espejo manual de --background /
          // --foreground (modo oscuro) de globals.css.
          background: "#1f1a16",
          color: "#f0e8db",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 32, opacity: 0.7 }}>
          Biblioshare
        </div>
        <div style={{ display: "flex", fontSize: 72, fontWeight: 600, maxHeight: 170, overflow: "hidden" }}>
          {name}
        </div>
        <div style={{ display: "flex", fontSize: 36, opacity: 0.8 }}>
          @{profile?.username ?? username}
        </div>
        {pet && (
          <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 28 }}>
            {art && (
              <div style={{ display: "flex", position: "relative", overflow: "hidden", width: art.entry.cell, height: art.entry.cell, flexShrink: 0 }}>
                {/* Satori needs an img with the original sheet dimensions; clip one idle cell. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="" src={art.src} width={art.entry.width} height={art.entry.height}
                  style={{ position: "absolute", left: 0, top: -art.entry.anims.idle.row * art.entry.cell, maxWidth: "none" }} />
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ display: "flex" }}>{pet.name}</div>
              <div style={{ display: "flex", opacity: 0.8 }}>{t(`classes.${pet.petClass}`)}</div>
            </div>
          </div>
        )}
        {stats && (
          <div style={{ display: "flex", gap: 32, fontSize: 32, marginTop: 16 }}>
            <div style={{ display: "flex" }}>{stats.book} libros</div>
            <div style={{ display: "flex" }}>{stats.movie} películas</div>
            <div style={{ display: "flex" }}>{stats.series} series</div>
          </div>
        )}
      </div>
    ),
    { ...size, headers: { "Cache-Control": "private, no-store" } }
  );
}
