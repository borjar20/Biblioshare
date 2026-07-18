"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { FeedEvent } from "@/lib/social/feed";
import { createTextPost, createShareActivityPost, createPoll } from "@/lib/clubs/posts";
import { ActivitySharePicker } from "./activity-share-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/social/user-avatar";
import { PollIcon, ListCheckIcon } from "@/components/ui/icons";

type Mode = "closed" | "text" | "pick_activity" | "share_activity" | "poll";

export function ClubPostComposer({
  clubId,
  viewerName,
  viewerAvatarUrl,
}: {
  clubId: string;
  viewerName: string;
  viewerAvatarUrl: string | null;
}) {
  const t = useTranslations("clubPost");
  const [mode, setMode] = useState<Mode>("closed");
  const [text, setText] = useState("");
  const [shareCaption, setShareCaption] = useState("");
  const [pickedActivity, setPickedActivity] = useState<FeedEvent | null>(null);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollEndsAt, setPollEndsAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setMode("closed");
    setText("");
    setShareCaption("");
    setPickedActivity(null);
    setPollQuestion("");
    setPollOptions(["", ""]);
    setPollEndsAt("");
    setError(null);
  }

  function submitText() {
    startTransition(async () => {
      try {
        await createTextPost(clubId, text);
        reset();
      } catch {
        setError(t("postError"));
      }
    });
  }

  function submitShare() {
    if (!pickedActivity) return;
    const [sourceTable, rowId] = pickedActivity.id.split(":");
    startTransition(async () => {
      try {
        await createShareActivityPost(clubId, shareCaption, {
          sourceTable: sourceTable as "diary_entries_added" | "progress_sessions" | "diary_entries" | "episode_watches",
          rowId,
        });
        reset();
      } catch {
        setError(t("postError"));
      }
    });
  }

  function submitPoll() {
    startTransition(async () => {
      try {
        await createPoll(clubId, pollQuestion, pollOptions, new Date(pollEndsAt).toISOString());
        reset();
      } catch {
        setError(t("postError"));
      }
    });
  }

  if (mode === "closed") {
    // Fila colapsada del frame 2: avatar + disparador de texto + glifos de
    // encuesta y compartir. El placeholder es un botón (abre el modo texto);
    // los glifos abren directamente su modo.
    return (
      <div className="flex items-center gap-2.5 rounded-card border border-border bg-surface p-3 shadow-card">
        <UserAvatar name={viewerName} avatarUrl={viewerAvatarUrl} size={32} />
        <button
          type="button"
          onClick={() => setMode("text")}
          className="min-w-0 flex-1 truncate text-left text-sm text-muted-foreground"
        >
          {t("composerCollapsed")}
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t("createPoll")}
            onClick={() => setMode("poll")}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            <PollIcon className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            aria-label={t("shareActivity")}
            onClick={() => setMode("pick_activity")}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            <ListCheckIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    );
  }

  if (mode === "text") {
    return (
      <div className="flex flex-col gap-2 rounded-card border border-border bg-surface shadow-card p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("composerPlaceholderText")}
          rows={3}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {error && <p className="text-xs text-status-dropped">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" disabled={isPending || !text.trim()} onClick={submitText}>
            {t("postText")}
          </Button>
          <Button type="button" variant="ghost" onClick={reset}>
            {t("cancel")}
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "pick_activity") {
    return (
      <ActivitySharePicker
        onPick={(event) => {
          setPickedActivity(event);
          setMode("share_activity");
        }}
        onCancel={reset}
      />
    );
  }

  if (mode === "share_activity") {
    return (
      <div className="flex flex-col gap-2 rounded-card border border-border bg-surface shadow-card p-3">
        <span className="text-sm text-foreground">{pickedActivity?.itemTitle}</span>
        <textarea
          value={shareCaption}
          onChange={(e) => setShareCaption(e.target.value)}
          placeholder={t("captionPlaceholder")}
          rows={2}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {error && <p className="text-xs text-status-dropped">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" disabled={isPending || !shareCaption.trim()} onClick={submitShare}>
            {t("shareSubmit")}
          </Button>
          <Button type="button" variant="ghost" onClick={reset}>
            {t("cancel")}
          </Button>
        </div>
      </div>
    );
  }

  // mode === "poll"
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface shadow-card p-3">
      <Input
        value={pollQuestion}
        onChange={(e) => setPollQuestion(e.target.value)}
        placeholder={t("pollQuestion")}
      />
      {pollOptions.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={opt}
            onChange={(e) => {
              const next = [...pollOptions];
              next[i] = e.target.value;
              setPollOptions(next);
            }}
            placeholder={`${t("pollOption")} ${i + 1}`}
          />
          {pollOptions.length > 2 && (
            <button
              type="button"
              onClick={() => setPollOptions(pollOptions.filter((_, idx) => idx !== i))}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {t("removeOption")}
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setPollOptions([...pollOptions, ""])}
        className="self-start text-xs text-accent hover:underline"
      >
        {t("addOption")}
      </button>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t("pollEndsAt")}
        <input
          type="datetime-local"
          value={pollEndsAt}
          onChange={(e) => setPollEndsAt(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </label>
      {error && <p className="text-xs text-status-dropped">{error}</p>}
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={
            isPending ||
            !pollQuestion.trim() ||
            pollOptions.filter((o) => o.trim()).length < 2 ||
            !pollEndsAt
          }
          onClick={submitPoll}
        >
          {t("pollSubmit")}
        </Button>
        <Button type="button" variant="ghost" onClick={reset}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
