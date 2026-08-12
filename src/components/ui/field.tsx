import type { ComponentProps, ReactNode } from 'react'
import { useId } from 'react'
import { cn } from '@/lib/utils'

const controlBase =
  'w-full rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-text-faint transition-colors duration-150 hover:border-border-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)] disabled:cursor-not-allowed disabled:opacity-60'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(controlBase, 'h-9', className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(controlBase, 'min-h-24 resize-y py-2 leading-relaxed', className)}
      {...props}
    />
  )
}

export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(controlBase, 'h-9 cursor-pointer appearance-none pr-8', className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
      }}
      {...props}
    />
  )
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      className={cn('text-[13px] font-medium text-text-muted', className)}
      {...props}
    />
  )
}

interface FieldProps {
  label: string
  hint?: string
  error?: string | null
  required?: boolean
  className?: string
  children: (props: { id: string; 'aria-describedby'?: string }) => ReactNode
}

/** Label + control + hint/error, wired together with matching ids. */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: FieldProps) {
  const id = useId()
  const descriptionId = hint || error ? `${id}-description` : undefined
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </Label>
      {children({ id, 'aria-describedby': descriptionId })}
      {(hint || error) && (
        <p
          id={descriptionId}
          className={cn('text-xs', error ? 'text-danger' : 'text-text-faint')}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  )
}
