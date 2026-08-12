import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="font-mono text-[13px] uppercase tracking-widest text-text-faint">
        404
      </p>
      <h1 className="max-w-md text-balance font-serif text-2xl tracking-tight">
        This page isn't on the shelf.
      </h1>
      <p className="max-w-sm text-balance text-sm text-text-muted">
        The link may be out of date, or the thing it pointed to was removed.
      </p>
      <div className="flex gap-2">
        <Button asChild variant="primary">
          <Link to="/dashboard">Go home</Link>
        </Button>
        <Button asChild>
          <Link to="/library">Open library</Link>
        </Button>
      </div>
    </div>
  )
}
