-- ============================================================================
-- BookSpace — Phase 1 schema
--
-- Covers profiles, books, the user↔book relationship, shelves, reading
-- sessions, goals, reviews, quotes, notes, the "What I learned" record,
-- activity and tabs.
--
-- Phase 2 tables (spaces, space_objects, space_members, space_comments,
-- files, templates) are intentionally NOT created here — they arrive with the
-- infinite canvas so their shape can be driven by the real canvas data model.
--
-- Every table is user-scoped and every one gets RLS in 0002.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enum types

create type reading_status as enum ('want_to_read', 'reading', 'finished', 'dnf');
create type visibility as enum ('private', 'team', 'public');
create type note_kind as enum ('quick', 'book', 'chapter', 'lesson', 'research', 'reflection');
create type goal_period as enum ('year', 'month');
create type goal_metric as enum ('books', 'pages');
create type tab_kind as enum ('book', 'note', 'page');
create type activity_kind as enum (
  'book_added',
  'book_started',
  'book_finished',
  'book_dnf',
  'progress_updated',
  'note_created',
  'quote_saved',
  'review_written',
  'shelf_created',
  'goal_set',
  'space_created',
  'space_edited',
  'file_uploaded'
);

-- ------------------------------------------------------------------ profiles

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (username ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  email text not null,
  bio text check (length(bio) <= 500),
  avatar_url text,
  favorite_genres text[] not null default '{}',
  profile_visibility visibility not null default 'private',
  review_visibility visibility not null default 'private',
  show_reading_activity boolean not null default true,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table profiles is
  'One row per auth user. Created by the handle_new_user trigger on signup.';

-- --------------------------------------------------------------------- books
-- owner_id null means a shared catalogue row (reserved for a future book API
-- import). Phase 1 always writes owner_id = the creating user.

create table books (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 500),
  subtitle text,
  authors text[] not null default '{}',
  cover_url text,
  description text,
  isbn text,
  publisher text,
  published_date date,
  page_count integer check (page_count is null or page_count > 0),
  language text,
  genres text[] not null default '{}',
  average_rating numeric(3, 2) check (average_rating is null or average_rating between 0 and 5),
  external_source text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index books_owner_idx on books (owner_id);
create index books_title_search_idx on books using gin (to_tsvector('simple', title));
create unique index books_external_idx
  on books (external_source, external_id)
  where external_source is not null and owner_id is null;

-- ---------------------------------------------------------------- user_books

create table user_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  book_id uuid not null references books (id) on delete cascade,
  status reading_status not null default 'want_to_read',
  rating smallint check (rating is null or rating between 1 and 5),
  current_page integer not null default 0 check (current_page >= 0),
  is_favorite boolean not null default false,
  tags text[] not null default '{}',
  date_added timestamptz not null default now(),
  date_started timestamptz,
  date_finished timestamptz,
  last_opened_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, book_id)
);

create index user_books_user_status_idx on user_books (user_id, status);
create index user_books_last_opened_idx on user_books (user_id, last_opened_at desc nulls last);

-- -------------------------------------------------------------------- shelves

create table shelves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  slug text not null,
  description text,
  color text,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

-- Expression uniqueness has to be an index, not a table constraint.
create unique index shelves_user_name_idx on shelves (user_id, lower(name));

create table shelf_books (
  shelf_id uuid not null references shelves (id) on delete cascade,
  book_id uuid not null references books (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (shelf_id, book_id)
);

create index shelf_books_user_idx on shelf_books (user_id);
create index shelf_books_book_idx on shelf_books (book_id);

-- ----------------------------------------------------------- reading_sessions
-- The append-only progress log. Streaks and pages-read statistics are derived
-- from this table rather than from user_books.current_page.

create table reading_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  book_id uuid not null references books (id) on delete cascade,
  from_page integer not null check (from_page >= 0),
  to_page integer not null check (to_page >= 0),
  pages_read integer not null check (pages_read >= 0),
  note text,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index reading_sessions_user_read_at_idx on reading_sessions (user_id, read_at desc);
create index reading_sessions_book_idx on reading_sessions (book_id);

-- -------------------------------------------------------------- reading_goals

create table reading_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  period goal_period not null,
  metric goal_metric not null,
  -- 'YYYY' for yearly goals, 'YYYY-MM' for monthly ones.
  period_key text not null check (period_key ~ '^\d{4}(-\d{2})?$'),
  target integer not null check (target > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period, metric, period_key)
);

