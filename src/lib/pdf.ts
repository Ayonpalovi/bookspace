import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

/**
 * pdf.js needs its worker as a separate module. Vite resolves the `?url`
 * import to a hashed asset in the bundle, so this works in dev and in a build
 * without any CDN — which the app's self-contained storage model requires.
 */
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export interface PdfInfo {
  pageCount: number
  /** Data URL of page 1, sized to fit `maxWidth`. */
  previewUrl: string | null
}

async function renderPage(
  document: pdfjs.PDFDocumentProxy,
  pageNumber: number,
  maxWidth: number,
): Promise<string | null> {
  const page = await document.getPage(pageNumber)
  const baseViewport = page.getViewport({ scale: 1 })
  const scale = Math.min(2, maxWidth / baseViewport.width)
  const viewport = page.getViewport({ scale })

  const canvas = window.document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const context = canvas.getContext('2d')
  if (!context) return null

  await page.render({ canvas, canvasContext: context, viewport }).promise
  return canvas.toDataURL('image/jpeg', 0.72)
}

/** Reads page count and renders a first-page thumbnail. */
export async function inspectPdf(file: Blob, maxWidth = 480): Promise<PdfInfo> {
  const buffer = await file.arrayBuffer()
  const document = await pdfjs.getDocument({ data: buffer }).promise
  try {
    const previewUrl = await renderPage(document, 1, maxWidth)
    return { pageCount: document.numPages, previewUrl }
  } finally {
    void document.cleanup()
  }
}

/** Renders every page for the full-document viewer. */
export async function renderPdfPages(
  file: Blob,
  maxWidth = 900,
  onPage?: (index: number, dataUrl: string) => void,
): Promise<string[]> {
  const buffer = await file.arrayBuffer()
  const document = await pdfjs.getDocument({ data: buffer }).promise
  const pages: string[] = []
  try {
    for (let i = 1; i <= document.numPages; i++) {
      const url = await renderPage(document, i, maxWidth)
      if (url) {
        pages.push(url)
        onPage?.(i - 1, url)
      }
    }
    return pages
  } finally {
    void document.cleanup()
  }
}
