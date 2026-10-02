"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { SearchResult } from "@/lib/catalog/types";
import { addToLibrary } from "./actions";

export function AddToLibraryButton({ result }: { result: SearchResult }) {
  const t = useTranslations("search");
  const [added, setAdded] = useState(false);
  const [rateLimit, setRateLimit] = useState<"catalogRequest" | "googleBooksCreate" | null>(null);
  const [isPending, startTransition] = useTransition();
  const noticeId = useId();

  function handleClick() {
    startTransition(async () => {
      setRateLimit(null);
      const actionResult = await addToLibrary(result);
      if (actionResult?.ok === false) {
        setRateLimit(actionResult.reason);
        return;
      }
      setAdded(true);
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={added ? "secondary" : "primary"}
        onClick={handleClick}
        disabled={isPending || added}
        aria-describedby={rateLimit ? noticeId : undefined}
        className="w-full text-xs"
      >
        {added ? t("added") : isPending ? t("adding") : t("add")}
      </Button>
      {rateLimit && <p id={noticeId} role="alert" className="mt-1 text-xs text-status-dropped">{t(`rateLimit.${rateLimit}`)}</p>}
    </>
  );
}
