-- ============================================================================
-- BookSpace — Phase 1 Row Level Security
--
-- Principles:
--   1. Deny by default. RLS is enabled on every table; nothing is readable
--      without a policy that names auth.uid().
--   2. Private is private. Notes, quotes, learnings, sessions, activity and
--      tabs are readable ONLY by their owner — there is no "public" path to
--      them at all, so no future feature can accidentally expose them.
--   3. Public is explicit. Only profiles and reviews can opt in to being
--      visible, and only via their own visibility column.
--   4. Ownership cannot be reassigned. Every write policy carries a
--      `with check` that pins user_id to auth.uid(), so a client cannot insert
--      or update a row into someone else's account.
--   5. The service role bypasses RLS by design and must never reach the client.
-- ============================================================================

alter table profiles          enable row level security;
alter table books             enable row level security;
alter table user_books        enable row level security;
alter table shelves           enable row level security;
alter table shelf_books       enable row level security;
alter table reading_sessions  enable row level security;
alter table reading_goals     enable row level security;
alter table reviews           enable row level security;
alter table quotes            enable row level security;
alter table notes             enable row level security;
alter table learnings         enable row level security;
alter table activities        enable row level security;
alter table tabs              enable row level security;

alter table profiles          force row level security;
alter table user_books        force row level security;
alter table notes             force row level security;
alter table quotes            force row level security;
alter table learnings         force row level security;
alter table reading_sessions  force row level security;
alter table activities        force row level security;
alter table tabs              force row level security;

-- ------------------------------------------------------------------ profiles

create policy "profiles: read own"
  on profiles for select
  using (id = auth.uid());

create policy "profiles: read public"
  on profiles for select
  using (profile_visibility = 'public');

create policy "profiles: update own"
  on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Insert is handled by the handle_new_user trigger (security definer).
-- No client-side insert policy exists, so a client cannot forge a profile.

-- --------------------------------------------------------------------- books
-- Catalogue rows (owner_id is null) are readable by any signed-in user but
-- writable by nobody through the client; user-owned rows are fully private.

create policy "books: read own or catalogue"
  on books for select
  using (owner_id = auth.uid() or owner_id is null);

create policy "books: insert own"
  on books for insert
  with check (owner_id = auth.uid());

create policy "books: update own"
  on books for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "books: delete own"
  on books for delete
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------- user_books

create policy "user_books: own rows"
  on user_books for select
  using (user_id = auth.uid());

create policy "user_books: insert own"
  on user_books for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from books b
      where b.id = book_id and (b.owner_id = auth.uid() or b.owner_id is null)
    )
  );

create policy "user_books: update own"
  on user_books for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "user_books: delete own"
  on user_books for delete
  using (user_id = auth.uid());

-- -------------------------------------------------------------------- shelves

create policy "shelves: own rows"
  on shelves for select using (user_id = auth.uid());
create policy "shelves: insert own"
  on shelves for insert with check (user_id = auth.uid());
create policy "shelves: update own"
  on shelves for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "shelves: delete own"
  on shelves for delete using (user_id = auth.uid());

create policy "shelf_books: own rows"
  on shelf_books for select using (user_id = auth.uid());

-- The shelf must also belong to the caller, or a user could file their book
-- onto someone else's shelf.
create policy "shelf_books: insert own"
  on shelf_books for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from shelves s where s.id = shelf_id and s.user_id = auth.uid())
  );

create policy "shelf_books: delete own"
  on shelf_books for delete using (user_id = auth.uid());

-- ------------------------------------------------------------ reading_sessions

create policy "reading_sessions: own rows"
  on reading_sessions for select using (user_id = auth.uid());
create policy "reading_sessions: insert own"
  on reading_sessions for insert with check (user_id = auth.uid());
create policy "reading_sessions: update own"
  on reading_sessions for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reading_sessions: delete own"
  on reading_sessions for delete using (user_id = auth.uid());

-- --------------------------------------------------------------- reading_goals

create policy "reading_goals: own rows"
  on reading_goals for select using (user_id = auth.uid());
create policy "reading_goals: insert own"
  on reading_goals for insert with check (user_id = auth.uid());
create policy "reading_goals: update own"
  on reading_goals for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reading_goals: delete own"
  on reading_goals for delete using (user_id = auth.uid());

-- -------------------------------------------------------------------- reviews
-- The only user content with an opt-in public path, and only when the author
-- set visibility = 'public' themselves.

create policy "reviews: read own"
  on reviews for select using (user_id = auth.uid());

create policy "reviews: read public"
  on reviews for select using (visibility = 'public');

create policy "reviews: insert own"
  on reviews for insert with check (user_id = auth.uid());
create policy "reviews: update own"
  on reviews for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reviews: delete own"
  on reviews for delete using (user_id = auth.uid());

-- --------------------------------------------------------------------- quotes
-- Private, with no public path.

create policy "quotes: own rows"
  on quotes for select using (user_id = auth.uid());
create policy "quotes: insert own"
  on quotes for insert with check (user_id = auth.uid());
create policy "quotes: update own"
  on quotes for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "quotes: delete own"
  on quotes for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------- notes
-- Private, with no public path.

create policy "notes: own rows"
  on notes for select using (user_id = auth.uid());
create policy "notes: insert own"
  on notes for insert with check (user_id = auth.uid());
create policy "notes: update own"
  on notes for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notes: delete own"
  on notes for delete using (user_id = auth.uid());

-- ------------------------------------------------------------------ learnings

create policy "learnings: own rows"
  on learnings for select using (user_id = auth.uid());
create policy "learnings: insert own"
  on learnings for insert with check (user_id = auth.uid());
create policy "learnings: update own"
  on learnings for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "learnings: delete own"
  on learnings for delete using (user_id = auth.uid());

-- ----------------------------------------------------------------- activities

create policy "activities: own rows"
  on activities for select using (user_id = auth.uid());
create policy "activities: insert own"
  on activities for insert with check (user_id = auth.uid());
create policy "activities: delete own"
  on activities for delete using (user_id = auth.uid());

-- ----------------------------------------------------------------------- tabs

create policy "tabs: own rows"
  on tabs for select using (user_id = auth.uid());
create policy "tabs: insert own"
  on tabs for insert with check (user_id = auth.uid());
create policy "tabs: update own"
  on tabs for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "tabs: delete own"
  on tabs for delete using (user_id = auth.uid());

-- ------------------------------------------------------------------- grants
-- RLS is the authorization boundary; these grants only make the tables
-- reachable at all. anon gets nothing beyond the explicitly public policies.

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on profiles, reviews to anon;
