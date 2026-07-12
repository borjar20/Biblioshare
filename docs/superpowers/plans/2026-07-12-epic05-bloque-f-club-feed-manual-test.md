# EPIC-05 Bloque F: Club Feed — Manual Test Checklist

**Date:** 2026-07-12  
**Scope:** Club feed UI, post creation, sharing, notifications, reactions, comments, comment-liking, polls, and permissions  
**Test Setup:** Two accounts (A = club owner, B = regular member), both active in a shared private club. Reuse/re-run Bloque E's club-setup steps if no test club exists.

---

## Setup & Environment

- [ ] **Step 1: Environment Setup**
  - [ ] Run `npm run dev`
  - [ ] Log in as Account A (club owner)
  - [ ] Confirm Account A and Account B are both active members of a shared private club (A as owner, B as member)
  - [ ] If no test club exists, follow Bloque E's club-creation and invite flow to set one up

---

## Basic Post Creation & Notifications

- [ ] **Step 2: Text Post Creation**
  - [ ] Log in as Account B (regular member, not moderator)
  - [ ] Open the club
  - [ ] Use the composer's "Publicar" button
  - [ ] Write a short text post
  - [ ] Submit the post
  - [ ] Confirm the post appears at the top of the feed immediately
  - [ ] Confirm the post displays B's name
  - [ ] Confirm no "Editar" (edit) affordance appears anywhere on the post (posts are not editable)

- [ ] **Step 3: New-Post Notification**
  - [ ] Log in as Account A
  - [ ] Confirm a "publicó en el club" notification has arrived
  - [ ] Verify the notification links to the club page
  - [ ] Click the notification and confirm it navigates to the club

---

## Activity Sharing & Privacy

- [ ] **Step 4: Share an Activity**
  - [ ] Log in as Account A
  - [ ] Mark a book or movie as finished with a rating in your own library (via the normal item page, outside the club)
  - [ ] Navigate to the club
  - [ ] Use "Compartir actividad" in the club composer
  - [ ] Pick the activity from the picker
  - [ ] Add a required caption
  - [ ] Submit the post
  - [ ] Confirm the post shows the item title and cover as a card
  - [ ] Confirm the item card links to the item page
  - [ ] Confirm the caption is displayed below/within the post

- [ ] **Step 5: Shared-Activity Visibility Across Privacy Levels**
  - [ ] Make Account A's profile private (via `/cuenta` or profile settings)
  - [ ] Log in as Account B (club member who does NOT follow Account A)
  - [ ] Navigate to the club feed
  - [ ] Confirm B can still see the full shared-activity card's details (title, rating) from step 4
  - [ ] Verify this is the core new RLS behavior for club-shared activities
  - [ ] Create a third test Account C (not a member of this club)
  - [ ] Log in as Account C
  - [ ] Attempt to access this club's `/club/[slug]` page
  - [ ] Confirm Account C cannot see the activity post at all
  - [ ] Log in as Account C to a different page and access Account A's profile
  - [ ] Confirm the shared activity is not visible on A's private profile to non-follower C
  - [ ] Log in as Account A and revert the profile privacy toggle to restore original state

---

## Polls

