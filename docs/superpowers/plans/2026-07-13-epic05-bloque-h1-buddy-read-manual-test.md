# EPIC-05 Bloque H1: Buddy Read Checkpoints — Manual Test Checklist

**Date:** 2026-07-13
**Scope:** Checkpoint creation/edit/reorder (moderator+), item pool restriction (book/series only, one item), hybrid suggest+confirm progress marking, cascade auto-confirm, spoiler-gated chat per checkpoint, group-safe indicator, visibility of checkpoints to non-participants
**Test Setup:** Three accounts in a shared private club: A = owner/moderator, B and C = regular members. B and C will both join a `buddy_read` activity as participants; A stays a club member without joining, to exercise the "member but not participant" cases.

---

## Setup & Environment

- [ ] **Step 1: Environment Setup**
  - [ ] Run `npm run dev`
  - [ ] Confirm Accounts A, B, C are all active members of a shared private club (A as owner)
  - [ ] If no test club exists, follow Bloque E's club-creation and invite flow to set one up

---

## Propose + Activate + Item Restriction

- [ ] **Step 2: Propose a `buddy_read` Activity**
  - [ ] Log in as Account A
  - [ ] Open the club, click "Proponer actividad"
  - [ ] Pick kind "Lectura conjunta" (`buddy_read`), give it a title, submit
  - [ ] Confirm it appears with "Propuesta" badge
  - [ ] Click "Activar"
  - [ ] Confirm badge changes to "Activa"

- [ ] **Step 3: Item Pool Restricted to Book/Series, Max One**
  - [ ] Log in as Account B, join the activity ("Unirse")
  - [ ] Click "Añadir ítem" — confirm the picker only lets you pick **book or series** items (no movies offered, or a type selector limited to those two)
  - [ ] Add one book (or series) from your library
  - [ ] Confirm the item appears in the pool
  - [ ] Confirm the "Añadir ítem" button **disappears** (or is disabled) now that the pool has 1 item — buddy_read allows exactly one
  - [ ] (Optional, to confirm server-side enforcement) if you can trigger a second add via a stale UI state, confirm it's rejected

---

## Checkpoints — Definition (Moderator+, Active Only)

- [ ] **Step 4: Checkpoints Not Editable Before This Point**
  - [ ] Log in as Account B (participant, not moderator)
  - [ ] Confirm there is **no way to add/edit checkpoints** — only Account A (moderator) has that control

- [ ] **Step 5: Moderator Creates Checkpoints**
  - [ ] Log in as Account A
  - [ ] Navigate to the activity, locate the "Checkpoints" section
  - [ ] Add checkpoint 1: label "Cap 1", position matching your item's type (page number for a book, season+episode for a series) — pick a **low** value
  - [ ] Add checkpoint 2: label "Cap 2", a **higher** position value
  - [ ] Add checkpoint 3: label "Cap 3", an even **higher** position value
  - [ ] Confirm all three appear in order in the list

- [ ] **Step 6: Reorder and Edit**
  - [ ] As Account A, use "Subir"/"Bajar" to reorder a checkpoint, confirm the order updates
  - [ ] Edit a checkpoint's label, confirm it saves
  - [ ] Restore original order/label when done

- [ ] **Step 7: Checkpoints Frozen After Finish**
  - [ ] Finish the activity ("Finalizar")
  - [ ] Confirm the checkpoint add/edit form **disappears or is disabled**
  - [ ] Re-activate is not possible once finished — if you need to continue testing below, use a **separate still-active** test activity instead, or don't finish this one until Step 14

---

## Checkpoint Visibility (Club-Wide, Not Participant-Only)

