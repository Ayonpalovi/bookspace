import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { PageLoader } from '@/components/ui/primitives'
import { Logo } from '@/components/ui/Logo'
import { useSession } from '@/stores/session'

function AuthFrame({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="flex min-h-dvh">
      {/* Editorial panel — quiet, typographic, no stock imagery. */}
      <div className="hidden w-[46%] shrink-0 flex-col justify-between border-r border-border bg-bg-subtle p-12 lg:flex">
        <div className="flex items-center gap-2">
          <Logo size={26} />
          <span className="font-serif text-[17px] tracking-tight">BookSpace</span>
        </div>

        <div className="max-w-md space-y-6">
          <p className="font-serif text-[32px] leading-[1.2] tracking-tight text-balance">
            A library, a reading log and a place to think — in one workspace.
          </p>
          <p className="text-sm leading-relaxed text-text-muted">
            Track what you read, capture what you learn, and keep the notes,
            quotes and lessons attached to the book they came from.
          </p>
        </div>

        {/* On a public URL this has to be exact: there is no server yet, so an
            account lives in the browser it was made in. Saying "private to your
            account" alone would imply a backend that does not exist. */}
        <p className="max-w-md text-xs leading-relaxed text-text-faint">
          Everything you add is stored in this browser, on this device — not on a
          server. Nothing is uploaded, and nothing syncs between devices yet.
          Clearing your browser data clears your library.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 space-y-1.5">
            <h1 className="font-serif text-2xl tracking-tight">{title}</h1>
            <p className="text-sm text-text-muted">{subtitle}</p>
          </div>
          {children}
          <div className="mt-6 text-center text-[13px] text-text-muted">{footer}</div>
        </div>
      </div>
    </div>
  )
}

function useRedirectIfAuthenticated() {
  const status = useSession((s) => s.status)
  return status
}

export function SignInPage() {
  const status = useRedirectIfAuthenticated()
  const signIn = useSession((s) => s.signIn)
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (status === 'loading') return <PageLoader />
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password)
      navigate('/dashboard', { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign you in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthFrame
      title="Welcome back"
      subtitle="Sign in to pick up where you left off."
      footer={
        <>
          New here?{' '}
          <Link to="/sign-up" className="font-medium text-accent hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          {(props) => (
            <Input
              {...props}
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Field label="Password" error={error}>
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={busy}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthFrame>
  )
}

export function SignUpPage() {
  const status = useRedirectIfAuthenticated()
  const signUp = useSession((s) => s.signUp)
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (status === 'loading') return <PageLoader />
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signUp({ email, password, displayName })
      navigate('/welcome', { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create your account.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthFrame
      title="Create your BookSpace"
      subtitle="One account for your library, notes and quotes."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/sign-in" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          {(props) => (
            <Input
              {...props}
              autoFocus
              required
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ovi"
            />
          )}
        </Field>
        <Field label="Email">
          {(props) => (
            <Input
              {...props}
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Password"
          hint="At least 8 characters"
          error={error}
        >
          {(props) => (
            <Input
              {...props}
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={busy}
        >
          {busy ? 'Creating…' : 'Create account'}
        </Button>
      </form>
    </AuthFrame>
  )
}

/** Sends signed-out visitors to the right place without flashing the app shell. */
export function RootRedirect() {
  const status = useSession((s) => s.status)
  const profile = useSession((s) => s.profile)
  const restore = useSession((s) => s.restore)

  useEffect(() => {
    if (status === 'loading') void restore()
  }, [status, restore])

  if (status === 'loading') return <PageLoader label="Opening BookSpace" />
  if (status === 'anonymous') return <Navigate to="/sign-in" replace />
  return <Navigate to={profile?.onboardedAt ? '/dashboard' : '/welcome'} replace />
}
