import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  title: string
  description?: string
  /** Hides the visible heading but keeps it for screen readers. */
  hideTitle?: boolean
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
}

export function DialogContent({
  title,
  description,
  hideTitle,
  footer,
  size = 'md',
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="animate-in-fade fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={cn(
          'animate-in-pop fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-lg)]',
          SIZES[size],
          className,
        )}
        {...props}
      >
        <div
          className={cn(
            'flex items-start justify-between gap-4 px-6 pt-5',
            hideTitle && 'sr-only',
          )}
        >
          <div className="space-y-1">
            <DialogPrimitive.Title className="text-[17px] font-semibold tracking-tight text-text">
              {title}
            </DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="text-sm text-text-muted">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-text-faint transition-colors hover:bg-surface-hover hover:text-text"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-border bg-bg-subtle px-6 py-3.5">
            {footer}
          </div>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
