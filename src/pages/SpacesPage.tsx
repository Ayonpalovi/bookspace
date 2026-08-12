import {
  BookOpen,
  Copy,
  LayoutDashboard,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Input, NativeSelect } from '@/components/ui/field'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu'
import { Badge, EmptyState, PageLoader } from '@/components/ui/primitives'
import { toast } from '@/components/ui/toast'
import { useAsync } from '@/hooks/useAsync'
import { useTab } from '@/hooks/useTab'
import * as spaceRepo from '@/data/spaces'
import * as repo from '@/data/repository'
import { useSession } from '@/stores/session'
import { bump, useVersion } from '@/stores/data'
import { SPACE_KIND_LABEL, type Space, type SpaceKind } from '@/types/canvas'
import { cn, relativeTime } from '@/lib/utils'

/** Starting page sets per Space type — the only difference between them. */
const KIND_PAGES: Partial<Record<SpaceKind, string[]>> = {
  blank: ['Canvas'],
  mind_map: ['Mind Map'],
  brainstorm: ['Ideas', 'Themes', 'Next steps'],
  research: ['Sources', 'Findings', 'Synthesis'],
  project: ['Backlog', 'In progress', 'Done'],
  vision: ['Vision board'],
  study: ['Notes', 'Diagrams', 'Questions'],
  meeting: ['Agenda', 'Notes', 'Actions'],
  kanban: ['Board'],
}

const CREATABLE: SpaceKind[] = [
  'blank',
  'mind_map',
  'brainstorm',
  'research',
  'project',
  'study',
  'meeting',
  'kanban',
  'vision',
]

function SpaceThumb({ space }: { space: Space }) {
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-border bg-bg-subtle">
      {space.thumbnail ? (
        <img
          src={space.thumbnail}
          alt=""
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        <div
          className="flex size-full items-center justify-center"
          style={{
            backgroundImage:
              'radial-gradient(circle, var(--border-strong) 1px, transparent 1px)',
            backgroundSize: '14px 14px',
          }}
        >
          <LayoutDashboard className="size-6 text-text-faint opacity-60" />
        </div>
      )}
      {space.isFavorite && (
        <span className="absolute right-2 top-2 rounded-full bg-black/45 p-1 text-white backdrop-blur-sm">
          <Star className="size-3 fill-current" />
        </span>
      )}
    </div>
  )
}

