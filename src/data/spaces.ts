/**
 * Spaces repository.
 *
 * Same contract as `repository.ts`: every function takes an explicit `userId`
 * and filters by it, so the Supabase adapter can replace this file without the
 * canvas or any page changing.
 */

import { get, getAll, getAllByIndex, put, putMany, remove, removeWhere } from './db'
import * as repo from './repository'
import type {
  Connection,
  ConnectorContent,
  Space,
  SpaceKind,
  SpaceObject,
  SpaceObjectType,
  SpacePage,
  SpaceTemplate,
  StoredFile,
} from '@/types/canvas'
import { RELATIONSHIP_LABEL, STICKY_COLORS } from '@/types/canvas'
import { nowIso, uid } from '@/lib/utils'

/* -------------------------------------------------------------------- spaces */

export async function listSpaces(userId: string): Promise<Space[]> {
  const spaces = await getAllByIndex<Space>('spaces', 'by_user', userId)
  return spaces.sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

export async function getSpace(userId: string, spaceId: string): Promise<Space | null> {
  const space = await get<Space>('spaces', spaceId)
  if (!space || space.userId !== userId) return null
  return space
}

export async function getSpaceForBook(
  userId: string,
  bookId: string,
): Promise<Space | null> {
  const spaces = await getAllByIndex<Space>('spaces', 'by_book', bookId)
  return spaces.find((s) => s.userId === userId) ?? null
}

export interface CreateSpaceInput {
  name: string
  kind?: SpaceKind
  bookId?: string | null
  description?: string | null
  /** Page names to create up front. Defaults to a single "Canvas" page. */
  pages?: string[]
}

export async function createSpace(
  userId: string,
  input: CreateSpaceInput,
): Promise<{ space: Space; pages: SpacePage[] }> {
  const timestamp = nowIso()
  const space: Space = {
    id: uid('spc'),
    userId,
    name: input.name.trim() || 'Untitled Space',
    kind: input.kind ?? 'blank',
    bookId: input.bookId ?? null,
    description: input.description ?? null,
    isFavorite: false,
    thumbnail: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await put<Space>('spaces', space)

  const pageNames = input.pages?.length ? input.pages : ['Canvas']
  const pages: SpacePage[] = pageNames.map((name, index) => ({
    id: uid('pag'),
    spaceId: space.id,
    userId,
    name,
    position: index,
    createdAt: timestamp,
    updatedAt: timestamp,
  }))
  await putMany<SpacePage>('space_pages', pages)

  return { space, pages }
}

export async function updateSpace(
  userId: string,
  spaceId: string,
  patch: Partial<Omit<Space, 'id' | 'userId' | 'createdAt'>>,
): Promise<Space> {
  const space = await getSpace(userId, spaceId)
  if (!space) throw new Error('Space not found')
  const next: Space = { ...space, ...patch, updatedAt: nowIso() }
  await put<Space>('spaces', next)
  return next
}

/** Touches updatedAt without a full read-modify-write of unrelated fields. */
export async function touchSpace(userId: string, spaceId: string): Promise<void> {
  const space = await getSpace(userId, spaceId)
  if (!space) return
  await put<Space>('spaces', { ...space, updatedAt: nowIso() })
}

export async function deleteSpace(userId: string, spaceId: string): Promise<void> {
  const space = await getSpace(userId, spaceId)
  if (!space) throw new Error('Space not found')
  await removeWhere<SpaceObject>(
    'space_objects',
    (o) => o.spaceId === spaceId,
    (o) => o.id,
  )
  await removeWhere<SpacePage>(
    'space_pages',
    (p) => p.spaceId === spaceId,
    (p) => p.id,
  )
  // Files uploaded into this Space stay in the library but lose the link.
  const files = await getAllByIndex<StoredFile>('files', 'by_space', spaceId)
  await putMany<StoredFile>(
    'files',
    files.filter((f) => f.userId === userId).map((f) => ({ ...f, spaceId: null })),
  )
  await remove('spaces', spaceId)
}

export async function duplicateSpace(userId: string, spaceId: string): Promise<Space> {
  const source = await getSpace(userId, spaceId)
  if (!source) throw new Error('Space not found')
  const timestamp = nowIso()

  const copy: Space = {
    ...source,
    id: uid('spc'),
    name: `${source.name} copy`,
    isFavorite: false,
    // A duplicate is a personal copy, never a second Knowledge Space for the
    // same book — that link stays with the original.
    bookId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await put<Space>('spaces', copy)

  const pages = await listPages(userId, spaceId)
  const pageIdMap = new Map<string, string>()
  const newPages = pages.map((page) => {
    const id = uid('pag')
    pageIdMap.set(page.id, id)
    return { ...page, id, spaceId: copy.id, createdAt: timestamp, updatedAt: timestamp }
  })
  await putMany<SpacePage>('space_pages', newPages)

  const objects = await getAllByIndex<SpaceObject>('space_objects', 'by_space', spaceId)
  const objectIdMap = new Map<string, string>()
  const cloned = objects
    .filter((o) => o.userId === userId)
    .map((object) => {
      const id = uid('obj')
      objectIdMap.set(object.id, id)
      return { ...object, id }
    })
  // Second pass so connectors and frame parents point at the copies.
  const remapped = cloned.map((object) => ({
    ...object,
    spaceId: copy.id,
    pageId: pageIdMap.get(object.pageId) ?? object.pageId,
    parentFrameId: object.parentFrameId
      ? (objectIdMap.get(object.parentFrameId) ?? null)
      : null,
    groupId: object.groupId ? `grp_${objectIdMap.get(object.groupId) ?? object.groupId}` : null,
    content:
      object.type === 'connector'
        ? {
            ...object.content,
            fromId: object.content.fromId
              ? (objectIdMap.get(object.content.fromId as string) ?? null)
              : null,
            toId: object.content.toId
              ? (objectIdMap.get(object.content.toId as string) ?? null)
              : null,
          }
        : object.content,
    createdAt: timestamp,
    updatedAt: timestamp,
  }))
  await putMany<SpaceObject>('space_objects', remapped)

  return copy
}

/* --------------------------------------------------------------------- pages */

export async function listPages(userId: string, spaceId: string): Promise<SpacePage[]> {
  const pages = await getAllByIndex<SpacePage>('space_pages', 'by_space', spaceId)
  return pages
    .filter((p) => p.userId === userId)
    .sort((a, b) => a.position - b.position)
}

export async function createPage(
  userId: string,
  spaceId: string,
  name: string,
): Promise<SpacePage> {
  const pages = await listPages(userId, spaceId)
  const timestamp = nowIso()
  const page: SpacePage = {
    id: uid('pag'),
    spaceId,
    userId,
    name: name.trim() || `Page ${pages.length + 1}`,
    position: pages.length,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await put<SpacePage>('space_pages', page)
  await touchSpace(userId, spaceId)
  return page
}

export async function renamePage(
  userId: string,
  pageId: string,
  name: string,
): Promise<void> {
  const page = await get<SpacePage>('space_pages', pageId)
  if (!page || page.userId !== userId) throw new Error('Page not found')
  await put<SpacePage>('space_pages', { ...page, name: name.trim(), updatedAt: nowIso() })
}

export async function duplicatePage(
  userId: string,
  pageId: string,
): Promise<SpacePage> {
  const page = await get<SpacePage>('space_pages', pageId)
  if (!page || page.userId !== userId) throw new Error('Page not found')
  const siblings = await listPages(userId, page.spaceId)
  const timestamp = nowIso()
  const copy: SpacePage = {
    ...page,
    id: uid('pag'),
    name: `${page.name} copy`,
    position: siblings.length,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await put<SpacePage>('space_pages', copy)

  const objects = await listObjects(userId, pageId)
  const idMap = new Map<string, string>()
  for (const object of objects) idMap.set(object.id, uid('obj'))
  await putMany<SpaceObject>(
    'space_objects',
    objects.map((object) => ({
      ...object,
      id: idMap.get(object.id)!,
      pageId: copy.id,
      parentFrameId: object.parentFrameId
        ? (idMap.get(object.parentFrameId) ?? null)
        : null,
      content:
        object.type === 'connector'
          ? {
              ...object.content,
              fromId: object.content.fromId
                ? (idMap.get(object.content.fromId as string) ?? null)
                : null,
              toId: object.content.toId
                ? (idMap.get(object.content.toId as string) ?? null)
                : null,
            }
          : object.content,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  )
  return copy
}

export async function deletePage(userId: string, pageId: string): Promise<void> {
  const page = await get<SpacePage>('space_pages', pageId)
  if (!page || page.userId !== userId) throw new Error('Page not found')
  const siblings = await listPages(userId, page.spaceId)
  if (siblings.length <= 1) throw new Error('A Space needs at least one page.')
  await removeWhere<SpaceObject>(
    'space_objects',
    (o) => o.pageId === pageId,
    (o) => o.id,
  )
  await remove('space_pages', pageId)
  await reorderPages(
    userId,
    siblings.filter((p) => p.id !== pageId).map((p) => p.id),
  )
}

export async function reorderPages(userId: string, orderedIds: string[]): Promise<void> {
  const pages = await Promise.all(
    orderedIds.map((id) => get<SpacePage>('space_pages', id)),
  )
  await putMany<SpacePage>(
    'space_pages',
    pages
      .filter((p): p is SpacePage => Boolean(p) && p!.userId === userId)
      .map((page, index) => ({ ...page, position: index })),
  )
}

/* ------------------------------------------------------------------- objects */

export async function listObjects(
  userId: string,
  pageId: string,
): Promise<SpaceObject[]> {
  const objects = await getAllByIndex<SpaceObject>('space_objects', 'by_page', pageId)
  return objects.filter((o) => o.userId === userId).sort((a, b) => a.zIndex - b.zIndex)
}

export interface NewObjectInput {
  type: SpaceObjectType
  x: number
  y: number
  width?: number
  height?: number
  content?: Record<string, unknown>
  style?: SpaceObject['style']
  metadata?: Record<string, unknown>
  zIndex?: number
  parentFrameId?: string | null
}

const DEFAULT_SIZE: Record<SpaceObjectType, { width: number; height: number }> = {
  text: { width: 220, height: 48 },
  sticky: { width: 180, height: 180 },
  shape: { width: 180, height: 120 },
  frame: { width: 640, height: 420 },
  connector: { width: 0, height: 0 },
  drawing: { width: 0, height: 0 },
  image: { width: 280, height: 200 },
  file: { width: 240, height: 150 },
  link: { width: 280, height: 120 },
  table: { width: 420, height: 200 },
  book_card: { width: 230, height: 300 },
  note_card: { width: 260, height: 190 },
  quote_card: { width: 300, height: 190 },
}

export function buildObject(
  userId: string,
  spaceId: string,
  pageId: string,
  input: NewObjectInput,
): SpaceObject {
  const timestamp = nowIso()
  const size = DEFAULT_SIZE[input.type]
  return {
    id: uid('obj'),
    spaceId,
    pageId,
    userId,
    type: input.type,
    x: input.x,
    y: input.y,
    width: input.width ?? size.width,
    height: input.height ?? size.height,
    rotation: 0,
    zIndex: input.zIndex ?? 0,
    locked: false,
    hidden: false,
    groupId: null,
    parentFrameId: input.parentFrameId ?? null,
    content: input.content ?? {},
    style: input.style ?? {},
    metadata: input.metadata ?? {},
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export async function saveObjects(objects: SpaceObject[]): Promise<void> {
  await putMany<SpaceObject>('space_objects', objects)
}

export async function deleteObjects(ids: string[]): Promise<void> {
  if (!ids.length) return
  const idSet = new Set(ids)
  await removeWhere<SpaceObject>(
    'space_objects',
    (o) => idSet.has(o.id),
    (o) => o.id,
  )
}

/**
 * Replaces a page's objects wholesale. The canvas keeps authoritative state in
 * memory and flushes here on a debounce, so a diff-based write would cost more
 * than it saves at page-level object counts.
 */
export async function replacePageObjects(
  userId: string,
  pageId: string,
  objects: SpaceObject[],
): Promise<void> {
  const existing = await listObjects(userId, pageId)
  const nextIds = new Set(objects.map((o) => o.id))
  const removedIds = existing.filter((o) => !nextIds.has(o.id)).map((o) => o.id)
  await deleteObjects(removedIds)
  await saveObjects(objects)
}

/* --------------------------------------------------------------- connections */

/**
 * Connectors read as relationships rather than drawings.
 *
 * A connector is stored as a `space_objects` row so it inherits z-order,
 * locking, undo and duplication like anything else on the canvas — but its
 * payload is structured (source, target, relationship, label), so the same
 * edges can feed a knowledge graph, backlinks or relationship search without
 * re-parsing anything visual. `canvas_connections` in the SQL schema is a view
 * over exactly these columns.
 */
export async function listConnections(
  userId: string,
  options: { spaceId?: string; pageId?: string } = {},
): Promise<Connection[]> {
  const objects = options.pageId
    ? await getAllByIndex<SpaceObject>('space_objects', 'by_page', options.pageId)
    : options.spaceId
      ? await getAllByIndex<SpaceObject>('space_objects', 'by_space', options.spaceId)
      : await getAllByIndex<SpaceObject>('space_objects', 'by_user', userId)

  return objects
    .filter((object) => object.userId === userId && object.type === 'connector')
    .map((object) => {
      const content = object.content as unknown as ConnectorContent
      if (!content.fromId || !content.toId) return null
      const relationship = content.relationship ?? 'none'
      return {
        id: object.id,
        spaceId: object.spaceId,
        pageId: object.pageId,
        sourceId: content.fromId,
        targetId: content.toId,
        relationship,
        label:
          content.label ||
          (relationship !== 'none' && relationship !== 'custom'
            ? RELATIONSHIP_LABEL[relationship]
            : ''),
        // Arrows at both ends means the relationship runs both ways.
        bidirectional: Boolean(object.style.arrowStart && object.style.arrowEnd !== false),
        createdAt: object.createdAt,
      } satisfies Connection
    })
    .filter((connection): connection is Connection => connection !== null)
}

/** Everything connected to one object, in either direction. */
export async function listConnectionsFor(
  userId: string,
  objectId: string,
): Promise<Connection[]> {
  const connections = await listConnections(userId)
  return connections.filter((c) => c.sourceId === objectId || c.targetId === objectId)
}

/* --------------------------------------------------------------------- files */

export async function listFiles(userId: string): Promise<StoredFile[]> {
  const files = await getAllByIndex<StoredFile>('files', 'by_user', userId)
  return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getFile(
  userId: string,
  fileId: string,
): Promise<StoredFile | null> {
  const file = await get<StoredFile>('files', fileId)
  if (!file || file.userId !== userId) return null
  return file
}

export async function saveFile(
  userId: string,
  file: File,
  options: { spaceId?: string | null; previewUrl?: string | null; pageCount?: number | null } = {},
): Promise<StoredFile> {
  const record: StoredFile = {
    id: uid('fil'),
    userId,
    spaceId: options.spaceId ?? null,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    blob: file,
    previewUrl: options.previewUrl ?? null,
    pageCount: options.pageCount ?? null,
    createdAt: nowIso(),
  }
  await put<StoredFile>('files', record)
  return record
}

export async function renameFile(
  userId: string,
  fileId: string,
  name: string,
): Promise<void> {
  const file = await getFile(userId, fileId)
  if (!file) throw new Error('File not found')
  await put<StoredFile>('files', { ...file, name: name.trim() })
}

export async function deleteFile(userId: string, fileId: string): Promise<void> {
  const file = await getFile(userId, fileId)
  if (!file) throw new Error('File not found')
  await remove('files', fileId)
}

/** Which objects reference a file — powers "where is this used" in /files. */
export async function findFileUsage(
  userId: string,
  fileId: string,
): Promise<{ space: Space; pageId: string }[]> {
  const objects = await getAll<SpaceObject>('space_objects')
  const matches = objects.filter(
    (o) => o.userId === userId && o.content.fileId === fileId,
  )
  const results: { space: Space; pageId: string }[] = []
  for (const match of matches) {
    const space = await getSpace(userId, match.spaceId)
    if (space && !results.some((r) => r.space.id === space.id)) {
      results.push({ space, pageId: match.pageId })
    }
  }
  return results
}

/* ----------------------------------------------------------------- templates */

export async function listTemplates(userId: string): Promise<SpaceTemplate[]> {
  const templates = await getAllByIndex<SpaceTemplate>('space_templates', 'by_user', userId)
  return templates.sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
    return b.createdAt.localeCompare(a.createdAt)
  })
}

export async function saveTemplate(
  userId: string,
  input: {
    name: string
    category: string
    description?: string | null
    thumbnail?: string | null
    objects: SpaceObject[]
  },
): Promise<SpaceTemplate> {
  // Normalize so the selection's top-left sits at the origin.
  const minX = Math.min(...input.objects.map((o) => o.x))
  const minY = Math.min(...input.objects.map((o) => o.y))
  const template: SpaceTemplate = {
    id: uid('tpl'),
    userId,
    name: input.name.trim() || 'Untitled template',
    category: input.category,
    description: input.description ?? null,
    thumbnail: input.thumbnail ?? null,
    isFavorite: false,
    createdAt: nowIso(),
    objects: input.objects.map(
      ({ id: _id, spaceId: _s, pageId: _p, userId: _u, createdAt: _c, updatedAt: _up, ...rest }) => ({
        ...rest,
        x: rest.x - minX,
        y: rest.y - minY,
      }),
    ),
  }
  await put<SpaceTemplate>('space_templates', template)
  return template
}

export async function updateTemplate(
  userId: string,
  templateId: string,
  patch: Partial<Pick<SpaceTemplate, 'name' | 'category' | 'description' | 'isFavorite'>>,
): Promise<void> {
  const template = await get<SpaceTemplate>('space_templates', templateId)
  if (!template || template.userId !== userId) throw new Error('Template not found')
  await put<SpaceTemplate>('space_templates', { ...template, ...patch })
}

export async function deleteTemplate(userId: string, templateId: string): Promise<void> {
  const template = await get<SpaceTemplate>('space_templates', templateId)
  if (!template || template.userId !== userId) throw new Error('Template not found')
  await remove('space_templates', templateId)
}

/**
 * Instantiates a template's objects onto a page at the given canvas point.
 * Group ids are re-keyed so two copies of the same template don't merge.
 */
export function instantiateTemplate(
  userId: string,
  spaceId: string,
  pageId: string,
  template: SpaceTemplate,
  at: { x: number; y: number },
  baseZ: number,
): SpaceObject[] {
  const timestamp = nowIso()
  const groupMap = new Map<string, string>()
  const built = template.objects.map((object) => {
    let groupId = object.groupId
    if (groupId) {
      if (!groupMap.has(groupId)) groupMap.set(groupId, uid('grp'))
      groupId = groupMap.get(groupId)!
    }
    return {
      ...object,
      id: uid('obj'),
      spaceId,
      pageId,
      userId,
      x: object.x + at.x,
      y: object.y + at.y,
      zIndex: baseZ + object.zIndex,
      groupId,
      createdAt: timestamp,
      updatedAt: timestamp,
    } satisfies SpaceObject
  })
  return built
}

/* --------------------------------------------- book knowledge space scaffold */

const BOOK_SPACE_PAGES = [
  'Overview',
  'Key Ideas',
  'Mind Map',
  'Lessons',
  'Action Plan',
  'Quotes',
]

const OVERVIEW_FRAMES = [
  { title: 'Book overview', x: 0, y: 0, width: 720, height: 380 },
  { title: 'Key ideas', x: 780, y: 0, width: 560, height: 380 },
  { title: 'Lessons', x: 0, y: 440, width: 640, height: 360 },
  { title: 'Action items', x: 700, y: 440, width: 640, height: 360 },
  { title: 'Favorite quotes', x: 0, y: 860, width: 1340, height: 360 },
]

/**
 * Creates a book's Knowledge Space with the scaffold from the spec: pages, the
 * five overview frames, and a live book card wired to the real book record.
 */
export async function createBookSpace(
  userId: string,
  bookId: string,
): Promise<{ space: Space; pages: SpacePage[] }> {
  const existing = await getSpaceForBook(userId, bookId)
  if (existing) {
    const pages = await listPages(userId, existing.id)
    return { space: existing, pages }
  }

  const entry = await repo.getLibraryEntry(userId, bookId)
  if (!entry) throw new Error('Book not found')

  const { space, pages } = await createSpace(userId, {
    name: `${entry.book.title} — Knowledge Space`,
    kind: 'book_map',
    bookId,
    pages: BOOK_SPACE_PAGES,
  })

  const overview = pages[0]
  const objects: SpaceObject[] = OVERVIEW_FRAMES.map((frame, index) =>
    buildObject(userId, space.id, overview.id, {
      type: 'frame',
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      zIndex: index,
      content: { title: frame.title },
      style: { fill: 'transparent' },
    }),
  )

  objects.push(
    buildObject(userId, space.id, overview.id, {
      type: 'book_card',
      x: 40,
      y: 60,
      zIndex: 10,
      content: { bookId },
      parentFrameId: objects[0].id,
    }),
  )

  // A starting sticky in Key Ideas so the Space is never a blank stare.
  objects.push(
    buildObject(userId, space.id, overview.id, {
      type: 'sticky',
      x: 830,
      y: 70,
      zIndex: 11,
      content: { text: 'What is the single biggest idea in this book?' },
      style: { fill: STICKY_COLORS[0].fill, color: STICKY_COLORS[0].text },
      parentFrameId: objects[1].id,
    }),
  )

  await saveObjects(objects)
  await repo.logActivity(
    userId,
    'space_created',
    `Created a Knowledge Space for ${entry.book.title}`,
    { bookId },
  )

  return { space, pages }
}
