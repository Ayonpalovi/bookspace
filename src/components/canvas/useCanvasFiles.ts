import { useCallback } from 'react'
import * as spaceRepo from '@/data/spaces'
import * as repo from '@/data/repository'
import { useCanvas } from '@/stores/canvas'
import { toast } from '@/components/ui/toast'
import { inspectPdf } from '@/lib/pdf'
import type { Point, StoredFile } from '@/types/canvas'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']

const ACCEPTED = [
  ...IMAGE_TYPES,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/csv',
]

export const UPLOAD_ACCEPT =
  '.png,.jpg,.jpeg,.webp,.gif,.svg,.pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.csv'

function isImage(file: File): boolean {
  return IMAGE_TYPES.includes(file.type) || /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name)
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob)
  try {
    return await new Promise((resolve) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => resolve({ width: 320, height: 240 })
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Turns dropped/selected files into canvas objects.
 *
 * Images become image objects sized to their natural aspect ratio; PDFs get a
 * real first-page thumbnail and page count via pdf.js; everything else becomes
 * a file card that can be opened or downloaded. Nothing is uploaded anywhere —
 * bytes live in IndexedDB until a storage backend exists.
 */
export function useCanvasFiles({
  userId,
  onFileStored,
}: {
  userId: string
  onFileStored: (file: StoredFile, objectUrl: string | null) => void
}) {
  const store = useCanvas

  const addFiles = useCallback(
    async (files: File[], at: Point) => {
      const state = store.getState()
      if (!state.space || !state.pageId) return
      let offset = 0

      for (const file of files) {
        const looksSupported =
          ACCEPTED.includes(file.type) ||
          new RegExp(`(${UPLOAD_ACCEPT.replace(/\./g, '').split(',').join('|')})$`, 'i').test(
            file.name,
          )
        if (!looksSupported) {
          toast.error(`${file.name} is not a supported file type`)
          continue
        }
        if (file.size > 40 * 1024 * 1024) {
          toast.error(
            `${file.name} is too large`,
            'Files over 40 MB are not stored on this device.',
          )
          continue
        }

        try {
          if (isImage(file)) {
            const { width, height } = await imageSize(file)
            const stored = await spaceRepo.saveFile(userId, file, {
              spaceId: state.space.id,
            })
            const url = URL.createObjectURL(stored.blob)
            onFileStored(stored, url)
            const scale = Math.min(1, 420 / Math.max(width, height))
            state.createObject({
              type: 'image',
              x: at.x + offset,
              y: at.y + offset,
              width: Math.round(width * scale),
              height: Math.round(height * scale),
              content: { fileId: stored.id, alt: file.name },
            })
          } else if (isPdf(file)) {
            const info = await inspectPdf(file).catch(() => ({
              pageCount: null,
              previewUrl: null,
            }))
            const stored = await spaceRepo.saveFile(userId, file, {
              spaceId: state.space.id,
              previewUrl: info.previewUrl,
              pageCount: info.pageCount,
            })
            onFileStored(stored, null)
            state.createObject({
              type: 'file',
              x: at.x + offset,
              y: at.y + offset,
              width: 240,
              height: 300,
              content: { fileId: stored.id },
            })
          } else {
            const stored = await spaceRepo.saveFile(userId, file, {
              spaceId: state.space.id,
            })
            onFileStored(stored, null)
            state.createObject({
              type: 'file',
              x: at.x + offset,
              y: at.y + offset,
              content: { fileId: stored.id },
            })
          }
          await repo.logActivity(userId, 'file_uploaded', `Uploaded ${file.name}`)
          offset += 28
        } catch (error) {
          toast.error(
            `Could not add ${file.name}`,
            error instanceof Error ? error.message : undefined,
          )
        }
      }
    },
    [userId, onFileStored, store],
  )

  return { addFiles }
}