export function SpacesPage() {
  useTab({ title: 'Spaces', kind: 'page', icon: 'space' })
  const profile = useSession((s) => s.profile)!
  const navigate = useNavigate()
  const spacesVersion = useVersion('spaces')

  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const { data, loading, reload } = useAsync(
    async () => {
      const spaces = await spaceRepo.listSpaces(profile.id)
      const pageCounts = new Map<string, number>()
      for (const space of spaces) {
        pageCounts.set(space.id, (await spaceRepo.listPages(profile.id, space.id)).length)
      }
      return { spaces, pageCounts }
    },
    [profile.id, spacesVersion],
  )

  const spaces = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return data?.spaces ?? []
    return (data?.spaces ?? []).filter((space) =>
      `${space.name} ${SPACE_KIND_LABEL[space.kind]}`.toLowerCase().includes(q),
    )
  }, [data, query])

  const act = async (label: string, action: () => Promise<unknown>) => {
    try {
      await action()
      bump('spaces')
      reload()
    } catch (caught) {
      toast.error(label, caught instanceof Error ? caught.message : undefined)
    }
  }

  if (loading && !data) return <PageLoader label="Loading your Spaces" />

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-7">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-[26px] leading-tight tracking-tight">Spaces</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            Infinite canvases for thinking, mapping and planning.
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <Plus /> New Space
        </Button>
      </div>

      {(data?.spaces.length ?? 0) > 0 && (
        <div className="relative mb-5 max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-faint" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter Spaces"
            className="pl-8"
            aria-label="Filter Spaces"
          />
        </div>
      )}

      {spaces.length === 0 ? (
        <EmptyState
          icon={<LayoutDashboard />}
          title={data?.spaces.length ? 'Nothing matches that' : 'Nothing here yet.'}
          description={
            data?.spaces.length
              ? 'Try a different search term.'
              : 'Create a blank Space, or open a book and build its Knowledge Space.'
          }
          actions={
            <>
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus /> New Space
              </Button>
              <Button asChild>
                <Link to="/library">Browse your library</Link>
              </Button>
            </>
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {spaces.map((space) => (
            <div key={space.id} className="group">
              <Link to={`/spaces/${space.id}`} className="block">
                <SpaceThumb space={space} />
              </Link>
              <div className="mt-2.5 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/spaces/${space.id}`}
                    className="block truncate text-[13px] font-medium text-text hover:text-accent"
                  >
                    {space.name}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-faint">
                    <span>{data?.pageCounts.get(space.id) ?? 1} pages</span>
                    <span>·</span>
                    <span>Edited {relativeTime(space.updatedAt)}</span>
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Badge>{SPACE_KIND_LABEL[space.kind]}</Badge>
                    {space.bookId && (
                      <Badge tone="accent">
                        <BookOpen className="size-2.5" /> Book
                      </Badge>
                    )}
                    <Badge tone="outline">Private</Badge>
                  </div>
                </div>

                <Menu>
                  <MenuTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Actions for ${space.name}`}
                      className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <MoreHorizontal />
                    </Button>
                  </MenuTrigger>
                  <MenuContent align="end" className="w-52">
                    <MenuItem onSelect={() => navigate(`/spaces/${space.id}`)}>
                      Open
                    </MenuItem>
                    <MenuItem
                      onSelect={async () => {
                        const name = window.prompt('Rename Space', space.name)
                        if (!name) return
                        await act('Could not rename', () =>
                          spaceRepo.updateSpace(profile.id, space.id, { name }),
                        )
                      }}
                    >
                      <Pencil /> Rename
                    </MenuItem>
                    <MenuItem
                      onSelect={() =>
                        act('Could not duplicate', () =>
                          spaceRepo.duplicateSpace(profile.id, space.id),
                        )
                      }
                    >
                      <Copy /> Duplicate
                    </MenuItem>
                    <MenuItem
                      onSelect={() =>
                        act('Could not update', () =>
                          spaceRepo.updateSpace(profile.id, space.id, {
                            isFavorite: !space.isFavorite,
                          }),
                        )
                      }
                    >
                      <Star /> {space.isFavorite ? 'Remove favorite' : 'Favorite'}
                    </MenuItem>
                    {space.bookId && (
                      <>
                        <MenuSeparator />
                        <MenuItem onSelect={() => navigate(`/books/${space.bookId}`)}>
                          <BookOpen /> Open the book
                        </MenuItem>
                      </>
                    )}
                    <MenuSeparator />
                    <MenuItem
                      destructive
                      onSelect={() =>
                        act('Could not delete', async () => {
                          await spaceRepo.deleteSpace(profile.id, space.id)
                          toast.success(`Deleted ${space.name}`)
                        })
                      }
                    >
                      <Trash2 /> Delete
                    </MenuItem>
                  </MenuContent>
                </Menu>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateSpaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

/* ------------------------------------------------------------------ create */

function CreateSpaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const profile = useSession((s) => s.profile)!
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<SpaceKind>('blank')
  const [bookId, setBookId] = useState('')
  const [busy, setBusy] = useState(false)

  const { data } = useAsync(
    async () => repo.listLibrary(profile.id),
    [profile.id, open],
  )

  const create = async () => {
    setBusy(true)
    try {
      if (bookId) {
        const { space } = await spaceRepo.createBookSpace(profile.id, bookId)
        bump('spaces', 'activity')
        onOpenChange(false)
        navigate(`/spaces/${space.id}`)
        return
      }
      const { space } = await spaceRepo.createSpace(profile.id, {
        name: name || SPACE_KIND_LABEL[kind],
        kind,
        pages: KIND_PAGES[kind] ?? ['Canvas'],
      })
      await repo.logActivity(profile.id, 'space_created', `Created the Space ${space.name}`)
      bump('spaces', 'activity')
      onOpenChange(false)
      setName('')
      navigate(`/spaces/${space.id}`)
    } catch (caught) {
      toast.error(
        'Could not create the Space',
        caught instanceof Error ? caught.message : undefined,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New Space"
        description="Pick a starting structure. You can change everything inside it afterwards."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={create} disabled={busy}>
              {busy ? 'Creating…' : 'Create Space'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" hint="Leave blank to use the type name">
            {(props) => (
              <Input
                {...props}
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Business Ideas"
                disabled={Boolean(bookId)}
              />
            )}
          </Field>

          <div>
            <p className="mb-2 text-[13px] font-medium text-text-muted">Type</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {CREATABLE.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={kind === value && !bookId}
                  disabled={Boolean(bookId)}
                  onClick={() => setKind(value)}
                  className={cn(
                    'rounded-lg border p-2.5 text-left text-[12px] transition-colors disabled:opacity-40',
                    kind === value && !bookId
                      ? 'border-accent bg-accent-subtle text-accent'
                      : 'border-border text-text-muted hover:border-border-strong hover:text-text',
                  )}
                >
                  {SPACE_KIND_LABEL[value]}
                  {KIND_PAGES[value] && KIND_PAGES[value]!.length > 1 && (
                    <span className="mt-0.5 block text-[10px] text-text-faint">
                      {KIND_PAGES[value]!.length} pages
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <Field
            label="Or build a book's Knowledge Space"
            hint="Creates pages and frames scaffolded around the book"
          >
            {(props) => (
              <NativeSelect
                {...props}
                value={bookId}
                onChange={(event) => setBookId(event.target.value)}
              >
                <option value="">Not from a book</option>
                {(data ?? []).map((entry) => (
                  <option key={entry.book.id} value={entry.book.id}>
                    {entry.book.title}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  )
}
