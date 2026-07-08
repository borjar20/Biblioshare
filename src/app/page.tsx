import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Button, buttonVariants } from "@/components/ui/button";
import { getLibraryItems } from "@/lib/library/get-library-items";
import { NowConsuming } from "@/components/now-consuming";
import { logout } from "./(auth)/actions";

export default async function Home() {
  const t = await getTranslations();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let username: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("user_id", user.id)
      .maybeSingle();
    username = profile?.username ?? null;
  }

  const inProgress = user
    ? await getLibraryItems(supabase, user.id, { status: "in_progress" })
    : [];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-6 px-4 py-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">
        {t("common.appName")}
      </h1>
      <p className="max-w-md text-lg text-muted-foreground">
        {t("home.tagline")}
      </p>

      {username ? (
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">@{username}</span>
          <form action={logout}>
            <Button type="submit" variant="secondary">
              {t("auth.logout")}
            </Button>
          </form>
        </div>
      ) : (
        <Link href="/signup" className={buttonVariants("primary", "px-6")}>
          {t("home.cta")}
        </Link>
      )}

      {inProgress.length > 0 && (
        <div className="w-full text-left">
          <NowConsuming items={inProgress} />
        </div>
      )}
    </div>
  );
}
