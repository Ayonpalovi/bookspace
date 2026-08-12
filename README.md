# BookSpace

A personal reading, knowledge and (eventually) infinite-canvas workspace.

**Phase 1 is complete**: authentication, the app shell with a Chrome-like tab
system, the library, book detail, reading progress, notes, quotes, reviews, the
"What I Learned" record, reading goals, statistics and activity.

Phases 2–6 (Spaces / infinite canvas, collaboration, templates, knowledge graph,
social, AI) are **not** built. Nothing in the UI pretends they are.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:5173, create an account, and pick "Load sample books"
in onboarding if you want a populated library to look at.

```bash
npm run build      # typecheck + production build
npm run lint       # oxlint
```

## Storage — read this first

Your spec named Supabase, which needs an account under your login. So Phase 1
ships against a **local IndexedDB adapter** instead, and the Supabase schema is
written and waiting.

- `src/data/db.ts` — a small promise wrapper over IndexedDB. Stores are keyed
  and indexed exactly like the Postgres tables.
- `src/data/repository.ts` — **the only thing the UI talks to.** Every function
  takes an explicit `userId` and filters by it, which is the same contract the
  RLS policies enforce server-side.
- `src/data/auth.ts` — local auth. Passwords are stored as PBKDF2-SHA256 hashes
  (210k iterations, per-user random salt), never in plaintext. The API shape
  mirrors Supabase Auth (`signUp` / `signIn` / `signOut` / `getSessionProfile`).
- `supabase/migrations/` — the real PostgreSQL schema and RLS policies.

Because no page or component imports IndexedDB directly, moving to Supabase is a
change to `repository.ts` and `auth.ts` only.

### Moving to Supabase

1. Create a project at supabase.com.
2. Run `supabase/migrations/0001_phase1_schema.sql`, then
   `0002_phase1_rls.sql`, in the SQL editor.
3. Put the project URL and **anon** key in `.env` as `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`. The service-role key must never reach the client.
4. Write `src/data/supabaseRepository.ts` implementing the same functions
   `repository.ts` exports, and switch the import.

The SQL has not been executed anywhere — it is written against the schema this
app actually uses, but it is untested until you run it.

## Security posture

The migrations deny by default: RLS is on for every table, `force row level
security` is set on all the private ones, and each write policy carries a
`with check` pinning `user_id` to `auth.uid()` so a client cannot write a row
into someone else's account.

Notes, quotes, learnings, reading sessions, activity and tabs have **no public
read path at all** — not a disabled one, none. Only profiles and reviews can opt
into visibility, through their own column.

The local auth adapter is appropriate for single-device use. It is not a
server-side auth provider: anything in the browser is readable by anyone with
access to the machine.

## Architecture

```
src/
  components/
    ui/          Button, Field, Dialog, Menu, primitives, Toaster
    layout/      AppLayout, Sidebar, TabBar, SearchDialog
    books/       BookCover, BookCard, AddBookDialog, ProgressControl
    notes/       NoteCard
    quotes/      QuoteCard, QuoteDialog
    charts/      ColumnChart, RankedBars, ActivityStrip
  data/          db, auth, repository, seed
  hooks/         useAsync, useTab
  lib/           utils, markdown
  pages/         one file per route
  stores/        session, tabs, theme, data (cache invalidation)
  types/         the domain model, mirroring the SQL 1:1
```

**Tabs.** `stores/tabs.ts` holds the strip; pages register themselves with
`useTab({ title, kind, icon })`. Tabs persist per user through the repository
and are restored on reload. Drag to reorder, right-click for the context menu
(close / close others / close to the right / duplicate / pin / reopen closed),
middle-click to close.

**Data freshness.** `stores/data.ts` is a coarse invalidation signal: mutations
call `bump('library')` and any mounted page with that key in its `useAsync` deps
refetches. Deliberately coarse — it is the seam where per-query caching goes
later, without touching call sites.

**Progress.** `reading_sessions` is an append-only log of page deltas. Streaks
and pages-read statistics derive from it, not from `current_page`, so the
numbers survive edits and corrections.

**Theming.** Tokens live in `src/index.css` as CSS custom properties with a
light and dark set; `stores/theme.ts` writes the chosen accent onto `:root` at
runtime. Six accents, light/dark/system, painted before first render so there is
no flash.

## Keyboard

| Shortcut | Action |
| --- | --- |
| `⌘K` / `Ctrl+K` | Search books, notes and quotes |
| `⌘⇧N` | New note |
| `⌘\` | Collapse / expand the sidebar |
| `Esc` | Close a dialog |

## What Phase 2 needs

Spaces (the infinite canvas) is the next pillar. It needs its own tables —
`spaces`, `space_objects`, `space_members`, `space_comments`, `files`,
`templates` — which are deliberately *not* in migration 0001, so the canvas data
model can drive their shape rather than the other way round. The `tabs.kind`
enum and the sidebar already leave room for them.

## Originality

Built from scratch. No logos, branding, illustrations, source code, screens or
copy from any other reading or whiteboard product.
