-- ============================================================================
-- BookSpace — Spaces (infinite canvas)
--
-- Adds the workspace half of the product: spaces, pages, canvas objects,
-- templates and files. Everything is user-scoped in this migration.
--
-- Sharing and collaboration tables (space_members, space_comments,
-- space_reactions, space_share_links, notifications) are deliberately NOT here.
-- They only mean something with a live backend enforcing them, and shipping
-- empty tables would imply a feature that does not exist yet.
-- ============================================================================

create type space_kind as enum (
  'blank', 'book_map', 'mind_map', 'brainstorm', 'research',
  'project', 'vision', 'study', 'meeting', 'kanban'
);

create type space_object_type as enum (
  'text', 'sticky', 'shape', 'frame', 'connector', 'drawing',
  'image', 'file', 'link', 'table',
  'book_card', 'note_card', 'quote_card'
);

create table spaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 200),
  kind space_kind not null default 'blank',
  book_id uuid references books (id) on delete set null,
  description text,
  is_favorite boolean not null default false,
  thumbnail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index spaces_user_updated_idx on spaces (user_id, updated_at desc);
-- One Knowledge Space per book per user.
create unique index spaces_user_book_idx
  on spaces (user_id, book_id)
  where book_id is not null;

create table space_pages (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  name text not null default 'Canvas',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index space_pages_space_idx on space_pages (space_id, position);

create table space_objects (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces (id) on delete cascade,
  page_id uuid not null references space_pages (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  type space_object_type not null,
  x double precision not null default 0,
  y double precision not null default 0,
  width double precision not null default 0,
  height double precision not null default 0,
  rotation double precision not null default 0,
  z_index integer not null default 0,
  locked boolean not null default false,
  hidden boolean not null default false,
  group_id text,
  parent_frame_id uuid references space_objects (id) on delete set null,
  -- Type-specific payload. Kept as jsonb so a new object type needs a renderer,
  -- not a migration.
  content jsonb not null default '{}'::jsonb,
  style jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index space_objects_page_idx on space_objects (page_id, z_index);
create index space_objects_space_idx on space_objects (space_id);
create index space_objects_content_idx on space_objects using gin (content);

create table files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  space_id uuid references spaces (id) on delete set null,
  name text not null,
  mime_type text not null,
  size bigint not null check (size >= 0),
  -- Path inside the private Supabase Storage bucket; bytes never live in the row.
  storage_path text not null,
  preview_url text,
  page_count integer,
  created_at timestamptz not null default now()
);

create index files_user_idx on files (user_id, created_at desc);
create index files_space_idx on files (space_id);

create table space_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  category text not null default 'Custom',
  description text,
  thumbnail text,
  is_favorite boolean not null default false,
  -- Objects normalized so the selection's top-left sits at the origin.
  objects jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index space_templates_user_idx on space_templates (user_id, created_at desc);

do $$
declare
  t text;
begin
  foreach t in array array['spaces', 'space_pages', 'space_objects']
  loop
    execute format(
      'create trigger %1$s_set_updated_at before update on %1$s
         for each row execute function set_updated_at()',
      t
    );
  end loop;
end;
$$;

-- ----------------------------------------------------------------------- RLS

alter table spaces           enable row level security;
alter table space_pages      enable row level security;
alter table space_objects    enable row level security;
alter table files            enable row level security;
alter table space_templates  enable row level security;

alter table spaces           force row level security;
alter table space_pages      force row level security;
alter table space_objects    force row level security;
alter table files            force row level security;
alter table space_templates  force row level security;

create policy "spaces: own rows" on spaces for select using (user_id = auth.uid());
create policy "spaces: insert own" on spaces for insert with check (user_id = auth.uid());
create policy "spaces: update own" on spaces for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "spaces: delete own" on spaces for delete using (user_id = auth.uid());

-- Pages and objects check ownership of the parent Space as well as their own
-- user_id, so a forged space_id cannot smuggle a row into someone else's board.
create policy "space_pages: own rows" on space_pages for select using (user_id = auth.uid());
create policy "space_pages: insert own" on space_pages for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from spaces s where s.id = space_id and s.user_id = auth.uid())
  );
create policy "space_pages: update own" on space_pages for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "space_pages: delete own" on space_pages for delete using (user_id = auth.uid());

create policy "space_objects: own rows" on space_objects for select using (user_id = auth.uid());
create policy "space_objects: insert own" on space_objects for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from space_pages p where p.id = page_id and p.user_id = auth.uid())
  );
create policy "space_objects: update own" on space_objects for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "space_objects: delete own" on space_objects for delete using (user_id = auth.uid());

create policy "files: own rows" on files for select using (user_id = auth.uid());
create policy "files: insert own" on files for insert with check (user_id = auth.uid());
create policy "files: update own" on files for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "files: delete own" on files for delete using (user_id = auth.uid());

create policy "space_templates: own rows" on space_templates for select using (user_id = auth.uid());
create policy "space_templates: insert own" on space_templates for insert
  with check (user_id = auth.uid());
create policy "space_templates: update own" on space_templates for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "space_templates: delete own" on space_templates for delete
  using (user_id = auth.uid());

grant select, insert, update, delete on
  spaces, space_pages, space_objects, files, space_templates
  to authenticated;
