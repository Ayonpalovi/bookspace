# BookSpace

A personal reading, knowledge and (eventually) infinite-canvas workspace.

**Reading side (Phase 1) is complete**: authentication, the app shell with a
Chrome-like tab system, the library, book detail, reading progress, notes,
quotes, reviews, the "What I Learned" record, reading goals, statistics and
activity.

**Workspace side (Spaces) is built**: an infinite canvas with pan/zoom, text,
sticky notes, shapes, frames, connectors that follow their objects, freehand
drawing, tables, images, file cards with real PDF previews, link cards, and live
book / note / quote cards that read through to the reading side. Plus multi-page
Spaces, templates, a file library, presentation mode, focus mode, minimap,
snapping, grouping, layers, undo/redo and autosave.

**Not built: real-time collaboration, sharing links, roles/permissions and
team spaces.** These need a server that enforces access; they cannot be done
honestly in a browser-only build. There is no disabled "Share" button pretending
otherwise — see *What Spaces cannot do yet* below.

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

## Spaces — how the canvas works

`src/stores/canvas.ts` is the engine: objects, selection, viewport, history and
autosave. `src/components/canvas/CanvasStage.tsx` is the interaction surface —
one pointer-event state machine covering pan, marquee, lasso, move, resize,
rotate, draw and connector-drag.

**Object model.** Every object is one row with a `type` plus free-form `content`
and `style` bags. Adding an object type means adding a renderer in
`ObjectView.tsx`, not a new table or a branch through the engine.

**Connectors are relationships, not lines.** Each stores endpoint *ids* plus a
typed `relationship` (causes, leads to, contradicts, …) and an optional label —
never coordinates. Geometry is resolved from the live objects on every render,
so a connector follows the boxes it joins through moves, resizes and rotations.

Because the payload is structured, the same edges are queryable as data:
`listConnections()` in `src/data/spaces.ts` returns typed edges, and
`canvas_connections` in migration 0004 is a Postgres view over the same rows.
That is the foundation a knowledge graph, backlinks or relationship search will
read from — there is no second system to keep in sync.

Drag from the round handles that appear outside a selected object, or use the
connector tool (C). Endpoints snap to the nearest connection point on whatever
you hover, including frames. Parking two objects side by side offers a
"Connect these" chip — an offer only; nothing is ever linked automatically.

**Undo** batches a whole drag into one step: `beginInteraction()` snapshots on
pointer-down, `endInteraction()` pushes it only if something actually changed.

**Autosave** debounces to 700 ms and writes the page's objects, then flushes
synchronously on page switch and unmount. Status shows Saving / Saved / Changes
not synced.

**Performance.** Objects are culled to the viewport before rendering, and
`ObjectView` is memoized on identity, so dragging one object does not re-render
the rest.

## What Spaces cannot do yet

Deliberately absent rather than faked:

- **Real-time collaboration, cursors, comments, mentions, reactions, share
  links, roles.** All of it requires a server as the authority. Building a
  browser-only version would be a demo, not a feature.
- **DOCX / PPTX previews.** These need a server-side converter. Those files
  upload, store, list and download intact; the viewer says why there is no
  preview instead of showing a fake one.
- **Link card titles.** Pasting a URL makes a real link card, but the browser
  cannot fetch cross-origin metadata, so the card shows the URL and host rather
  than a scraped title.
- **Space thumbnails** are placeholders; the column exists and is populated by
  nothing yet.
- **PNG/PDF export.** JSON export of a page works; raster export does not.

## Originality

Built from scratch. No logos, branding, illustrations, source code, screens or
copy from any other reading or whiteboard product.
