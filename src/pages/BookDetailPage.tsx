import * as TabsPrimitive from '@radix-ui/react-tabs'
import {
  BookMarked,
  BookOpen,
  CircleSlash,
  Heart,
  LayoutDashboard,
  MoreHorizontal,
  Pencil,
  Plus,
  Quote as QuoteIcon,
  Sparkles,
  Tag,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BookCover } from '@/components/books/BookCover'
import { ProgressControl } from '@/components/books/ProgressControl'
import { NoteCard } from '@/components/notes/NoteCard'
import { QuoteCard } from '@/components/quotes/QuoteCard'
import { QuoteDialog } from '@/components/quotes/QuoteDialog'
import { AddToSpaceButton } from '@/components/canvas/AddToSpaceDialog'
import { Button } from '@/components/ui/button'
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/field'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu'
import {
  Badge,
  Card,
  EmptyState,
  PageLoader,
  SectionHeading,
  StarRating,
} from '@/components/ui/primitives'
import { toast } from '@/components/ui/toast'
import { useAsync } from '@/hooks/useAsync'
import { useTab } from '@/hooks/useTab'
import * as repo from '@/data/repository'
import * as spaceRepo from '@/data/spaces'
import { bump, useVersion } from '@/stores/data'
import { useSession } from '@/stores/session'
import { useTabs } from '@/stores/tabs'
import {
  STATUS_LABEL,
  type LibraryEntry,
  type Learning,
  type ReadingStatus,
  type Review,
  type Visibility,
} from '@/types'
import { cn, debounce, formatDate, relativeTime } from '@/lib/utils'

const STATUS_ICON = {
  want_to_read: BookMarked,
  reading: BookOpen,
  finished: Sparkles,
  dnf: CircleSlash,
}

const TAB_LIST = [
  { value: 'overview', label: 'Overview' },
  { value: 'notes', label: 'Notes' },
  { value: 'quotes', label: 'Quotes' },
  { value: 'lessons', label: 'What I Learned' },
  { value: 'review', label: 'Review' },
  { value: 'activity', label: 'Activity' },
]

