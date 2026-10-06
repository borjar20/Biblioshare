"use client";

import { useState } from "react";
import type { CulturalRelease } from "@/lib/releases/types";
import { EditorialForm } from "./editorial-form";
import { EditorialControls } from "./editorial-controls";

export function EditorialEditor({ release }: { release: CulturalRelease }) {
  const [dirty, setDirty] = useState(false);
  return <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
    <EditorialForm initial={release} onDirtyChange={setDirty} />
    <EditorialControls id={release.id} status={release.status} revision={release.revision} updatedAt={release.updated_at} disabled={dirty} />
  </div>;
}
