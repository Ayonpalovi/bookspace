import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2, Star } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn, clamp, hashIndex, initials } from '@/lib/utils'

/* --------------------------------------------------------------------- card */

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border border-border bg-surface',
        className,
      )}
      {...props}
    />
  )
}

export function SectionHeading({
  title,
  action,
  description,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-4 flex items-end justify-between gap-4', className)}>
      <div className="space-y-0.5">
        <h2 className="text-[15px] font-semibold tracking-tight text-text">{title}</h2>
        {description && <p className="text-[13px] text-text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/* -------------------------------------------------------------------- badge */

const badge = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-surface-sunken text-text-muted',
        accent: 'border-transparent bg-accent-subtle text-accent',
        success: 'border-transparent bg-[color-mix(in_oklab,var(--success)_16%,transparent)] text-success',
        warning: 'border-transparent bg-[color-mix(in_oklab,var(--warning)_18%,transparent)] text-warning',
        danger: 'border-transparent bg-danger-subtle text-danger',
        outline: 'border-border-strong bg-transparent text-text-muted',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export function Badge({
  className,
  tone,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...props} />
}

/* ----------------------------------------------------------------- progress */

export function ProgressBar({
  value,
  className,
  tone = 'accent',
  size = 'md',
  label,
}: {
  value: number
  className?: string
  tone?: 'accent' | 'success'
  size?: 'sm' | 'md'
  label?: string
}) {
  const percent = clamp(Math.round(value), 0, 100)
  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn(
        'w-full overflow-hidden rounded-full bg-surface-sunken',
        size === 'sm' ? 'h-1' : 'h-1.5',
        className,
      )}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-soft)]',
          tone === 'success' ? 'bg-success' : 'bg-accent',
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------- rating */

export function StarRating({
  value,
  onChange,
  size = 16,
  className,
  label = 'Rating',
}: {
  value: number | null
  onChange?: (value: number | null) => void
  size?: number
  className?: string
  label?: string
}) {
  const readOnly = !onChange
  const rounded = value ?? 0
  return (
    <div
      className={cn('inline-flex items-center gap-0.5', className)}
      role={readOnly ? 'img' : 'radiogroup'}
      aria-label={readOnly ? `${label}: ${value ?? 'not rated'} out of 5` : label}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= rounded
        const icon = (
          <Star
            style={{ width: size, height: size }}
            className={cn(
              'transition-colors',
              filled ? 'fill-warning text-warning' : 'text-border-strong',
            )}
          />
        )
        if (readOnly) return <span key={star}>{icon}</span>
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star > 1 ? 's' : ''}`}
            onClick={() => onChange(value === star ? null : star)}
            className="rounded p-0.5 transition-transform hover:scale-110"
          >
            {icon}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ avatar */

const AVATAR_TONES = [
  'bg-[oklch(88%_0.06_250)] text-[oklch(35%_0.1_250)]',
  'bg-[oklch(88%_0.06_155)] text-[oklch(35%_0.1_155)]',
  'bg-[oklch(89%_0.07_65)] text-[oklch(38%_0.1_65)]',
  'bg-[oklch(88%_0.06_20)] text-[oklch(36%_0.1_20)]',
  'bg-[oklch(88%_0.06_320)] text-[oklch(36%_0.1_320)]',
]

export function Avatar({
  name,
  src,
  size = 32,
  className,
}: {
  name: string
  src?: string | null
  size?: number
  className?: string
}) {
  const tone = AVATAR_TONES[hashIndex(name, AVATAR_TONES.length)]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold',
        tone,
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  )
}

/* -------------------------------------------------------------- empty state */

export function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
}: {
  icon?: ReactNode
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-border px-6 py-16 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-surface-sunken text-text-faint [&_svg]:size-5">
          {icon}
        </div>
      )}
      <h3 className="font-serif text-lg tracking-tight text-text">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-balance text-sm leading-relaxed text-text-muted">
          {description}
        </p>
      )}
      {actions && <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ loading */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-text-faint', className)} />
}

export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-text-muted">
      <Spinner />
      <span>{label}…</span>
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-surface-sunken', className)}
      aria-hidden
    />
  )
}

/* --------------------------------------------------------- segmented control */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  label,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; icon?: ReactNode }[]
  className?: string
  label?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-sunken p-0.5',
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[13px] font-medium transition-colors [&_svg]:size-3.5',
            value === option.value
              ? 'bg-surface text-text shadow-[var(--shadow-sm)]'
              : 'text-text-muted hover:text-text',
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------------- misc */

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-surface-sunken px-1 py-px font-sans text-[10px] font-medium text-text-faint">
      {children}
    </kbd>
  )
}

export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string
  value: ReactNode
  hint?: string
  className?: string
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-text-faint">
        {label}
      </p>
      <p className="font-serif text-2xl leading-none tracking-tight text-text">{value}</p>
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  )
}
