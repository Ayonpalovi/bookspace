import { Download, Monitor, Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { Card, SectionHeading } from '@/components/ui/primitives'
import { toast } from '@/components/ui/toast'
import { useTab } from '@/hooks/useTab'
import * as auth from '@/data/auth'
import * as repo from '@/data/repository'
import { seedDemoData } from '@/data/seed'
import { useSession } from '@/stores/session'
import { bump } from '@/stores/data'
import { useTabs } from '@/stores/tabs'
import { ACCENTS, useThemeStore, type AccentName, type ThemeMode } from '@/stores/theme'
import { cn } from '@/lib/utils'

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function SettingsPage() {
  useTab({ title: 'Settings', kind: 'page', icon: 'settings' })
  const profile = useSession((s) => s.profile)!
  const updateProfile = useSession((s) => s.updateProfile)
  const signOut = useSession((s) => s.signOut)
  const resetTabs = useTabs((s) => s.reset)
  const navigate = useNavigate()

  const mode = useThemeStore((s) => s.mode)
  const setMode = useThemeStore((s) => s.setMode)
  const accent = useThemeStore((s) => s.accent)
  const setAccent = useThemeStore((s) => s.setAccent)

  const [displayName, setDisplayName] = useState(profile.displayName)
  const [bio, setBio] = useState(profile.bio ?? '')
  const [savingProfile, setSavingProfile] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [savingPassword, setSavingPassword] = useState(false)

  const saveProfile = async () => {
    setSavingProfile(true)
    try {
      await updateProfile({ displayName: displayName.trim(), bio: bio.trim() || null })
      toast.success('Profile updated')
    } catch {
      toast.error('Could not save your profile')
    } finally {
      setSavingProfile(false)
    }
  }

  const changePassword = async () => {
    setSavingPassword(true)
    setPasswordError(null)
    try {
      await auth.changePassword(
        profile.id,
        profile.email,
        currentPassword,
        nextPassword,
      )
      setCurrentPassword('')
      setNextPassword('')
      toast.success('Password changed')
    } catch (caught) {
      setPasswordError(
        caught instanceof Error ? caught.message : 'Could not change your password.',
      )
    } finally {
      setSavingPassword(false)
    }
  }

  const exportLibrary = async () => {
    const entries = await repo.listLibrary(profile.id)
    const header = [
      'Title',
      'Subtitle',
      'Authors',
      'ISBN',
      'Publisher',
      'Published',
      'Pages',
      'Status',
      'Rating',
      'Current page',
      'Date added',
      'Date started',
      'Date finished',
      'Genres',
    ]
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const rows = entries.map((entry) =>
      [
        entry.book.title,
        entry.book.subtitle,
        entry.book.authors.join('; '),
        entry.book.isbn,
        entry.book.publisher,
        entry.book.publishedDate,
        entry.book.pageCount,
        entry.userBook.status,
        entry.userBook.rating,
        entry.userBook.currentPage,
        entry.userBook.dateAdded,
        entry.userBook.dateStarted,
        entry.userBook.dateFinished,
        entry.book.genres.join('; '),
      ]
        .map(escape)
        .join(','),
    )
    const csv = [header.join(','), ...rows].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `bookspace-library-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('Library exported')
  }

  const exportNotes = async () => {
    const [notes, entries] = await Promise.all([
      repo.listNotes(profile.id),
      repo.listLibrary(profile.id),
    ])
    const bookById = new Map(entries.map((e) => [e.book.id, e.book]))
    const markdown = notes
      .map((note) => {
        const book = note.bookId ? bookById.get(note.bookId) : null
        const meta = [
          book ? `Source: ${book.title}` : null,
          note.chapter ? `Chapter: ${note.chapter}` : null,
          note.tags.length ? `Tags: ${note.tags.map((t) => `#${t}`).join(' ')}` : null,
        ]
          .filter(Boolean)
          .join(' · ')
        return `# ${note.title || 'Untitled note'}\n\n${meta ? `_${meta}_\n\n` : ''}${note.body}\n`
      })
      .join('\n---\n\n')
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `bookspace-notes-${new Date().toISOString().slice(0, 10)}.md`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('Notes exported')
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-7 font-serif text-[26px] leading-tight tracking-tight">
        Settings
      </h1>

      <Card className="mb-5 p-5">
        <SectionHeading title="Account" description="How you appear in BookSpace." />
        <div className="space-y-4">
          <Field label="Name">
            {(props) => (
              <Input
                {...props}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            )}
          </Field>
          <Field label="Email" hint="Changing your email is not supported yet.">
            {(props) => <Input {...props} value={profile.email} readOnly disabled />}
          </Field>
          <Field label="Bio">
            {(props) => (
              <Textarea
                {...props}
                rows={3}
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                placeholder="A line about what you read and why."
              />
            )}
          </Field>
          <div className="flex justify-end">
            <Button variant="primary" onClick={saveProfile} disabled={savingProfile}>
              {savingProfile ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="mb-5 p-5">
        <SectionHeading title="Password" />
        <div className="space-y-4">
          <Field label="Current password">
            {(props) => (
              <Input
                {...props}
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            )}
          </Field>
          <Field label="New password" hint="At least 8 characters" error={passwordError}>
            {(props) => (
              <Input
                {...props}
                type="password"
                autoComplete="new-password"
                value={nextPassword}
                onChange={(event) => setNextPassword(event.target.value)}
              />
            )}
          </Field>
          <div className="flex justify-end">
            <Button
              onClick={changePassword}
              disabled={savingPassword || !currentPassword || !nextPassword}
            >
              {savingPassword ? 'Updating…' : 'Change password'}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="mb-5 p-5">
        <SectionHeading
          title="Appearance"
          description="Theme and accent apply across the app."
        />
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-[13px] font-medium text-text-muted">Theme</p>
            <div className="flex flex-wrap gap-2">
              {THEME_OPTIONS.map((option) => {
                const Icon = option.icon
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={mode === option.value}
                    onClick={() => setMode(option.value)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors',
                      mode === option.value
                        ? 'border-accent bg-accent-subtle text-accent'
                        : 'border-border text-text-muted hover:border-border-strong hover:text-text',
                    )}
                  >
                    <Icon className="size-4" />
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[13px] font-medium text-text-muted">Accent</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ACCENTS) as AccentName[]).map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={accent === name}
                  aria-label={ACCENTS[name].label}
                  onClick={() => setAccent(name)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors',
                    accent === name
                      ? 'border-accent text-text'
                      : 'border-border text-text-muted hover:border-border-strong',
                  )}
                >
                  <span
                    aria-hidden
                    className="size-3.5 rounded-full border border-black/10"
                    style={{ background: ACCENTS[name].light.accent }}
                  />
                  {ACCENTS[name].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="mb-5 p-5">
        <SectionHeading
          title="Your data"
          description="Everything is stored on this device. Export it any time."
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportLibrary}>
            <Download /> Export library (CSV)
          </Button>
          <Button onClick={exportNotes}>
            <Download /> Export notes (Markdown)
          </Button>
          <Button
            onClick={async () => {
              await seedDemoData(profile.id)
              bump('library', 'notes', 'quotes', 'activity', 'shelves', 'goals')
              toast.success('Sample library loaded')
            }}
          >
            Load sample library
          </Button>
        </div>
        <p className="mt-3 text-xs text-text-faint">
          Sample data is only added once per account.
        </p>
      </Card>

      <Card className="border-danger/30 p-5">
        <SectionHeading
          title="Sign out"
          description="Your data stays on this device and will be here when you return."
        />
        <Button
          variant="danger-ghost"
          onClick={() => {
            resetTabs()
            signOut()
            navigate('/sign-in', { replace: true })
          }}
        >
          Sign out
        </Button>
      </Card>
    </div>
  )
}