-- ------------------------------------------------------------------- reviews

create table reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  book_id uuid not null references books (id) on delete cascade,
  rating smallint not null check (rating between 0 and 5),
  title text,
  body text not null default '',
  contains_spoilers boolean not null default false,
  pros text[] not null default '{}',
  cons text[] not null default '{}',
  favorite_quote text,
  recommended boolean,
  visibility visibility not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, book_id)
);

create index reviews_public_idx on reviews (book_id) where visibility = 'public';

-- -------------------------------------------------------------------- quotes

create table quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  book_id uuid references books (id) on delete set null,
  text text not null check (length(trim(text)) > 0),
  page integer check (page is null or page >= 0),
  chapter text,
  comment text,
  tags text[] not null default '{}',
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quotes_user_created_idx on quotes (user_id, created_at desc);
create index quotes_book_idx on quotes (book_id);
create index quotes_tags_idx on quotes using gin (tags);

-- --------------------------------------------------------------------- notes

create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  book_id uuid references books (id) on delete set null,
  kind note_kind not null default 'quick',
  title text not null default '',
  body text not null default '',
  chapter text,
  tags text[] not null default '{}',
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_user_updated_idx on notes (user_id, updated_at desc);
create index notes_book_idx on notes (book_id);
create index notes_tags_idx on notes using gin (tags);
create index notes_search_idx
  on notes using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, '')));

-- ----------------------------------------------------------------- learnings
-- The "What I Learned" record: one per user per book.

create table learnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  book_id uuid not null references books (id) on delete cascade,
  biggest_lessons text not null default '',
  ideas_worth_remembering text not null default '',
  disagreements text not null default '',
  changed_thinking text not null default '',
  how_to_apply text not null default '',
  favorite_ideas text not null default '',
  one_sentence_summary text not null default '',
  score_usefulness smallint check (score_usefulness is null or score_usefulness between 1 and 5),
  score_writing smallint check (score_writing is null or score_writing between 1 and 5),
  score_originality smallint check (score_originality is null or score_originality between 1 and 5),
  score_applicability smallint check (score_applicability is null or score_applicability between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, book_id)
);

-- ---------------------------------------------------------------- activities

create table activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  kind activity_kind not null,
  book_id uuid references books (id) on delete cascade,
  note_id uuid references notes (id) on delete cascade,
  quote_id uuid references quotes (id) on delete cascade,
  -- Pre-rendered so the feed never needs N+1 lookups.
  summary text not null,
  created_at timestamptz not null default now()
);

create index activities_user_created_idx on activities (user_id, created_at desc);

-- ---------------------------------------------------------------------- tabs

create table tabs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  kind tab_kind not null,
  path text not null,
  title text not null,
  icon text,
  entity_id uuid,
  is_pinned boolean not null default false,
  position integer not null default 0,
  opened_at timestamptz not null default now(),
  unique (user_id, path)
);

create index tabs_user_position_idx on tabs (user_id, position);

-- ------------------------------------------------------------------ triggers

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'books', 'user_books', 'reading_goals',
    'reviews', 'quotes', 'notes', 'learnings'
  ]
  loop
    execute format(
      'create trigger %1$s_set_updated_at before update on %1$s
         for each row execute function set_updated_at()',
      t
    );
  end loop;
end;
$$;

-- Create the profile row when someone signs up. `security definer` is required
-- because the new user has no rows yet and therefore cannot pass RLS.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  candidate text;
  suffix integer := 1;
begin
  base_username := regexp_replace(
    lower(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))),
    '[^a-z0-9]+', '-', 'g'
  );
  base_username := trim(both '-' from base_username);
  if length(base_username) < 2 then
    base_username := 'reader';
  end if;

  candidate := base_username;
  while exists (select 1 from profiles where username = candidate) loop
    suffix := suffix + 1;
    candidate := base_username || '-' || suffix;
  end loop;

  insert into profiles (id, username, display_name, email)
  values (
    new.id,
    candidate,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