- [ ] **Step 6: Poll Creation and Voting (Before Close)**
  - [ ] Log in as Account B
  - [ ] Use "Crear encuesta" in the club composer
  - [ ] Enter a poll question
  - [ ] Add 2 or more options
  - [ ] Set a close date/time a few minutes in the future
  - [ ] Submit the poll
  - [ ] Confirm the poll post appears in the club feed
  - [ ] Confirm radio-button options are displayed
  - [ ] Log in as Account A
  - [ ] Vote for one of the options
  - [ ] Confirm results are hidden initially (no vote counts shown)
  - [ ] Confirm vote counts appear immediately after A's vote
  - [ ] Log in as Account B (poll creator, who hasn't voted yet)
  - [ ] Confirm B still cannot see results until B votes as well
  - [ ] (Prepare poll data for steps 7 and 8 — remember the poll ID or ensure you can find it for SQL manipulation)

- [ ] **Step 7: Poll — Change Vote**
  - [ ] Log in as Account A
  - [ ] Locate the poll from Step 6
  - [ ] Vote for a different option than the initial choice
  - [ ] Confirm the vote count moves from the old option to the new one
  - [ ] Confirm the total vote count remains 1 (from A only)

- [ ] **Step 8: Poll — Closing and Results Display**
  - [ ] Create a second poll (as Account B) with a close time approximately 1 minute in the future
  - [ ] Alternatively, manually adjust `poll_ends_at` via SQL against the dev database for faster testing
  - [ ] Wait for the close time to pass
  - [ ] Refresh the club feed page
  - [ ] Confirm voting is disabled (radio buttons are non-interactive or a "closed" message is shown)
  - [ ] Confirm results are now visible even to an account that never voted

---

## Reactions & Comments

- [ ] **Step 9: Reactions and Comments on Club Posts**
  - [ ] Log in as Account A
  - [ ] Locate B's text post from Step 2
  - [ ] Like/react to B's post
  - [ ] Confirm the like count increments
  - [ ] Log in as Account B
  - [ ] Confirm a "le gustó tu publicación" notification has arrived from A
  - [ ] Log in as Account B
  - [ ] Locate A's shared-activity post from Step 4
  - [ ] Write a comment on A's post
  - [ ] Submit the comment
  - [ ] Log in as Account A
  - [ ] Confirm a "comentó tu publicación" notification has arrived from B
  - [ ] Click the notification and confirm it navigates to the club post

- [ ] **Step 10: Comment-Liking (Club Posts and App-Wide)**
  - [ ] Log in as Account A
  - [ ] Locate B's comment from Step 9
  - [ ] Like/react to B's comment
  - [ ] Confirm the like count on the comment increments
  - [ ] Log in as Account B
  - [ ] Confirm a "le gustó tu comentario" notification has arrived from A
  - [ ] Navigate to any existing book/movie review (outside the club) that has a comment on it
  - [ ] Confirm the same like-a-comment button is visible on that review's comment
  - [ ] Like the comment on the review
  - [ ] Confirm the like count increments identically to club comments (app-wide comment-liking, not club-only)

---

## Permissions & Access Control

- [ ] **Step 11: Delete Permissions**
  - [ ] Log in as Account B (regular member)
  - [ ] Locate B's own text post from Step 2
  - [ ] Confirm a delete button is visible
  - [ ] Click delete and confirm the post is removed
  - [ ] Log in as Account B again
  - [ ] Locate A's shared-activity post from Step 4
  - [ ] Confirm B does NOT see a delete button on A's post
  - [ ] Log in as Account A (club owner/moderator)
  - [ ] Locate a post created by B (recreate one if the post was deleted in the previous check)
  - [ ] Confirm A CAN see a delete button on B's post
  - [ ] Confirm A has moderator+ deletion power to delete B's content

- [ ] **Step 12: Non-Member Exclusion**
  - [ ] Log in as an account NOT in this club
  - [ ] Navigate to the club's `/club/[slug]` page
  - [ ] Confirm the club's feed section shows no posts (shows 404, access denied, or empty state per Bloque E's existing private-club behavior)
  - [ ] Confirm no post content leaks to non-members

---

## Performance & Quality

- [ ] **Step 13: Pagination**
  - [ ] Create enough posts in the club to exceed one page (or temporarily lower `PAGE_SIZE` in the code for testing)
  - [ ] Navigate to the club feed
  - [ ] Confirm the initial page loads with the expected post count
  - [ ] Scroll to or click "Cargar más"
  - [ ] Confirm the next batch of posts loads
  - [ ] Verify no posts are duplicated across pages
  - [ ] Verify no posts are dropped or missing

- [ ] **Step 14: Console & Browser Quality**
  - [ ] Throughout all steps above, keep the browser developer console open
  - [ ] Confirm no JavaScript errors appear during any action (post creation, voting, liking, commenting, etc.)
  - [ ] Confirm no console warnings or errors related to the club feed feature
  - [ ] Confirm network requests complete successfully (no 500 or 4xx errors for expected API calls)

---

## Cleanup

- [ ] **Step 15: Test Data Cleanup**
  - [ ] Identify the test club's ID
  - [ ] Connect to the dev database
  - [ ] Run the following cleanup SQL commands (adjust if any comment-likes were made on non-club-post targets — clean those by their own comment ID):
    ```sql
    delete from public.club_poll_votes where post_id in (select id from public.club_posts where club_id = '<club-id>');
    delete from public.club_poll_options where post_id in (select id from public.club_posts where club_id = '<club-id>');
    delete from public.reactions where target_type in ('club_post','comment') and target_id in (select id::text::uuid from public.club_posts where club_id = '<club-id>');
    delete from public.comments where target_type = 'club_post' and target_id in (select id from public.club_posts where club_id = '<club-id>');
    delete from public.club_posts where club_id = '<club-id>';
    ```
  - [ ] Confirm all test posts are deleted
  - [ ] Confirm all test poll votes and options are deleted
  - [ ] Confirm all test reactions and comments are deleted
  - [ ] If Account A's profile privacy was changed in Step 5, revert it to the original state
  - [ ] Verify the club feed is clean and ready for the next test cycle

---

## Test Summary

- [ ] All 15 test scenarios completed
- [ ] No critical bugs or blockers identified
- [ ] All expected notifications received
- [ ] All access-control rules enforced
- [ ] Pagination and performance verified
- [ ] Test data cleaned up
