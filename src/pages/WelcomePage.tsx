import { BookOpen, Check } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/primitives'
import { Field, Input } from '@/components/ui/field'
import { toast } from '@/components/ui/toast'
import * as repo from '@/data/repository'
import { seedDemoData, seedFirstShelves } from '@/data/seed'
import { useSession } from '@/stores/session'
import { cn, nowIso } from '@/lib/utils'

const GENRES = [
  'Psychology',
  'Business',
  'Productivity',
  'Philosophy',
  'Fiction',
  'Science',
  'History',
  'Economics',
  'Biography',
  'Design',
  'Technology',
  'Health',
]

export function WelcomePage() {
  const profile = useSession((s) => s.profile)
  const status = useSession((s) => s.status)
  const updateProfile = useSession((s) => s.updateProfile)
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [genres, setGenres] = useState<string[]>([])
  const [goal, setGoal] = useState('24')
  const [withDemo, setWithDemo] = useState(false)
  const [busy, setBusy] = useState(false)

  if (status === 'anonymous') return <Navigate to="/sign-in" replace />
  if (!profile) return null
  if (profile.onboardedAt) return <Navigate to="/dashboard" replace />

  const toggleGenre = (genre: string) =>
    setGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
    )

  const finish = async () => {
    setBusy(true)
    try {
      const target = Number.parseInt(goal, 10)
      if (withDemo) {
        await seedDemoData(profile.id)
      } else {
        await seedFirstShelves(profile.id)
      }
      if (Number.isFinite(target) && target > 0) {
        await repo.setGoal(profile.id, 'year', 'books', target)
      }
      await updateProfile({ favoriteGenres: genres, onboardedAt: nowIso() })
      navigate('/dashboard', { replace: true })
    } catch (caught) {
      toast.error(
        'Setup could not finish',
        caught instanceof Error ? caught.message : undefined,
      )
    } finally {
      setBusy(false)
    }
  }

  const steps = [
    {
      title: 'What do you like to read?',
      description: 'Pick a few subjects. This shapes your shelves and statistics.',
      body: (
        <div className="flex flex-wrap gap-2">
          {GENRES.map((genre) => {
            const selected = genres.includes(genre)
            return (
              <button
                key={genre}
                type="button"
                onClick={() => toggleGenre(genre)}
                aria-pressed={selected}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors',
                  selected
                    ? 'border-accent bg-accent-subtle text-accent'
                    : 'border-border text-text-muted hover:border-border-strong hover:text-text',
                )}
              >
                {selected && <Check className="size-3" />}
                {genre}
              </button>
            )
          })}
        </div>
      ),
    },
    {
      title: 'Set a reading goal',
      description: 'How many books do you want to finish this year? You can change it any time.',
      body: (
        <div className="max-w-40">
          <Field label="Books this year">
            {(props) => (
              <Input
                {...props}
                type="number"
                min={1}
                max={999}
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
              />
            )}
          </Field>
        </div>
      ),
    },
    {
      title: 'Start with a library',
      description: 'Begin empty, or load a small sample library you can edit or delete.',
      body: (
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              value: false,
              title: 'Start empty',
              copy: 'Add your first book yourself.',
            },
            {
              value: true,
              title: 'Load sample books',
              copy: 'Five books with notes, quotes, a review and reading history.',
            },
          ].map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => setWithDemo(option.value)}
              aria-pressed={withDemo === option.value}
              className={cn(
                'rounded-xl border p-4 text-left transition-colors',
                withDemo === option.value
                  ? 'border-accent bg-accent-subtle/40'
                  : 'border-border hover:border-border-strong',
              )}
            >
              <p className="text-sm font-medium text-text">{option.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
                {option.copy}
              </p>
            </button>
          ))}
        </div>
      ),
    },
  ]

  const current = steps[step]
  const isLast = step === steps.length - 1

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg-subtle p-6">
      <Card className="w-full max-w-2xl p-8 shadow-[var(--shadow-md)]">
        <div className="mb-8 flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-fg">
            <BookOpen className="size-4" />
          </span>
          <span className="font-serif text-[17px] tracking-tight">BookSpace</span>
          <span className="ml-auto text-xs text-text-faint">
            Step {step + 1} of {steps.length}
          </span>
        </div>

        <h1 className="font-serif text-2xl tracking-tight">{current.title}</h1>
        <p className="mt-1.5 text-sm text-text-muted">{current.description}</p>

        <div className="my-7">{current.body}</div>

        <div className="flex items-center justify-between border-t border-border pt-5">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0 || busy}
          >
            Back
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => (isLast ? void finish() : setStep((s) => s + 1))}
          >
            {isLast ? (busy ? 'Setting up…' : 'Open BookSpace') : 'Continue'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
