import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";

export default async function ProfileNotFound() {
  const t = await getTranslations("profile");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">
        {t("notFoundTitle")}
      </h1>
      <p className="max-w-md text-lg text-muted-foreground">
        {t("notFoundDescription")}
      </p>
      <Link href="/" className={buttonVariants("primary")}>
        {t("backHome")}
      </Link>
    </div>
  );
}
