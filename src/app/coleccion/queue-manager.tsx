"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Queue } from "@/lib/queue/types";
import {
  createQueue,
  renameQueue,
  deleteQueue,
  type QueueMutationState,
} from "./actions";

const initialState: QueueMutationState = {};

// Create a new queue, and rename/delete the active one. Deleting a queue keeps
// its items (they fall back to "Sin cola"), so no destructive confirmation is
// needed beyond a normal click. §7.22.
export function QueueManager({ activeQueue }: { activeQueue: Queue | null }) {
  const t = useTranslations("queue");
  const router = useRouter();
  const [isDeleting, startDelete] = useTransition();

  const [createState, createAction, creating] = useActionState(
    createQueue,
    initialState,
  );
  const renameBound = activeQueue
    ? renameQueue.bind(null, activeQueue.id)
    : null;
  const [renameState, renameAction, renaming] = useActionState(
    renameBound ?? createQueue,
    initialState,
  );

  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      {/* Rename / delete the active queue. Hidden on the "Sin cola" bucket,
          which isn't a real queue. */}
      {activeQueue && renameBound && (
        <div className="flex flex-col gap-2">
          <form action={renameAction} className="flex gap-2">
            <Input
              name="name"
              aria-label={t("renameLabel")}
              defaultValue={activeQueue.name}
              className="flex-1"
            />
            <Button type="submit" variant="secondary" disabled={renaming}>
              {renaming ? t("saving") : t("rename")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isDeleting}
              onClick={() =>
                startDelete(async () => {
                  await deleteQueue(activeQueue.id);
                  router.push("/coleccion?tab=colas");
                })
              }
            >
              {t("delete")}
            </Button>
          </form>
          {renameState.error && (
            <p className="text-sm text-status-dropped">
              {t(`errors.${renameState.error}`)}
            </p>
          )}
        </div>
      )}

      {showCreate ? (
        <form action={createAction} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              name="name"
              aria-label={t("newQueueLabel")}
              placeholder={t("newQueuePlaceholder")}
              className="flex-1"
              autoFocus
            />
            <Button type="submit" variant="secondary" disabled={creating}>
              {creating ? t("saving") : t("create")}
            </Button>
          </div>
          {createState.error && (
            <p className="text-sm text-status-dropped">
              {t(`errors.${createState.error}`)}
            </p>
          )}
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="self-start"
          onClick={() => setShowCreate(true)}
        >
          {t("newQueue")}
        </Button>
      )}
    </div>
  );
}
