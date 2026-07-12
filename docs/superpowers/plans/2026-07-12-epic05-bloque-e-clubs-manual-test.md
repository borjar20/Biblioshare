# EPIC-05 Bloque E: Clubs Manual Test Checklist

**Date:** 2026-07-12  
**Scope:** Full end-to-end manual verification of club features (creation, discovery, membership, invitations, roles, transfers, removals)  
**Test Accounts:** Account A (will become owner), Account B (second account for invitations and joins)

---

## Setup

- [ ] Start dev server with `npm run dev`
- [ ] Log in as Account A
- [ ] Verify dashboard loads without errors

---

## Create Public Club

- [ ] Navigate to `/clubes` page
- [ ] Click "Crear club" button
- [ ] Fill in the form:
  - [ ] Enter club name (e.g., "Test Public Club")
  - [ ] Enter club slug (e.g., "test-public-club")
  - [ ] Enter description
  - [ ] Ensure visibility is set to **public** (not checked)
  - [ ] Upload a cover image
- [ ] Submit the form
- [ ] Verify the create form closes and the new club appears in "Mis clubes" on `/clubes` (no redirect — the page stays on `/clubes`)
- [ ] Confirm club appears in `/clubes` list for Account A
- [ ] Verify `/club/test-public-club` renders with the cover image
- [ ] Confirm Account A does **not** see an "Unirse" button (already owner)
- [ ] Confirm Account A sees an "Editar" button

---

## Create Private Club

- [ ] Navigate to `/clubes` page
- [ ] Click "Crear club" button
- [ ] Fill in the form:
  - [ ] Enter club name (e.g., "Test Private Club")
  - [ ] Enter club slug (e.g., "test-private-club")
  - [ ] Enter description
  - [ ] **Check the visibility checkbox to make it private**
  - [ ] Upload a cover image
- [ ] Submit the form
- [ ] Verify the create form closes and the new club appears in "Mis clubes" on `/clubes` (no redirect — the page stays on `/clubes`)
- [ ] Confirm club appears in Account A's "Mis clubes"
- [ ] Log in as Account B
- [ ] Navigate to `/clubes` → "Descubrir" tab
- [ ] Verify the private club is **NOT** listed in discovery results
- [ ] Try navigating directly to `/club/test-private-club` by pasting URL
- [ ] Verify Account B receives a **404 error** (private club entirely invisible to non-members)
- [ ] Log back in as Account A

---

## Join Public Club (Account B)

- [ ] Log in as Account B
- [ ] Navigate to `/clubes` page
- [ ] Click the "Descubrir" tab
- [ ] Find Account A's public club ("Test Public Club")
- [ ] Click the "Unirse" button
- [ ] Verify Account B is **immediately active** (no approval step)
- [ ] Verify the club now appears in Account B's "Mis clubes" list
- [ ] Verify the "Unirse" button has changed (no longer available as B is now a member)

---

## Invite to Private Club (Account B)

- [ ] Log in as Account A (owner of private club)
- [ ] Navigate to `/club/test-private-club`
- [ ] Click "Gestionar miembros"
- [ ] Type Account B's username into the invite field
- [ ] Submit the invite
- [ ] Log in as Account B
- [ ] Verify a notification arrives with message "te invito a un club"
- [ ] Try navigating to `/club/test-private-club`
- [ ] Verify Account B can now access it (previously returned 404)
- [ ] Confirm the page shows "Aceptar invitacion" and "Rechazar" buttons
- [ ] Click "Aceptar"
- [ ] Log back in as Account A
- [ ] Verify a notification arrives with message "acepto tu invitacion"
- [ ] Navigate to `/club/test-private-club` → "Gestionar miembros"
- [ ] Verify Account B now appears as an active member in the list

---

## Decline an Invite