- [ ] **Step 8: Non-Participant Club Member Sees the Checkpoint List**
  - [ ] Log in as Account A (moderator, but suppose A hasn't joined as a participant — or use a 4th account if A already joined via earlier steps)
  - [ ] Actually: log in as any club member who has **not** joined this activity as a participant
  - [ ] Navigate to the activity detail page
  - [ ] Confirm the **checkpoint list (labels + positions)** is visible, to help decide whether to join
  - [ ] Confirm the **chat under each checkpoint is empty/inaccessible** (no comments visible, no way to post) since this viewer isn't a participant

---

## Hybrid Suggest + Confirm, Cascade, and Chat Gating

- [ ] **Step 9: Update Your Reading Progress Normally**
  - [ ] Log in as Account B (participant)
  - [ ] Go to your library entry for the shared book/series, update your progress (page/episode) to a value that **surpasses checkpoint 1 but not checkpoint 2** (use the app's normal progress-tracking flow — diary/session update, not anything checkpoint-specific)
  - [ ] Return to the activity's checkpoint list
  - [ ] Confirm checkpoint 1 shows as **suggested/ready to confirm** (not silently auto-marked)
  - [ ] Confirm checkpoint 2 and 3 show as **locked**

- [ ] **Step 10: Confirm a Checkpoint**
  - [ ] Click "Ya llegué aquí" on checkpoint 1
  - [ ] Confirm it now shows as **confirmed**
  - [ ] Confirm the chat section under checkpoint 1 is now visible and lets you post a comment
  - [ ] Post a comment, confirm it appears

- [ ] **Step 11: Confirm Rejected When Not Actually Reached**
  - [ ] Still as Account B, try to confirm checkpoint 3 (which you haven't reached)
  - [ ] Confirm you get an error message (not reached yet) and checkpoint 3 stays locked

- [ ] **Step 12: Cascade Auto-Confirm on a Later Checkpoint**
  - [ ] Log in as Account C (participant), join the activity, add reading progress that **surpasses checkpoint 2** (skipping past checkpoint 1's exact value without confirming it first)
  - [ ] On the checkpoint list, confirm checkpoint 2 shows as suggested
  - [ ] Click "Ya llegué aquí" on checkpoint 2
  - [ ] Confirm **both checkpoint 1 and checkpoint 2** now show as confirmed for Account C (auto-confirm cascade), and checkpoint 3 stays locked
  - [ ] Confirm Account C can now see/post in the chat for checkpoints 1 and 2, but not checkpoint 3

- [ ] **Step 13: Group Progress Board + Group-Safe Indicator**
  - [ ] As Account B or C, confirm you can see **the other participant's** confirmed checkpoints (a "X/Y reached this" indicator per checkpoint)
  - [ ] Confirm there's a "todo el grupo ha llegado hasta: ..." indicator showing the **furthest checkpoint that both B and C have reached** (should be checkpoint 1, since B has only confirmed checkpoint 1 while C has confirmed 1 and 2 — the group-safe point is the minimum across participants)
  - [ ] Have Account B also confirm checkpoint 2 (update progress + confirm), then refresh — confirm the group-safe indicator advances to checkpoint 2

- [ ] **Step 14: Spoiler Gate on Chat — Non-Reached Participant Cannot See Ahead**
  - [ ] Log in as Account C, post a comment on checkpoint 2 (already reached)
  - [ ] Have Account B **not yet reach** checkpoint 2 for a moment (or use a 4th participant who hasn't reached it) and confirm that viewer does **not** see C's comment on checkpoint 2, and cannot post there either
  - [ ] Confirm this viewer **can** see/post in checkpoint 1's chat (already reached)

---

## Notifications (None Expected)

- [ ] **Step 15: No Notifications for Checkpoint Chat**
  - [ ] After the comments posted in Steps 10/14, check the notification bell for any of the participants
  - [ ] Confirm **no new notification** was generated by checkpoint comments (deliberately out of scope for this MVP)

---

## Access Control

- [ ] **Step 16: Non-Club-Member and Anonymous Exclusion**
  - [ ] Log in as an account **not** in this club (or log out)
  - [ ] Try navigating to the activity detail page
  - [ ] Confirm no checkpoint content, chat, or progress leaks

---

## Quality & Console

- [ ] **Step 17: No Console Errors**
  - [ ] Throughout all steps above, monitor DevTools Console and Network tabs
  - [ ] Verify no unexpected error messages or 4xx/5xx responses

---

## Cleanup

- [ ] **Step 18: Test Data Cleanup**
  - [ ] Identify the test club's ID and the test activity's ID
  - [ ] Connect to the dev database and run, in order:
    ```sql
    delete from public.comments
    where target_type = 'activity_checkpoint'
      and target_id in (select id from public.club_activity_checkpoints where activity_id = '<activity-id>');

    delete from public.reactions
    where target_type = 'activity_checkpoint'
      and target_id in (select id from public.club_activity_checkpoints where activity_id = '<activity-id>');

    delete from public.club_activity_checkpoint_reads
    where checkpoint_id in (select id from public.club_activity_checkpoints where activity_id = '<activity-id>');

    delete from public.club_activity_checkpoints where activity_id = '<activity-id>';

    delete from public.club_activity_items where activity_id = '<activity-id>';
    delete from public.club_activity_participants where activity_id = '<activity-id>';
    delete from public.club_activities where id = '<activity-id>';
    ```
  - [ ] Confirm all test checkpoints, reads, comments, and the activity itself are deleted
  - [ ] Verify the club's activities section is clean and ready for the next test cycle

---

## Test Summary

- [ ] 1. Setup and environment
- [ ] 2. Propose a buddy_read activity
- [ ] 3. Item pool restricted to book/series, max one
- [ ] 4. Checkpoints not editable before activation control (non-moderator blocked)
- [ ] 5. Moderator creates checkpoints
- [ ] 6. Reorder and edit checkpoints
- [ ] 7. Checkpoints frozen after finish
- [ ] 8. Non-participant club member sees checkpoint list, not the chat
- [ ] 9. Reading progress auto-suggests a checkpoint
- [ ] 10. Confirm a checkpoint unlocks its chat
- [ ] 11. Confirm rejected when not actually reached
- [ ] 12. Cascade auto-confirm on a later checkpoint
- [ ] 13. Group progress board + group-safe indicator
- [ ] 14. Spoiler gate hides chat from participants who haven't reached it
- [ ] 15. No notifications for checkpoint chat
- [ ] 16. Non-club-member and anonymous exclusion
- [ ] 17. No console errors
- [ ] 18. Test data cleanup

---

**Tester:** _________________
**Date Completed:** _________________
**Notes:** _____________________________________________________________________
