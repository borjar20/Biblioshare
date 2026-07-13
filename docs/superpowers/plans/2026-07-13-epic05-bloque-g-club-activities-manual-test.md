# EPIC-05 Bloque G: Club Activities — Manual Test Checklist

**Date:** 2026-07-13  
**Scope:** Club activity creation, activation, permissions, item pools, opinions, finishing, archiving, and access control  
**Test Setup:** Two accounts (A = club owner, B = regular member), both active in a shared private club. Reuse/re-run Bloque E's club-setup steps if no test club exists.

---

## Setup & Environment

- [ ] **Step 1: Environment Setup**
  - [ ] Run `npm run dev`
  - [ ] Log in as Account A (club owner)
  - [ ] Confirm Account A and Account B are both active members of a shared private club (A as owner, B as member)
  - [ ] If no test club exists, follow Bloque E's club-creation and invite flow to set one up

---

## Activity Proposal

- [ ] **Step 2: Propose Activity (No Role Gate)**
  - [ ] Log in as Account B (regular member, not moderator)
  - [ ] Open the club
  - [ ] Click "Proponer actividad" button
  - [ ] Fill in the form:
    - [ ] Pick an activity kind (e.g., "Lectura", "Visionado")
    - [ ] Enter a title for the activity
  - [ ] Submit the form
  - [ ] Confirm the activity appears in the "Actividades" list with a "Propuesta" badge
  - [ ] Confirm non-moderators can propose activities

- [ ] **Step 3: Propose Activity Notification**
  - [ ] Log in as Account A (club owner/moderator)
  - [ ] Confirm a "propuso una actividad" notification has arrived from Account B
  - [ ] Click the notification and confirm it navigates to `/club/[slug]/actividad/[id]` (the activity detail page)
  - [ ] Verify the notification contains the activity title

---

## Activity Activation

- [ ] **Step 4: Activate Permission Gating**
  - [ ] Log in as Account B (regular member, not moderator)
  - [ ] Navigate to the activity detail page from Step 2
  - [ ] Confirm there is **NO "Activar" button** visible (only moderators can activate)
  - [ ] Log in as Account A (club owner, has moderator privileges)
  - [ ] Navigate to the same activity detail page
  - [ ] Confirm the "Activar" button **IS visible**
  - [ ] Click "Activar"
  - [ ] Confirm the badge changes from "Propuesta" to "Activa"

- [ ] **Step 5: Activate Activity Notification**
  - [ ] Log in as Account B
  - [ ] Confirm an "activó una actividad" notification has arrived from Account A
  - [ ] Verify the notification is related to the activity

---

## Item Pool Management

- [ ] **Step 6: Join Activity and Add Items**
  - [ ] Log in as Account B
  - [ ] Navigate to the active activity (from Step 4)
  - [ ] Click "Unirse" button
  - [ ] Confirm the button changes to "Salir"
  - [ ] Confirm Account B is now a participant in this activity
  - [ ] Click "Añadir ítem" button
  - [ ] Search your library for an item
  - [ ] Pick an item and add it
  - [ ] Confirm the item appears in the activity's item pool

- [ ] **Step 7: Item Pool Visibility Without Joining**
  - [ ] Log in as Account A (club owner, but NOT a participant of this activity)
  - [ ] Navigate to the same activity detail page
  - [ ] Confirm Account A **CAN SEE** the item pool with B's item (pool is club-visible, not participant-only)
  - [ ] Confirm Account A has **NO "Añadir ítem" button** (not a participant)
  - [ ] Confirm Account A CAN see a "Quitar" button on B's item (moderator privilege to remove items)
  - [ ] Do NOT click "Quitar" yet (we need it for Step 9)

- [ ] **Step 8: Item Pool — Non-Participant Blocked**
  - [ ] Create or log in as a third Account C (in the same club but not a participant of this activity)
  - [ ] Navigate to the activity detail page
  - [ ] Confirm Account C **CAN SEE** the item pool (club-visible)
  - [ ] Confirm Account C has **NO "Añadir ítem" button** (not a participant)
  - [ ] Confirm Account C has **NO "Quitar" button** (not a moderator)

---

## Opinions & Comments

- [ ] **Step 9: Opinions Locked for Non-Participants**
  - [ ] Log in as Account A (club owner/moderator, but not a participant of this activity)
  - [ ] Navigate to the activity detail page
  - [ ] Locate the opinions section
  - [ ] Confirm the message reads "Únete a la actividad para ver y añadir opiniones" or similar
  - [ ] Confirm **NO actual opinion content or form** is displayed
  - [ ] Confirm there is **NO "Añadir opinión" button or input field**

- [ ] **Step 10: Opinions — Participant Can Add and See**
  - [ ] Log in as Account B (participant)
  - [ ] Navigate to the activity detail page
  - [ ] Locate the item B added in Step 6 in the item pool
  - [ ] Click to add a rating and comment on this item (or locate an existing opinion interface)
  - [ ] Add a rating (e.g., stars) and a comment
  - [ ] Submit the opinion
  - [ ] Confirm the opinion is displayed under that item in the opinions section

