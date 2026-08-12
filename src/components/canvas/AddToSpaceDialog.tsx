import { LayoutDashboard, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Input, NativeSelect } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/primitives'
import { toast } from '@/components/ui/toast'
import { useAsync } from '@/hooks/useAsync'
import * as spaceRepo from '@/data/spaces'
import { useSession } from '@/stores/session'
import { bump } from '@/stores/data'
import type { SpaceObjectType } from '@/types/canvas'

/**
 * "Add to Space" from a note, quote or book.
 *
 * The card holds only the entity id, so it stays linked to the source record
 * rather than copying a snapshot of its text.
 */
export function AddToSpaceDialog({
  open,
  onOpenChange,
  type,
  content,
  label,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: Extract<SpaceObjectType, 'note_card' | 'quote_card' | 'book_card'>
  content: Record<string, unknown>
  label: string
}) {
  const profile = useSession((s) => s.profile)!
  const navigate = useNavigate()
  const [target, setTarget] = useState('')
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  const { data } = useAsync(
    async () => {
      const spaces = await spaceRepo.listSpaces(profile.id)
      return Promise.all(
        spaces.map(async (space) => ({
          space,
          pages: await spaceRepo.listPages(profile.id, space.id),
        })),
      )
    },
    [profile.id, open],
  )

  const add = async () => {
    setBusy(true)
    try {
      let spaceId: string
      let pageId: string

      if (target) {
        const [chosenSpace, chosenPage] = target.split('::')
        spaceId = chosenSpace
        pageId = chosenPage
      } else {
        const created = await spaceRepo.createSpace(profile.id, {
          name: newName.trim() || label,
          kind: 'blank',
        })
        spaceId = created.space.id
        pageId = created.pages[0].id
      }

      const existing = await spaceRepo.listObjects(profile.id, pageId)
      // Lay new cards out in a loose grid so repeated adds don't stack.
      const column = existing.length % 4
      const row = Math.floor(existing.length / 4)
      const object = spaceRepo.buildObject(profile.id, spaceId, pageId, {
        type,
        x: 80 + column * 300,
        y: 80 + row * 240,
        zIndex: existing.length,
        content,
      })
      await spaceRepo.saveObjects([object])
      await spaceRepo.touchSpace(profile.id, spaceId)

      bump('spaces')
      onOpenChange(false)
      toast.success(`Added to the canvas`, 'Opening the Space.')
      navigate(`/spaces/${spaceId}?page=${pageId}`)
    } catch (caught) {
      toast.error(
        'Could not add to a Space',
        caught instanceof Error ? caught.message : undefined,
      )
    } finally {
      setBusy(false)
    }
  }

  const hasSpaces = (data ?? []).length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Add to a Space"
        description="Place this on an infinite canvas. The card stays linked to the original."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={add} disabled={busy}>
              {busy ? 'Adding…' : 'Add to canvas'}
            </Button>
          </>
        }
      >
        {!hasSpaces ? (
          <div className="space-y-4">
            <EmptyState
              icon={<LayoutDashboard />}
              title="You don't have a Space yet"
              description="One will be created for this card."
              className="border-0 py-8"
            />
            <Field label="New Space name">
              {(props) => (
                <Input
                  {...props}
                  autoFocus
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder={label}
                />
              )}
            </Field>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Space and page">
              {(props) => (
                <NativeSelect
                  {...props}
                  autoFocus
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                >
                  <option value="">＋ Create a new Space</option>
                  {(data ?? []).map(({ space, pages }) =>
                    pages.map((page) => (
                      <option key={page.id} value={`${space.id}::${page.id}`}>
                        {space.name} → {page.name}
                      </option>
                    )),
                  )}
                </NativeSelect>
              )}
            </Field>
            {!target && (
              <Field label="New Space name">
                {(props) => (
                  <Input
                    {...props}
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    placeholder={label}
                  />
                )}
              </Field>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Small trigger used on note and quote cards. */
export function AddToSpaceButton({
  type,
  content,
  label,
  size = 'sm',
  variant = 'secondary',
}: {
  type: Extract<SpaceObjectType, 'note_card' | 'quote_card' | 'book_card'>
  content: Record<string, unknown>
  label: string
  size?: 'sm' | 'md'
  variant?: 'secondary' | 'ghost'
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        <Plus /> Add to Space
      </Button>
      <AddToSpaceDialog
        open={open}
        onOpenChange={setOpen}
        type={type}
        content={content}
        label={label}
      />
    </>
  )
}
