import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const Menu = DropdownMenu.Root
export const MenuTrigger = DropdownMenu.Trigger
export const MenuGroup = DropdownMenu.Group

export function MenuContent({
  className,
  align = 'start',
  sideOffset = 6,
  ...props
}: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'animate-in-pop z-50 min-w-48 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-[var(--shadow-lg)]',
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  )
}

const itemBase =
  'relative flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-text outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-surface-hover [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-text-faint'

export function MenuItem({
  className,
  destructive,
  shortcut,
  children,
  ...props
}: ComponentProps<typeof DropdownMenu.Item> & {
  destructive?: boolean
  shortcut?: string
}) {
  return (
    <DropdownMenu.Item
      className={cn(
        itemBase,
        destructive &&
          'text-danger data-[highlighted]:bg-danger-subtle [&_svg]:text-danger',
        className,
      )}
      {...props}
    >
      {children}
      {shortcut && (
        <span className="ml-auto pl-6 text-[11px] tracking-wide text-text-faint">
          {shortcut}
        </span>
      )}
    </DropdownMenu.Item>
  )
}

export function MenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenu.CheckboxItem>) {
  return (
    <DropdownMenu.CheckboxItem className={cn(itemBase, 'pl-8', className)} {...props}>
      <DropdownMenu.ItemIndicator className="absolute left-2.5">
        <Check className="size-3.5" />
      </DropdownMenu.ItemIndicator>
      {children}
    </DropdownMenu.CheckboxItem>
  )
}

export function MenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenu.RadioItem>) {
  return (
    <DropdownMenu.RadioItem className={cn(itemBase, 'pl-8', className)} {...props}>
      <DropdownMenu.ItemIndicator className="absolute left-2.5">
        <Check className="size-3.5" />
      </DropdownMenu.ItemIndicator>
      {children}
    </DropdownMenu.RadioItem>
  )
}

export const MenuRadioGroup = DropdownMenu.RadioGroup

export function MenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenu.Separator>) {
  return (
    <DropdownMenu.Separator
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  )
}

export function MenuLabel({
  className,
  ...props
}: ComponentProps<typeof DropdownMenu.Label>) {
  return (
    <DropdownMenu.Label
      className={cn(
        'px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-faint',
        className,
      )}
      {...props}
    />
  )
}
