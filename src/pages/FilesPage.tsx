import {
  Download,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Pencil,
  Presentation,
  Search,
  Sheet,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PdfViewer } from '@/components/canvas/PdfViewer'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/field'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu'
import { Badge, EmptyState, PageLoader } from '@/components/ui/primitives'
import { toast } from '@/components/ui/toast'
import { useAsync } from '@/hooks/useAsync'
import { useTab } from '@/hooks/useTab'
import * as spaceRepo from '@/data/spaces'
import { useSession } from '@/stores/session'
import { bump, useVersion } from '@/stores/data'
import type { Space, StoredFile } from '@/types/canvas'
import { formatBytes, relativeTime } from '@/lib/utils'

type Kind = 'all' | 'image' | 'pdf' | 'document' | 'other'

function kindOf(file: StoredFile): Exclude<Kind, 'all'> {
  if (file.mimeType.startsWith('image/')) return 'image'
  if (file.mimeType === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf'
  if (/\.(docx?|pptx?|txt|md|csv)$/i.test(file.name)) return 'document'
  return 'other'
}

function FileGlyph({ file }: { file: StoredFile }) {
  const kind = kindOf(file)
  if (kind === 'image') return <ImageIcon />
  if (kind === 'pdf') return <FileText />
  if (/\.pptx?$/i.test(file.name)) return <Presentation />
  if (/\.csv$/i.test(file.name)) return <Sheet />
  return <FileText />
}

export function FilesPage() {
  useTab({ title: 'Files', kind: 'page', icon: 'space' })
  const profile = useSession((s) => s.profile)!
  const filesVersion = useVersion('files')
  const spacesVersion = useVersion('spaces')

  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<Kind>('all')
  const [preview, setPreview] = useState<StoredFile | null>(null)
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map())

  const { data, loading, reload } = useAsync(
    async () => {
      const files = await spaceRepo.listFiles(profile.id)
      const usage = new Map<string, { space: Space; pageId: string }[]>()
      for (const file of files) {
        usage.set(file.id, await spaceRepo.findFileUsage(profile.id, file.id))
      }
      return { files, usage }
    },
    [profile.id, filesVersion, spacesVersion],
  )

  // Image thumbnails need object URLs; create once and revoke on unmount.
  useEffect(() => {
    if (!data) return
    const created = new Map<string, string>()
    for (const file of data.files) {
      if (file.mimeType.startsWith('image/')) {
        created.set(file.id, URL.createObjectURL(file.blob))
      }
    }
    setThumbs(created)
    return () => {
      for (const url of created.values()) URL.revokeObjectURL(url)
    }
  }, [data])

  const files = useMemo(() => {
    let result = data?.files ?? []
    if (kind !== 'all') result = result.filter((file) => kindOf(file) === kind)
    const q = query.trim().toLowerCase()
    if (q) result = result.filter((file) => file.name.toLowerCase().includes(q))
    return result
  }, [data, kind, query])

  const totalSize = (data?.files ?? []).reduce((sum, file) => sum + file.size, 0)

  const download = (file: StoredFile) => {
    const url = URL.createObjectURL(file.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = file.name
    link.click()
    URL.revokeObjectURL(url)
  }

  if (loading && !data) return <PageLoader label="Loading files" />

  return (
    <div className="mx-auto max-w-5xl px-6 py-7">
      <div className="mb-6">
        <h1 className="font-serif text-[26px] leading-tight tracking-tight">Files</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Everything uploaded to your Spaces · {formatBytes(totalSize)} stored on this
          device
        </p>
      </div>

      {(data?.files.length ?? 0) > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-faint" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search files"
              className="pl-8"
              aria-label="Search files"
            />
          </div>
          <NativeSelect
            value={kind}
            onChange={(event) => setKind(event.target.value as Kind)}
            className="w-40"
            aria-label="Filter by type"
          >
            <option value="all">All types</option>
            <option value="image">Images</option>
            <option value="pdf">PDFs</option>
            <option value="document">Documents</option>
            <option value="other">Other</option>
          </NativeSelect>
        </div>
      )}

      {files.length === 0 ? (
        <EmptyState
          icon={<Paperclip />}
          title={data?.files.length ? 'Nothing matches' : 'No files yet'}
          description={
            data?.files.length
              ? 'Try a different search or file type.'
              : 'Drag a PDF, image or document onto any Space canvas and it will appear here.'
          }
          actions={
            <Button asChild variant="primary">
              <Link to="/spaces">Open a Space</Link>
            </Button>
          }
        />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {files.map((file) => {
            const usage = data?.usage.get(file.id) ?? []
            const thumb = thumbs.get(file.id) ?? file.previewUrl
            return (
              <div key={file.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-sunken text-text-faint [&_svg]:size-4">
                  {thumb ? (
                    <img src={thumb} alt="" className="size-full object-cover" />
                  ) : (
                    <FileGlyph file={file} />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-text">{file.name}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-text-faint">
                    <span>{formatBytes(file.size)}</span>
                    {file.pageCount ? <span>· {file.pageCount} pages</span> : null}
                    <span>· {relativeTime(file.createdAt)}</span>
                  </p>
                </div>

                <div className="hidden shrink-0 sm:block">
                  {usage.length ? (
                    <Link
                      to={`/spaces/${usage[0].space.id}?page=${usage[0].pageId}`}
                      className="text-[11px] text-text-muted hover:text-accent hover:underline"
                    >
                      Used in {usage[0].space.name}
                      {usage.length > 1 ? ` +${usage.length - 1}` : ''}
                    </Link>
                  ) : (
                    <Badge tone="outline">Unused</Badge>
                  )}
                </div>

                <Menu>
                  <MenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${file.name}`}>
                      <Pencil />
                    </Button>
                  </MenuTrigger>
                  <MenuContent align="end" className="w-48">
                    <MenuItem onSelect={() => setPreview(file)}>Open</MenuItem>
                    <MenuItem onSelect={() => download(file)}>
                      <Download /> Download
                    </MenuItem>
                    <MenuItem
                      onSelect={async () => {
                        const name = window.prompt('Rename file', file.name)
                        if (!name) return
                        await spaceRepo.renameFile(profile.id, file.id, name)
                        bump('files')
                        reload()
                      }}
                    >
                      <Pencil /> Rename
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem
                      destructive
                      onSelect={async () => {
                        await spaceRepo.deleteFile(profile.id, file.id)
                        bump('files')
                        reload()
                        toast.success('File deleted', 'Cards pointing at it will show as missing.')
                      }}
                    >
                      <Trash2 /> Delete
                    </MenuItem>
                  </MenuContent>
                </Menu>
              </div>
            )
          })}
        </div>
      )}

      {preview && <PdfViewer file={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}
