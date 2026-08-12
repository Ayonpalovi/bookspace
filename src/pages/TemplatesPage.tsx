import { Copy, LayoutTemplate, Pencil, Star, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, NativeSelect } from '@/components/ui/field'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu'
import { Badge, Card, EmptyState, PageLoader } from '@/components/ui/primitives'
import { toast } from '@/components/ui/toast'
import { useAsync } from '@/hooks/useAsync'
import { useTab } from '@/hooks/useTab'
import * as spaceRepo from '@/data/spaces'
import { useSession } from '@/stores/session'
import { bump, useVersion } from '@/stores/data'
import type { SpaceTemplate } from '@/types/canvas'
import { formatDate, pluralize } from '@/lib/utils'

export function TemplatesPage() {
  useTab({ title: 'Templates', kind: 'page', icon: 'space' })
  const profile = useSession((s) => s.profile)!
  const templatesVersion = useVersion('templates')
  const [useTemplate, setUseTemplate] = useState<SpaceTemplate | null>(null)

  const { data, loading, reload } = useAsync(
    async () => spaceRepo.listTemplates(profile.id),
    [profile.id, templatesVersion],
  )

  const grouped = useMemo(() => {
    const map = new Map<string, SpaceTemplate[]>()
    for (const template of data ?? []) {
      const list = map.get(template.category) ?? []
      list.push(template)
      map.set(template.category, list)
    }
    return [...map.entries()]
  }, [data])

  if (loading && !data) return <PageLoader label="Loading templates" />

  return (
    <div className="mx-auto max-w-5xl px-6 py-7">
      <div className="mb-6">
        <h1 className="font-serif text-[26px] leading-tight tracking-tight">Templates</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Reusable layouts saved from a Space. Select objects on a canvas and choose
          “Save selection as template”.
        </p>
      </div>

      {!data?.length ? (
        <EmptyState
          icon={<LayoutTemplate />}
          title="No templates yet"
          description="Build a layout you like on a canvas, select it, and save it here to reuse."
          actions={
            <Button asChild variant="primary">
              <Link to="/spaces">Open a Space</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {grouped.map(([category, templates]) => (
            <section key={category}>
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
                {category}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((template) => (
                  <Card key={template.id} className="group p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-text">
                          {template.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-text-faint">
                          {pluralize(template.objects.length, 'object')} ·{' '}
                          {formatDate(template.createdAt)}
                        </p>
                      </div>
                      <Menu>
                        <MenuTrigger asChild>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Actions for ${template.name}`}
                          >
                            <Pencil />
                          </Button>
                        </MenuTrigger>
                        <MenuContent align="end" className="w-48">
                          <MenuItem
                            onSelect={async () => {
                              const name = window.prompt('Rename template', template.name)
                              if (!name) return
                              await spaceRepo.updateTemplate(profile.id, template.id, { name })
                              bump('templates')
                              reload()
                            }}
                          >
                            <Pencil /> Rename
                          </MenuItem>
                          <MenuItem
                            onSelect={async () => {
                              await spaceRepo.updateTemplate(profile.id, template.id, {
                                isFavorite: !template.isFavorite,
                              })
                              bump('templates')
                              reload()
                            }}
                          >
                            <Star /> {template.isFavorite ? 'Remove favorite' : 'Favorite'}
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem
                            destructive
                            onSelect={async () => {
                              await spaceRepo.deleteTemplate(profile.id, template.id)
                              bump('templates')
                              reload()
                              toast.success('Template deleted')
                            }}
                          >
                            <Trash2 /> Delete
                          </MenuItem>
                        </MenuContent>
                      </Menu>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1">
                      {[...new Set(template.objects.map((o) => o.type))]
                        .slice(0, 4)
                        .map((type) => (
                          <Badge key={type}>{type.replace('_', ' ')}</Badge>
                        ))}
                      {template.isFavorite && <Badge tone="accent">Favorite</Badge>}
                    </div>

                    <Button
                      size="sm"
                      className="mt-3 w-full"
                      onClick={() => setUseTemplate(template)}
                    >
                      <Copy /> Use template
                    </Button>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <UseTemplateDialog
        template={useTemplate}
        onClose={() => setUseTemplate(null)}
      />
    </div>
  )
}

/** Applies a template to an existing Space page, or into a brand-new Space. */
function UseTemplateDialog({
  template,
  onClose,
}: {
  template: SpaceTemplate | null
  onClose: () => void
}) {
  const profile = useSession((s) => s.profile)!
  const navigate = useNavigate()
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)

  const { data } = useAsync(
    async () => {
      if (!template) return []
      const spaces = await spaceRepo.listSpaces(profile.id)
      const withPages = await Promise.all(
        spaces.map(async (space) => ({
          space,
          pages: await spaceRepo.listPages(profile.id, space.id),
        })),
      )
      return withPages
    },
    [profile.id, template?.id],
  )

  const apply = async () => {
    if (!template) return
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
          name: template.name,
          kind: 'blank',
        })
        spaceId = created.space.id
        pageId = created.pages[0].id
      }

      const existing = await spaceRepo.listObjects(profile.id, pageId)
      const baseZ = existing.length
        ? Math.max(...existing.map((o) => o.zIndex)) + 1
        : 0
      const objects = spaceRepo.instantiateTemplate(
        profile.id,
        spaceId,
        pageId,
        template,
        { x: 80, y: 80 },
        baseZ,
      )
      await spaceRepo.saveObjects(objects)
      bump('spaces')
      onClose()
      navigate(`/spaces/${spaceId}?page=${pageId}`)
      toast.success(`${template.name} applied`)
    } catch (caught) {
      toast.error(
        'Could not apply the template',
        caught instanceof Error ? caught.message : undefined,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={Boolean(template)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`Use ${template?.name ?? 'template'}`}
        description="Add these objects to an existing page, or start a new Space with them."
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={apply} disabled={busy}>
              {busy ? 'Applying…' : 'Apply'}
            </Button>
          </>
        }
      >
        <Field label="Where should it go?">
          {(props) => (
            <NativeSelect
              {...props}
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            >
              <option value="">Create a new Space</option>
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
      </DialogContent>
    </Dialog>
  )
}