- [ ] As Account A, remove Account B from the private club's member list (if still present from previous step)
- [ ] Invite Account B again to the private club
- [ ] Log in as Account B
- [ ] Verify the notification "te invito a un club" arrives
- [ ] Navigate to `/club/test-private-club`
- [ ] Click "Rechazar" button
- [ ] Log in as Account A (or refresh)
- [ ] Verify Account B does **not** appear in the member list
- [ ] Log in as Account B
- [ ] Try navigating to `/club/test-private-club`
- [ ] Verify it returns a **404 error** again (B no longer has access)

---

## Roles

- [ ] As Account A, invite Account B again to the private club
- [ ] As Account B, navigate to `/club/test-private-club` and accept the invitation
- [ ] As Account A, go to "Gestionar miembros"
- [ ] Find Account B in the member list
- [ ] Click "Ascender a moderador" (or equivalent promote action)
- [ ] Verify Account B's role label updates to "Moderador"
- [ ] Log in as Account B
- [ ] Navigate to `/club/test-private-club` → "Gestionar miembros"
- [ ] Verify Account B can now see the member management interface
- [ ] Confirm Account B does **NOT** see the "Ascender/Bajar/Transferir propiedad" options
- [ ] Confirm Account B does **NOT** see these owner-only actions for Account A

---

## Leave Blocked as Owner

- [ ] As Account A (owner) on the private club where Account B is an active member
- [ ] Navigate to the club detail page
- [ ] Verify there is **no visible "Salir" button** for the owner (should be hidden in `club-header.tsx` per plan)
- [ ] Confirm the block is enforced by UI (button absence), not just server-side validation

---

## Transfer Ownership

- [ ] As Account A, navigate to `/club/test-private-club` → "Gestionar miembros"
- [ ] Find Account B in the member list
- [ ] Click "Transferir propiedad" action
- [ ] Verify the transfer completes
- [ ] As Account A, verify your role now shows as "Moderador"
- [ ] Log in as Account B
- [ ] Verify your role now shows as "Owner" in the member list
- [ ] As Account A, navigate to `/club/test-private-club`
- [ ] Verify a "Salir" button is now visible (no longer owner)
- [ ] As Account B, navigate to `/club/test-private-club`
- [ ] Verify **no "Salir" button** is visible (now owner)

---

## Remove Member

- [ ] As Account B (now owner), go to "Gestionar miembros"
- [ ] Find Account A in the member list
- [ ] Click "Expulsar" (or equivalent remove action)
- [ ] Log in as Account A
- [ ] Navigate to "Mis clubes"
- [ ] Verify the private club is **no longer listed**
- [ ] Try navigating directly to `/club/test-private-club`
- [ ] Verify it returns a **404 error** (no longer a member)

---

## No Console Errors

- [ ] Throughout all tests above, open browser DevTools (F12)
- [ ] Monitor the **Console** tab
- [ ] Verify **no error messages** appear (warnings are acceptable)
- [ ] Perform a final pass through all club pages to ensure clean console

---

## Cleanup

- [ ] Option 1 (SQL cleanup):
  - [ ] Connect to dev database
  - [ ] Execute: `delete from public.club_members where club_id in (select id from public.clubs where slug in ('test-public-club', 'test-private-club'));`
  - [ ] Execute: `delete from public.clubs where slug in ('test-public-club', 'test-private-club');`
- [ ] Option 2 (Auto-delete via ownership transfer):
  - [ ] Remove all members except Account A from both test clubs
  - [ ] Have Account A leave each club (now possible since A was the last member)
  - [ ] Verify auto-delete ownership trigger cleans up the clubs
- [ ] Verify both test clubs are removed from the database

---

## Summary

- [ ] 1. Setup
- [ ] 2. Create public club
- [ ] 3. Create private club
- [ ] 4. Join public club (Account B)
- [ ] 5. Invite to private club (Account B)
- [ ] 6. Decline an invite
- [ ] 7. Roles (moderator promotion)
- [ ] 8. Leave-blocked-as-owner
- [ ] 9. Transfer ownership
- [ ] 10. Remove member
- [ ] 11. No console errors
- [ ] 12. Cleanup

**Tester:** _________________  
**Date Completed:** _________________  
**Notes:** _____________________________________________________________________
