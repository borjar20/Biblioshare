"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { SearchResult } from "@/lib/catalog/types";
import { addToLibrary } from "./actions";

export function AddToLibraryButton({ result }: { result: SearchResult }) {
  const t = useTranslations("search");
  const [added, setAdded] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await addToLibrary(result);
      setAdded(true);
    });
  }

  return (
    <Button
      type="button"
      variant={added ? "secondary" : "primary"}
      onClick={handleClick}
      disabled={isPending || added}
      className="w-full text-xs"
    >
      {added ? t("added") : isPending ? t("adding") : t("add")}
    </Button>
  );
}
