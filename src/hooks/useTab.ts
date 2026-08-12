import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useTabs, type TabDescriptor } from '@/stores/tabs'

/**
 * Registers the current route as a tab. Pages call this with their own title so
 * the strip stays in sync with what is actually open — including titles that
 * arrive asynchronously (a book name loaded from storage, say).
 *
 * Pass `title: null` while the title is still loading to defer registration.
 */
export function useTab(
  descriptor: Omit<TabDescriptor, 'path' | 'title'> & { title: string | null },
) {
  const { pathname } = useLocation()
  const ensure = useTabs((s) => s.ensure)
  const hydrated = useTabs((s) => s.hydrated)
  const { title, kind, icon, entityId } = descriptor

  useEffect(() => {
    if (!hydrated || !title) return
    ensure({ path: pathname, title, kind, icon, entityId })
  }, [hydrated, pathname, title, kind, icon, entityId, ensure])
}