export function BookDetailPage() {
  const { bookId = '' } = useParams()
  const profile = useSession((s) => s.profile)!
  const navigate = useNavigate()
  const renameTab = useTabs((s) => s.rename)
  const libraryVersion = useVersion('library')
  const notesVersion = useVersion('notes')
  const quotesVersion = useVersion('quotes')
  const shelvesVersion = useVersion('shelves')

  const [tab, setTab] = useState('overview')
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const { data, loading, error, reload } = useAsync(
    async () => {
      const entry = await repo.getLibraryEntry(profile.id, bookId)
      if (!entry) return null
      const [notes, quotes, review, learning, shelves, sessions, activity, knowledgeSpace] =
        await Promise.all([
          repo.listNotes(profile.id, bookId),
          repo.listQuotes(profile.id, bookId),
          repo.getReview(profile.id, bookId),
          repo.getLearning(profile.id, bookId),
          repo.listShelves(profile.id),
          repo.listSessions(profile.id, bookId),
          repo.listActivity(profile.id, 300),
          spaceRepo.getSpaceForBook(profile.id, bookId),
        ])
      return {
        entry,
        notes,
        quotes,
        review,
        learning,
        shelves,
        sessions,
        knowledgeSpace,
        activity: activity.filter((a) => a.bookId === bookId),
      }
    },
    [profile.id, bookId, libraryVersion, notesVersion, quotesVersion, shelvesVersion],
  )

  const title = data?.entry.book.title ?? null
  useTab({ title, kind: 'book', icon: 'book', entityId: bookId })

  useEffect(() => {
    if (title) renameTab(`/books/${bookId}`, title)
  }, [title, bookId, renameTab])

  useEffect(() => {
    if (data?.entry) void repo.touchBook(profile.id, bookId)
  }, [data?.entry, profile.id, bookId])

  if (loading && !data) return <PageLoader label="Opening book" />
  if (error) {
    return (
      <div className="p-8">
        <EmptyState
          title="This book could not be opened"
          description={error.message}
          actions={<Button onClick={reload}>Try again</Button>}
        />
      </div>
    )
  }
  if (!data) {
    return (
      <div className="p-8">
        <EmptyState
          title="Book not found"
          description="It may have been removed from your library."
          actions={
            <Button asChild variant="primary">
              <Link to="/library">Back to library</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const { entry, notes, quotes, review, learning, shelves, sessions, activity, knowledgeSpace } =
    data
  const { book, userBook, percent } = entry
  const StatusIcon = STATUS_ICON[userBook.status]

  const changeStatus = async (status: ReadingStatus) => {
    await repo.setStatus(profile.id, book.id, status)
    bump('library', 'activity')
    reload()
    toast.success(`Moved to ${STATUS_LABEL[status]}`)
  }

  const setRating = async (rating: number | null) => {
    await repo.setRating(profile.id, book.id, rating)
    bump('library')
    reload()
  }

  const toggleShelf = async (shelfId: string) => {
    const next = entry.shelfIds.includes(shelfId)
      ? entry.shelfIds.filter((id) => id !== shelfId)
      : [...entry.shelfIds, shelfId]
    await repo.setBookShelves(profile.id, book.id, next)
    bump('library')
    reload()
  }

  const removeBook = async () => {
    await repo.removeBookFromLibrary(profile.id, book.id)
    bump('library', 'notes', 'quotes', 'activity')
    toast.success(`Removed ${book.title}`)
    navigate('/library')
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* ------------------------------------------------------------ header */}
      <div className="flex flex-col gap-7 sm:flex-row">
        <div className="w-36 shrink-0 sm:w-44">
          <BookCover book={book} rounded="rounded-lg" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-serif text-[28px] leading-tight tracking-tight text-balance">
                {book.title}
              </h1>
              {book.subtitle && (
                <p className="mt-1 text-[15px] leading-snug text-text-muted">
                  {book.subtitle}
                </p>
              )}
              <p className="mt-2 text-sm text-text-muted">
                {book.authors.join(', ') || 'Unknown author'}
              </p>
            </div>

            <Menu>
              <MenuTrigger asChild>
                <Button size="icon" variant="ghost" aria-label="Book actions">
                  <MoreHorizontal />
                </Button>
              </MenuTrigger>
              <MenuContent align="end" className="w-56">
                <MenuItem onSelect={() => setEditOpen(true)}>
                  <Pencil /> Edit details
                </MenuItem>
                <MenuItem
                  onSelect={async () => {
                    await repo.toggleFavorite(profile.id, book.id)
                    bump('library')
                    reload()
                  }}
                >
                  <Heart /> {userBook.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                </MenuItem>
                <MenuSeparator />
                <MenuLabel>Shelves</MenuLabel>
                {shelves.length === 0 && (
                  <p className="px-2.5 py-1.5 text-[13px] text-text-faint">
                    No shelves yet
                  </p>
                )}
                {shelves.map((shelf) => (
                  <MenuCheckboxItem
                    key={shelf.id}
                    checked={entry.shelfIds.includes(shelf.id)}
                    onSelect={(event) => {
                      event.preventDefault()
                      void toggleShelf(shelf.id)
                    }}
                  >
                    {shelf.name}
                  </MenuCheckboxItem>
                ))}
                <MenuSeparator />
                <MenuItem destructive onSelect={removeBook}>
                  <Trash2 /> Remove from library
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Menu>
              <MenuTrigger asChild>
                <Button variant="secondary" size="sm">
                  <StatusIcon /> {STATUS_LABEL[userBook.status]}
                </Button>
              </MenuTrigger>
              <MenuContent className="w-52">
                <MenuItem onSelect={() => changeStatus('reading')}>
                  <BookOpen /> Start reading
                </MenuItem>
                <MenuItem onSelect={() => changeStatus('finished')}>
                  <Sparkles /> Mark finished
                </MenuItem>
                <MenuItem onSelect={() => changeStatus('want_to_read')}>
                  <BookMarked /> Want to read
                </MenuItem>
                <MenuItem onSelect={() => changeStatus('dnf')}>
                  <CircleSlash /> Did not finish
                </MenuItem>
              </MenuContent>
            </Menu>

            <Button
              size="sm"
              onClick={() =>
                navigate(`/notes/new?bookId=${book.id}`, {
                  state: { bookTitle: book.title },
                })
              }
            >
              <Plus /> Add note
            </Button>
            <Button size="sm" onClick={() => setQuoteOpen(true)}>
              <QuoteIcon /> Add quote
            </Button>
            <Button size="sm" onClick={() => setTab('review')}>
              <Pencil /> {review ? 'Edit review' : 'Write review'}
            </Button>
            <Button
              size="sm"
              variant={knowledgeSpace ? 'secondary' : 'primary'}
              onClick={async () => {
                if (knowledgeSpace) {
                  navigate(`/spaces/${knowledgeSpace.id}`)
                  return
                }
                try {
                  const { space } = await spaceRepo.createBookSpace(profile.id, book.id)
                  bump('spaces', 'activity')
                  toast.success('Knowledge Space created')
                  navigate(`/spaces/${space.id}`)
                } catch (caught) {
                  toast.error(
                    'Could not create the Space',
                    caught instanceof Error ? caught.message : undefined,
                  )
                }
              }}
            >
              <LayoutDashboard />
              {knowledgeSpace ? 'Open Knowledge Space' : 'Create Knowledge Space'}
            </Button>
            <AddToSpaceButton
              type="book_card"
              content={{ bookId: book.id }}
              label={book.title}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-faint">
                Your rating
              </p>
              <StarRating value={userBook.rating} onChange={setRating} />
            </div>
            {userBook.isFavorite && (
              <Badge tone="accent">
                <Heart className="size-3 fill-current" /> Favorite
              </Badge>
            )}
            {entry.shelfIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Tag className="size-3 text-text-faint" />
                {entry.shelfIds.map((id) => {
                  const shelf = shelves.find((s) => s.id === id)
                  return shelf ? <Badge key={id}>{shelf.name}</Badge> : null
                })}
              </div>
            )}
          </div>

          {(userBook.status === 'reading' || userBook.currentPage > 0) && (
            <Card className="mt-5 p-4">
              <ProgressControl
                book={book}
                userBook={userBook}
                onUpdated={() => reload()}
              />
            </Card>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------- tabs */}
      <TabsPrimitive.Root value={tab} onValueChange={setTab} className="mt-9">
        <TabsPrimitive.List className="flex gap-1 overflow-x-auto border-b border-border">
          {TAB_LIST.map((item) => (
            <TabsPrimitive.Trigger
              key={item.value}
              value={item.value}
              className={cn(
                'relative shrink-0 px-3 py-2 text-[13px] font-medium text-text-muted transition-colors hover:text-text',
                'data-[state=active]:text-text',
                'after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-accent',
              )}
            >
              {item.label}
              {item.value === 'notes' && notes.length > 0 && (
                <span className="ml-1.5 text-text-faint">{notes.length}</span>
              )}
              {item.value === 'quotes' && quotes.length > 0 && (
                <span className="ml-1.5 text-text-faint">{quotes.length}</span>
              )}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>

        <div className="pt-6">
          <TabsPrimitive.Content value="overview" className="animate-in-fade">
            <OverviewTab entry={entry} sessionCount={sessions.length} percent={percent} />
          </TabsPrimitive.Content>

          <TabsPrimitive.Content value="notes" className="animate-in-fade">
            {notes.length === 0 ? (
              <EmptyState
                title="No notes on this book yet"
                description="Capture a lesson, a chapter summary, or a thought you want to keep."
                actions={
                  <Button
                    variant="primary"
                    onClick={() => navigate(`/notes/new?bookId=${book.id}`)}
                  >
                    <Plus /> Write a note
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {notes.map((note) => (
                  <NoteCard key={note.id} note={note} book={book} />
                ))}
              </div>
            )}
          </TabsPrimitive.Content>

          <TabsPrimitive.Content value="quotes" className="animate-in-fade">
            {quotes.length === 0 ? (
              <EmptyState
                icon={<QuoteIcon />}
                title="No quotes saved yet"
                description="Save the passages you want to come back to."
                actions={
                  <Button variant="primary" onClick={() => setQuoteOpen(true)}>
                    <Plus /> Save a quote
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {quotes.map((quote) => (
                  <QuoteCard
                    key={quote.id}
                    quote={quote}
                    book={book}
                    showSource={false}
                    onDelete={async () => {
                      await repo.deleteQuote(profile.id, quote.id)
                      bump('quotes')
                      reload()
                    }}
                  />
                ))}
              </div>
            )}
          </TabsPrimitive.Content>

          <TabsPrimitive.Content value="lessons" className="animate-in-fade">
            <LearningTab bookId={book.id} learning={learning} onSaved={reload} />
          </TabsPrimitive.Content>

          <TabsPrimitive.Content value="review" className="animate-in-fade">
            <ReviewTab bookId={book.id} review={review} onSaved={reload} />
          </TabsPrimitive.Content>

          <TabsPrimitive.Content value="activity" className="animate-in-fade">
            {activity.length === 0 ? (
              <EmptyState
                title="No activity yet"
                description="Reading progress and changes to this book will show up here."
              />
            ) : (
              <ol className="space-y-0">
                {activity.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-baseline gap-3 border-b border-border py-2.5 last:border-0"
                  >
                    <span className="flex-1 text-sm text-text">{item.summary}</span>
                    <span className="shrink-0 text-xs text-text-faint">
                      {relativeTime(item.createdAt)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </TabsPrimitive.Content>
        </div>
      </TabsPrimitive.Root>

      <QuoteDialog
        open={quoteOpen}
        onOpenChange={setQuoteOpen}
        bookId={book.id}
        onSaved={reload}
      />
      <EditBookDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        book={book}
        onSaved={reload}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ overview */

function OverviewTab({
  entry,
  sessionCount,
  percent,
}: {
  entry: LibraryEntry
  sessionCount: number
  percent: number
}) {
  const { book, userBook } = entry
  const details: [string, string][] = [
    ['Status', STATUS_LABEL[userBook.status]],
    ['Pages', book.pageCount ? String(book.pageCount) : '—'],
    ['Publisher', book.publisher ?? '—'],
    ['Published', book.publishedDate ? formatDate(book.publishedDate) : '—'],
    ['ISBN', book.isbn ?? '—'],
    ['Language', book.language ?? '—'],
    ['Added', formatDate(userBook.dateAdded)],
    ['Started', formatDate(userBook.dateStarted)],
    ['Finished', formatDate(userBook.dateFinished)],
    ['Progress', book.pageCount ? `${percent}% · page ${userBook.currentPage}` : '—'],
    ['Reading sessions', String(sessionCount)],
  ]

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_260px]">
      <div className="space-y-6">
        {book.description ? (
          <div>
            <SectionHeading title="About this book" />
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-text-muted">
              {book.description}
            </p>
          </div>
        ) : (
          <EmptyState
            title="No description yet"
            description="Add one from Edit details to give this book some context."
          />
        )}

        {book.genres.length > 0 && (
          <div>
            <SectionHeading title="Genres" />
            <div className="flex flex-wrap gap-1.5">
              {book.genres.map((genre) => (
                <Badge key={genre} tone="outline">
                  {genre}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      <Card className="h-fit divide-y divide-border">
        {details.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
            <span className="text-[13px] text-text-faint">{label}</span>
            <span className="text-right text-[13px] font-medium text-text">{value}</span>
          </div>
        ))}
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ learning */

const LEARNING_FIELDS: {
  key: keyof Pick<
    Learning,
    | 'biggestLessons'
    | 'ideasWorthRemembering'
    | 'disagreements'
    | 'changedThinking'
    | 'howToApply'
    | 'favoriteIdeas'
  >
  label: string
  prompt: string
}[] = [
  {
    key: 'biggestLessons',
    label: 'Biggest lessons',
    prompt: 'What are the most important things you learned?',
  },
  {
    key: 'ideasWorthRemembering',
    label: 'Ideas worth remembering',
    prompt: 'What should you still remember months or years from now?',
  },
  {
    key: 'disagreements',
    label: 'Things you disagree with',
    prompt: 'Which ideas do you push back on, and why?',
  },
  {
    key: 'changedThinking',
    label: 'How this changed your thinking',
    prompt: 'What do you now see differently?',
  },
  {
    key: 'howToApply',
    label: 'How you can apply it',
    prompt: 'What will you actually do?',
  },
  {
    key: 'favoriteIdeas',
    label: 'Favorite ideas',
    prompt: 'The concepts you found most interesting.',
  },
]

const SCORES: { key: keyof Learning; label: string }[] = [
  { key: 'scoreUsefulness', label: 'Usefulness' },
  { key: 'scoreWriting', label: 'Writing' },
  { key: 'scoreOriginality', label: 'Originality' },
  { key: 'scoreApplicability', label: 'Applicability' },
]

function LearningTab({
  bookId,
  learning,
  onSaved,
}: {
  bookId: string
  learning: Learning | null
  onSaved: () => void
}) {
  const profile = useSession((s) => s.profile)!
  const [draft, setDraft] = useState(() => ({
    biggestLessons: learning?.biggestLessons ?? '',
    ideasWorthRemembering: learning?.ideasWorthRemembering ?? '',
    disagreements: learning?.disagreements ?? '',
    changedThinking: learning?.changedThinking ?? '',
    howToApply: learning?.howToApply ?? '',
    favoriteIdeas: learning?.favoriteIdeas ?? '',
    oneSentenceSummary: learning?.oneSentenceSummary ?? '',
  }))
  const [scores, setScores] = useState({
    scoreUsefulness: learning?.scoreUsefulness ?? null,
    scoreWriting: learning?.scoreWriting ?? null,
    scoreOriginality: learning?.scoreOriginality ?? null,
    scoreApplicability: learning?.scoreApplicability ?? null,
  })
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  const persist = useMemo(
    () =>
      debounce(async (payload: Partial<Learning>) => {
        setSaveState('saving')
        try {
          await repo.upsertLearning(profile.id, bookId, payload)
          setSaveState('saved')
          onSaved()
        } catch {
          setSaveState('idle')
          toast.error('Your notes have not saved yet', 'We will keep trying.')
        }
      }, 700),
    [profile.id, bookId, onSaved],
  )

  const update = (key: string, value: string) => {
    const next = { ...draft, [key]: value }
    setDraft(next)
    persist({ ...next, ...scores })
  }

  const updateScore = (key: string, value: number | null) => {
    const next = { ...scores, [key]: value }
    setScores(next)
    persist({ ...draft, ...next })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-lg tracking-tight">What I learned</h2>
          <p className="text-[13px] text-text-muted">
            A structured record of what this book left you with. Saves as you type.
          </p>
        </div>
        <span className="text-xs text-text-faint">
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}
        </span>
      </div>

      <Card className="p-5">
        <Field label="One sentence summary" hint="The whole book, in a line.">
          {(props) => (
            <Input
              {...props}
              value={draft.oneSentenceSummary}
              onChange={(event) => update('oneSentenceSummary', event.target.value)}
              className="font-serif text-[15px]"
              placeholder="Small habits, repeated, compound into a different person."
            />
          )}
        </Field>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {LEARNING_FIELDS.map((field) => (
          <Card key={field.key} className="p-5">
            <Field label={field.label} hint={field.prompt}>
              {(props) => (
                <Textarea
                  {...props}
                  rows={4}
                  value={draft[field.key]}
                  onChange={(event) => update(field.key, event.target.value)}
                />
              )}
            </Field>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <SectionHeading
          title="Personal score"
          description="How this book rates on its own terms."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SCORES.map((score) => (
            <div key={String(score.key)} className="space-y-1.5">
              <p className="text-[13px] font-medium text-text-muted">{score.label}</p>
              <StarRating
                label={score.label}
                value={scores[score.key as keyof typeof scores]}
                onChange={(value) => updateScore(String(score.key), value)}
                size={15}
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

/* -------------------------------------------------------------------- review */

function ReviewTab({
  bookId,
  review,
  onSaved,
}: {
  bookId: string
  review: Review | null
  onSaved: () => void
}) {
  const profile = useSession((s) => s.profile)!
  const [rating, setRating] = useState(review?.rating ?? 0)
  const [title, setTitle] = useState(review?.title ?? '')
  const [body, setBody] = useState(review?.body ?? '')
  const [spoilers, setSpoilers] = useState(review?.containsSpoilers ?? false)
  const [pros, setPros] = useState(review?.pros.join('\n') ?? '')
  const [cons, setCons] = useState(review?.cons.join('\n') ?? '')
  const [favoriteQuote, setFavoriteQuote] = useState(review?.favoriteQuote ?? '')
  const [recommended, setRecommended] = useState<string>(
    review?.recommended == null ? '' : review.recommended ? 'yes' : 'no',
  )
  const [visibility, setVisibility] = useState<Visibility>(review?.visibility ?? 'private')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await repo.upsertReview(profile.id, bookId, {
        rating,
        title: title.trim() || null,
        body,
        containsSpoilers: spoilers,
        pros: pros.split('\n').map((p) => p.trim()).filter(Boolean),
        cons: cons.split('\n').map((c) => c.trim()).filter(Boolean),
        favoriteQuote: favoriteQuote.trim() || null,
        recommended: recommended === '' ? null : recommended === 'yes',
        visibility,
      })
      bump('activity')
      onSaved()
      toast.success('Review saved')
    } catch (caught) {
      toast.error(
        'Review not saved',
        caught instanceof Error ? caught.message : undefined,
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <Card className="space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-[13px] font-medium text-text-muted">Rating</p>
            <StarRating
              value={rating || null}
              onChange={(value) => setRating(value ?? 0)}
              size={20}
            />
          </div>
          {review && (
            <span className="text-xs text-text-faint">
              Last updated {relativeTime(review.updatedAt)}
            </span>
          )}
        </div>

        <Field label="Headline">
          {(props) => (
            <Input
              {...props}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="The system beats the goal"
            />
          )}
        </Field>

        <Field label="Your review">
          {(props) => (
            <Textarea
              {...props}
              rows={8}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="What worked, what didn't, and who should read it."
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pros" hint="One per line">
            {(props) => (
              <Textarea
                {...props}
                rows={3}
                value={pros}
                onChange={(event) => setPros(event.target.value)}
              />
            )}
          </Field>
          <Field label="Cons" hint="One per line">
            {(props) => (
              <Textarea
                {...props}
                rows={3}
                value={cons}
                onChange={(event) => setCons(event.target.value)}
              />
            )}
          </Field>
        </div>

        <Field label="Favorite quote">
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              value={favoriteQuote}
              onChange={(event) => setFavoriteQuote(event.target.value)}
              className="font-serif"
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Would you recommend it?">
            {(props) => (
              <NativeSelect
                {...props}
                value={recommended}
                onChange={(event) => setRecommended(event.target.value)}
              >
                <option value="">Not sure</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </NativeSelect>
            )}
          </Field>
          <Field
            label="Visibility"
            hint="Sharing arrives with the social features; for now every review stays private."
          >
            {(props) => (
              <NativeSelect
                {...props}
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as Visibility)}
                disabled
              >
                <option value="private">Private</option>
              </NativeSelect>
            )}
          </Field>
        </div>

        <label className="flex items-center gap-2 text-[13px] text-text-muted">
          <input
            type="checkbox"
            checked={spoilers}
            onChange={(event) => setSpoilers(event.target.checked)}
            className="size-4 rounded border-border accent-[var(--accent)]"
          />
          This review contains spoilers
        </label>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : review ? 'Update review' : 'Publish to your library'}
          </Button>
        </div>
      </Card>
    </div>
  )
}

/* ---------------------------------------------------------------- edit book */

function EditBookDialog({
  open,
  onOpenChange,
  book,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  book: LibraryEntry['book']
  onSaved: () => void
}) {
  const profile = useSession((s) => s.profile)!
  const [form, setForm] = useState({
    title: book.title,
    subtitle: book.subtitle ?? '',
    authors: book.authors.join(', '),
    pageCount: book.pageCount ? String(book.pageCount) : '',
    publisher: book.publisher ?? '',
    publishedDate: book.publishedDate ?? '',
    isbn: book.isbn ?? '',
    language: book.language ?? '',
    genres: book.genres.join(', '),
    coverUrl: book.coverUrl ?? '',
    description: book.description ?? '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm({
      title: book.title,
      subtitle: book.subtitle ?? '',
      authors: book.authors.join(', '),
      pageCount: book.pageCount ? String(book.pageCount) : '',
      publisher: book.publisher ?? '',
      publishedDate: book.publishedDate ?? '',
      isbn: book.isbn ?? '',
      language: book.language ?? '',
      genres: book.genres.join(', '),
      coverUrl: book.coverUrl ?? '',
      description: book.description ?? '',
    })
  }, [open, book])

  const save = async () => {
    setSaving(true)
    try {
      const pageCount = form.pageCount ? Number.parseInt(form.pageCount, 10) : null
      await repo.updateBook(profile.id, book.id, {
        title: form.title,
        subtitle: form.subtitle || null,
        authors: form.authors.split(',').map((a) => a.trim()).filter(Boolean),
        pageCount: Number.isFinite(pageCount) ? pageCount : null,
        publisher: form.publisher || null,
        publishedDate: form.publishedDate || null,
        isbn: form.isbn || null,
        language: form.language || null,
        genres: form.genres.split(',').map((g) => g.trim()).filter(Boolean),
        coverUrl: form.coverUrl || null,
        description: form.description || null,
      })
      bump('library')
      onSaved()
      onOpenChange(false)
      toast.success('Book updated')
    } catch (caught) {
      toast.error(
        'Could not save changes',
        caught instanceof Error ? caught.message : undefined,
      )
    } finally {
      setSaving(false)
    }
  }

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Edit book details"
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title" required>
            {(props) => (
              <Input
                {...props}
                value={form.title}
                onChange={(e) => set('title')(e.target.value)}
              />
            )}
          </Field>
          <Field label="Subtitle">
            {(props) => (
              <Input
                {...props}
                value={form.subtitle}
                onChange={(e) => set('subtitle')(e.target.value)}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Author(s)">
              {(props) => (
                <Input
                  {...props}
                  value={form.authors}
                  onChange={(e) => set('authors')(e.target.value)}
                />
              )}
            </Field>
            <Field label="Pages">
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  value={form.pageCount}
                  onChange={(e) => set('pageCount')(e.target.value)}
                />
              )}
            </Field>
            <Field label="Publisher">
              {(props) => (
                <Input
                  {...props}
                  value={form.publisher}
                  onChange={(e) => set('publisher')(e.target.value)}
                />
              )}
            </Field>
            <Field label="Publication date">
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={form.publishedDate}
                  onChange={(e) => set('publishedDate')(e.target.value)}
                />
              )}
            </Field>
            <Field label="ISBN">
              {(props) => (
                <Input
                  {...props}
                  value={form.isbn}
                  onChange={(e) => set('isbn')(e.target.value)}
                />
              )}
            </Field>
            <Field label="Language">
              {(props) => (
                <Input
                  {...props}
                  value={form.language}
                  onChange={(e) => set('language')(e.target.value)}
                />
              )}
            </Field>
          </div>
          <Field label="Genres" hint="Comma separated">
            {(props) => (
              <Input
                {...props}
                value={form.genres}
                onChange={(e) => set('genres')(e.target.value)}
              />
            )}
          </Field>
          <Field label="Cover image URL">
            {(props) => (
              <Input
                {...props}
                type="url"
                value={form.coverUrl}
                onChange={(e) => set('coverUrl')(e.target.value)}
              />
            )}
          </Field>
          <Field label="Description">
            {(props) => (
              <Textarea
                {...props}
                rows={5}
                value={form.description}
                onChange={(e) => set('description')(e.target.value)}
              />
            )}
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  )
}
