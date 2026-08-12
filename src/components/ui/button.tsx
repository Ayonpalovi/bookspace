import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

const button = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-accent-fg hover:bg-accent-hover shadow-[var(--shadow-sm)]',
        secondary:
          'bg-surface text-text border border-border hover:bg-surface-hover hover:border-border-strong shadow-[var(--shadow-sm)]',
        ghost: 'text-text-muted hover:bg-surface-hover hover:text-text',
        subtle: 'bg-surface-sunken text-text hover:bg-surface-hover',
        danger: 'bg-danger text-white hover:opacity-90',
        'danger-ghost': 'text-danger hover:bg-danger-subtle',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 rounded-lg px-2.5 text-[13px] [&_svg]:size-3.5',
        md: 'h-9 rounded-lg px-3.5 text-sm [&_svg]:size-4',
        lg: 'h-11 rounded-xl px-5 text-[15px] [&_svg]:size-4',
        icon: 'size-8 rounded-lg [&_svg]:size-4',
        'icon-sm': 'size-7 rounded-md [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps
  extends ComponentProps<'button'>,
    VariantProps<typeof button> {
  asChild?: boolean
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type = 'button',
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      className={cn(button({ variant, size }), className)}
      {...(asChild ? {} : { type })}
      {...props}
    />
  )
}

export { button as buttonVariants }
