"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ItemType } from "@/lib/catalog/types";
import { addExistingItemToLibrary } from "@/lib/library/add-existing-item";

export function ItemLibraryButton({
  itemType,
  itemId,
  initiallyAdded,
}: {
  itemType: ItemType;
  itemId: string;
  initiallyAdded: boolean;
}) {
  const t = useTranslations("search");
  const [added, setAdded] = useState(initiallyAdded);
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={added ? "secondary" : "primary"}
      disabled={isPending || added}
      onClick={() =>
        startTransition(async () => {
          await addExistingItemToLibrary(itemType, itemId);
          setAdded(true);
        })
      }
    >
      {added ? t("added") : isPending ? t("adding") : t("add")}
    </Button>
  );
}