- [ ] **Step 11: Opinions Visible After Joining**
  - [ ] Log in as Account A (still not a participant)
  - [ ] Navigate to the activity detail page
  - [ ] Confirm the opinions section still shows the "Únete a la actividad para ver y añadir opiniones" message
  - [ ] Click "Unirse" to join this activity as a participant
  - [ ] Refresh the page
  - [ ] Confirm the message is now **gone**
  - [ ] Confirm Account A can **NOW SEE** B's opinion/rating from Step 10
  - [ ] Confirm an "Añadir opinión" interface is now visible

---

## Activity Finalization

- [ ] **Step 12: Finish — Creator Can, Without Being Moderator**
  - [ ] Log in as Account B (regular member)
  - [ ] Propose a fresh activity (as in Step 2)
  - [ ] Log in as Account A
  - [ ] Navigate to the new activity and click "Activar"
  - [ ] Log in as Account B
  - [ ] Navigate to the active activity detail page
  - [ ] Confirm a "Finalizar" button **IS visible** (B is the creator)
  - [ ] Click "Finalizar"
  - [ ] Confirm the badge changes from "Activa" to "Finalizada"

- [ ] **Step 13: Finish — Blocked for Non-Creator Non-Moderator**
  - [ ] Log in as Account A (club owner)
  - [ ] Propose a fresh activity
  - [ ] Click "Activar" (A is moderator/owner)
  - [ ] Log in as Account B
  - [ ] Navigate to the active activity detail page
  - [ ] Confirm there is **NO "Finalizar" button** (B is not the creator, not a moderator)

---

## Activity Archival

- [ ] **Step 14: Archive From Proposed and Active States**
  - [ ] Log in as Account A (moderator)
  - [ ] Propose a throwaway activity (to keep it in "Propuesta" state)
  - [ ] Click "Archivar"
  - [ ] Confirm the badge changes to "Archivada"
  - [ ] Separately, propose and activate another fresh activity (by A)
  - [ ] Click "Archivar" on this active activity
  - [ ] Confirm the badge changes from "Activa" to "Archivada"
  - [ ] Verify archiving works from both "Propuesta" and "Activa" states

---

## Access Control

- [ ] **Step 15: Non-Member Exclusion**
  - [ ] Log in as an account **NOT** in this club
  - [ ] Try navigating directly to `/club/[slug]/actividad/[id]` for any of the test activities
  - [ ] Confirm the page returns a **404 error** or access-denied message
  - [ ] Navigate to `/club/[slug]` for this club
  - [ ] Confirm the "Actividades" section is **not rendered at all** or shows no content
  - [ ] Verify no activity content leaks to non-club-members

---

## Quality & Console

- [ ] **Step 16: No Console Errors**
  - [ ] Throughout all steps above, open browser DevTools (F12)
  - [ ] Monitor the **Console** tab
  - [ ] Verify **no error messages** appear during:
    - [ ] Proposing activities
    - [ ] Activating activities
    - [ ] Joining/leaving activities
    - [ ] Adding items to the pool
    - [ ] Adding opinions/ratings
    - [ ] Finishing and archiving activities
    - [ ] Navigating between activity pages
  - [ ] Verify no 4xx or 5xx errors in the Network tab

---

## Cleanup

- [ ] **Step 17: Test Data Cleanup**
  - [ ] Identify the test club's ID
  - [ ] Connect to the dev database
  - [ ] Run the following cleanup SQL commands in order:
    ```sql
    delete from public.club_activity_opinions 
    where activity_id in (select id from public.club_activities where club_id = '<club-id>');
    
    delete from public.club_activity_items 
    where activity_id in (select id from public.club_activities where club_id = '<club-id>');
    
    delete from public.club_activity_participants 
    where activity_id in (select id from public.club_activities where club_id = '<club-id>');
    
    delete from public.club_activities where club_id = '<club-id>';
    ```
  - [ ] Confirm all test activities are deleted
  - [ ] Confirm all test activity items are deleted
  - [ ] Confirm all test activity participants are deleted
  - [ ] Confirm all test opinions are deleted
  - [ ] Verify the club's activities section is clean and ready for the next test cycle

---

## Test Summary

- [ ] 1. Setup and environment
- [ ] 2. Propose activity (no role gate)
- [ ] 3. Propose activity notification
- [ ] 4. Activate permission gating
- [ ] 5. Activate activity notification
- [ ] 6. Join activity and add items
- [ ] 7. Item pool visibility without joining
- [ ] 8. Item pool — non-participant blocked
- [ ] 9. Opinions locked for non-participants
- [ ] 10. Opinions — participant can add and see
- [ ] 11. Opinions visible after joining
- [ ] 12. Finish — creator can, without being moderator
- [ ] 13. Finish — blocked for non-creator non-moderator
- [ ] 14. Archive from proposed and active states
- [ ] 15. Non-member exclusion
- [ ] 16. No console errors
- [ ] 17. Test data cleanup

---

**Tester:** _________________  
**Date Completed:** _________________  
**Notes:** _____________________________________________________________________
