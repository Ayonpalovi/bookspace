import { Download, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { renderPdfPages } from '@/lib/pdf'
import type { StoredFile } from '@/types/canvas'
import { formatBytes } from '@/lib/utils'

/**
 * Full-document viewer.
 *
 * PDFs render page by page through pdf.js. Everything else gets a metadata card
 * and a download — DOCX and PPTX previews would need a server-side converter,
 * so the UI says so rather than showing a fake preview.
 */
export function PdfViewer({
  file,
  onClose,
}: {
  file: StoredFile | null
  onClose: () => void
}) {
  const [pages, setPages] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isPdf =
    file?.mimeType === 'application/pdf' || /\.pdf$/i.test(file?.name ?? '')

  useEffect(() => {
    if (!file || !isPdf) return
    let cancelled = false
    setLoading(true)
    setPages([])
    setError(null)
    renderPdfPages(file.blob, 900, (_, url) => {
      if (!cancelled) setPages((current) => [...current, url])
    })
      .catch(() => !cancelled && setError('This PDF could not be rendered.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [file, isPdf])

  const download = () => {
    if (!file) return
    const url = URL.createObjectURL(file.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = file.name
    link.click()
    URL.revokeObjectURL(url)
  }

  if (!file) return null

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={file.name}
        description={`${formatBytes(file.size)}${file.pageCount ? ` · ${file.pageCount} pages` : ''}`}
        size="lg"
        footer={
          <Button variant="secondary" onClick={download}>
            <Download /> Download
          </Button>
        }
      >
        {isPdf ? (
          <div className="space-y-4">
            {loading && pages.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-text-muted">
                <Loader2 className="size-4 animate-spin" /> Rendering pages…
              </div>
            )}
            {error && <p className="py-10 text-center text-sm text-danger">{error}</p>}
            {pages.map((page, index) => (
              <figure key={index} className="space-y-1">
                <img
                  src={page}
                  alt={`Page ${index + 1}`}
                  className="w-full rounded-lg border border-border"
                />
                <figcaption className="text-center text-[11px] text-text-faint">
                  Page {index + 1}
                  {file.pageCount ? ` of ${file.pageCount}` : ''}
                </figcaption>
              </figure>
            ))}
            {loading && pages.length > 0 && (
              <p className="flex items-center justify-center gap-2 py-3 text-xs text-text-faint">
                <Loader2 className="size-3 animate-spin" /> Loading more pages…
              </p>
            )}
          </div>
        ) : file.mimeType.startsWith('image/') ? (
          <img
            src={URL.createObjectURL(file.blob)}
            alt={file.name}
            className="w-full rounded-lg border border-border"
          />
        ) : (
          <div className="space-y-3 py-8 text-center">
            <p className="text-sm text-text">{file.name}</p>
            <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-text-muted">
              In-app preview for this format needs a server-side converter, which
              BookSpace does not have yet. The file is stored intact — download it
              to open in its own app.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
