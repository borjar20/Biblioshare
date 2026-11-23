"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

const PAGE_SIZE = 3;

export function ReviewList({ children }: { children: ReactNode[] }) {
  const t = useTranslations("detail");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const remaining = children.length - limit;
  return (
    <div>
      {children.slice(0, limit)}
      {remaining > 0 && (
        <button type="button" onClick={() => setLimit(limit + PAGE_SIZE)}
          className="mt-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-muted">
          {t("moreReviews", { count: Math.min(remaining, PAGE_SIZE) })}
        </button>
      )}
    </div>
  );
}
