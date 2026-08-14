/**
 * The BookSpace mark — the user's own asset (public/Logo.png), referenced
 * as-is. It already bakes in its rounded-square badge and colour, so it's
 * rendered directly with no wrapper background or recolouring around it.
 * One component so every place the mark appears points at the same file.
 */
export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <img
      src="/Logo.png"
      alt="BookSpace"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size }}
    />
  )
}
