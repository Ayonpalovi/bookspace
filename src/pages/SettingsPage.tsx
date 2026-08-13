import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  Upload,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { Card, ProgressBar, SectionHeading } from '@/components/ui/primitives'
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
import {
  downloadBackup,
  formatBytes,
  getStorageStatus,
  requestPersistentStorage,
  restoreBackup,
  type StorageStatus,
} from '@/lib/backup'

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

  const [storage, setStorage] = useState<StorageStatus | null>(null)
  const [requestingPersist, setRequestingPersist] = useState(false)
  const [exportingBackup, setExportingBackup] = useState(false)
  const [restoringBackup, setRestoringBackup] = useState(false)
  const restoreInputRef = useRef<HTMLInputElement>(null)

  const refreshStorage = () => {
    void getStorageStatus().then(setStorage)
  }
  useEffect(refreshStorage, [])

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

  const enablePersistence = async () => {
    setRequestingPersist(true)
    try {
      const granted = await requestPersistentStorage()
      refreshStorage()
      if (granted) toast.success('Persistent storage enabled')
      else
        toast.error(
          'The browser declined',
          'This is decided automatically from how often you use the site — visiting again over the next few days usually earns it. A backup is the reliable fallback either way.',
        )
    } finally {
      setRequestingPersist(false)
    }
  }

  const runBackupDownload = async () => {
    setExportingBackup(true)
    try {
      await downloadBackup()
      toast.success('Backup downloaded')
    } catch (caught) {
      toast.error(
        'Could not create the backup',
        caught instanceof Error ? caught.message : undefined,
      )
    } finally {
      setExportingBackup(false)
    }
  }

  const runBackupRestore = async (file: File) => {
    setRestoringBackup(true)
    try {
      const { records } = await restoreBackup(file)
      bump('library', 'notes', 'quotes', 'activity', 'shelves', 'goals', 'spaces', 'templates', 'files')
      toast.success(
        'Backup restored',
        `${records} records merged in. Reload if anything looks stale.`,
      )
    } catch (caught) {
      toast.error(
        'Could not restore that backup',
        caught instanceof Error ? caught.message : undefined,
      )
    } finally {
      setRestoringBackup(false)
    }
  }

  const usagePercent =
    storage?.usageBytes != null && storage.quotaBytes
      ? Math.min(100, Math.round((storage.usageBytes / storage.quotaBytes) * 100))
      : null

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
              try {
                await seedDemoData(profile.id)
                bump('library', 'notes', 'quotes', 'activity', 'shelves', 'goals')
                toast.success('Sample library loaded')
              } catch (caught) {
                toast.error(
                  'Could not load the sample library',
                  caught instanceof Error ? caught.message : undefined,
                )
              }
            }}
          >
            Load sample library
          </Button>
        </div>
        <p className="mt-3 text-xs text-text-faint">
          Sample data is only added once per account.
        </p>
      </Card>

      <Card className="mb-5 p-5">
        <SectionHeading
          title="Storage & backup"
          description="Everything lives in this browser, on this device — there is no server copy."
        />

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface-sunken p-3">
            <div className="flex items-start gap-2.5">
              {storage?.persisted ? (
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-text">
                  {storage?.persisted
                    ? 'Storage is protected from automatic eviction'
                    : storage?.supported
                      ? 'Storage is not protected yet'
                      : 'This browser cannot report storage status'}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-text-muted">
                  {storage?.persisted
                    ? 'The browser has agreed not to clear this site’s data under disk pressure without asking.'
                    : 'The browser may clear this data under disk pressure without warning. A backup is the only guarantee.'}
                </p>
                {usagePercent != null && (
                  <div className="mt-2.5">
                    <ProgressBar value={usagePercent} size="sm" label="Storage used" />
                    <p className="mt-1 text-[11px] text-text-faint">
                      {formatBytes(storage!.usageBytes)} of {formatBytes(storage!.quotaBytes)}{' '}
                      used
                    </p>
                  </div>
                )}
                {storage?.supported && !storage.persisted && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-2.5"
                    onClick={enablePersistence}
                    disabled={requestingPersist}
                  >
                    {requestingPersist ? 'Requesting…' : 'Request persistent storage'}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={runBackupDownload} disabled={exportingBackup}>
              <Download /> {exportingBackup ? 'Preparing…' : 'Download full backup'}
            </Button>
            <Button
              onClick={() => restoreInputRef.current?.click()}
              disabled={restoringBackup}
            >
              <Upload /> {restoringBackup ? 'Restoring…' : 'Restore from backup'}
            </Button>
            <input
              ref={restoreInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void runBackupRestore(file)
              }}
            />
          </div>
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-text-faint">
            <CheckCircle2 className="mt-px size-3 shrink-0" />
            The backup file includes your password hash so sign-in still works after
            a restore — it is not plaintext, but treat the file like any other
            local backup that can log in as you, and keep it somewhere private.
            Restoring only adds or updates records; it never deletes anything.
          </p>
        </div>
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
