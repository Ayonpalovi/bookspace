import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { useEffect } from 'react'
import { create } from 'zustand'
import { cn, uid } from '@/lib/utils'
import { Button } from './button'

type ToastTone = 'info' | 'success' | 'error'

interface Toast {
  id: string
  tone: ToastTone
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  /** Errors stay until dismissed; everything else auto-expires. */
  duration: number | null
}

interface ToastState {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id' | 'duration'> & { duration?: number | null }) => string
  dismiss: (id: string) => void
}

const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: ({ duration, ...toast }) => {
    const id = uid('tst')
    set((state) => ({
      toasts: [
        ...state.toasts,
        {
          ...toast,
          id,
          duration: duration === undefined ? (toast.tone === 'error' ? null : 4000) : duration,
        },
      ].slice(-4),
    }))
    return id
  },
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

export const toast = {
  info: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: 'info', title, description }),
  success: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: 'success', title, description }),
  error: (title: string, description?: string, action?: Toast['action']) =>
    useToastStore.getState().push({ tone: 'error', title, description, action }),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
}

const TONE_ICON = {
  info: Info,
  success: CheckCircle2,
  error: AlertTriangle,
}

const TONE_CLASS: Record<ToastTone, string> = {
  info: 'text-text-faint',
  success: 'text-success',
  error: 'text-danger',
}

function ToastRow({ item }: { item: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss)
  const Icon = TONE_ICON[item.tone]

  useEffect(() => {
    if (item.duration === null) return
    const timer = setTimeout(() => dismiss(item.id), item.duration)
    return () => clearTimeout(timer)
  }, [item.id, item.duration, dismiss])

  return (
    <div className="animate-in-pop pointer-events-auto flex w-80 items-start gap-3 rounded-xl border border-border bg-surface p-3 shadow-[var(--shadow-lg)]">
      <Icon className={cn('mt-0.5 size-4 shrink-0', TONE_CLASS[item.tone])} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium leading-snug text-text">{item.title}</p>
        {item.description && (
          <p className="text-[13px] leading-relaxed text-text-muted">{item.description}</p>
        )}
        {item.action && (
          <Button
            size="sm"
            variant="secondary"
            className="mt-1.5"
            onClick={() => {
              item.action?.onClick()
              dismiss(item.id)
            }}
          >
            {item.action.label}
          </Button>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismiss(item.id)}
        className="rounded p-0.5 text-text-faint transition-colors hover:text-text"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2"
    >
      {toasts.map((item) => (
        <ToastRow key={item.id} item={item} />
      ))}
    </div>
  )
}
