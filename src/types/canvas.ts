/**
 * Spaces — the visual workspace half of BookSpace.
 *
 * The object model is deliberately extensible: every canvas object is one row
 * with a `type` plus free-form `content` and `style` bags. Adding a new object
 * type means adding a renderer, not a new table or a new code path through the
 * canvas engine.
 */

export type SpaceObjectType =
  | 'text'
  | 'sticky'
  | 'shape'
  | 'frame'
  | 'connector'
  | 'drawing'
  | 'image'
  | 'file'
  | 'link'
  | 'table'
  | 'book_card'
  | 'note_card'
  | 'quote_card'

export type ShapeKind =
  | 'rectangle'
  | 'rounded'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'star'

export type SpaceKind =
  | 'blank'
  | 'book_map'
  | 'mind_map'
  | 'brainstorm'
  | 'research'
  | 'project'
  | 'vision'
  | 'study'
  | 'meeting'
  | 'kanban'

export const SPACE_KIND_LABEL: Record<SpaceKind, string> = {
  blank: 'Blank canvas',
  book_map: 'Book knowledge map',
  mind_map: 'Mind map',
  brainstorm: 'Brainstorm',
  research: 'Research board',
  project: 'Project planner',
  vision: 'Vision board',
  study: 'Study board',
  meeting: 'Meeting board',
  kanban: 'Kanban board',
}

export interface Space {
  id: string
  userId: string
  name: string
  kind: SpaceKind
  /** Set when the Space is a book's Knowledge Space. */
  bookId: string | null
  description: string | null
  isFavorite: boolean
  /** Data-URL snapshot of the canvas, regenerated on save. */
  thumbnail: string | null
  createdAt: string
  updatedAt: string
}

export interface SpacePage {
  id: string
  spaceId: string
  userId: string
  name: string
  position: number
  createdAt: string
  updatedAt: string
}

/** Where a connector attaches on its target. */
export type Anchor = 'top' | 'right' | 'bottom' | 'left' | 'auto'

/**
 * The vocabulary of relationships a connector can carry.
 *
 * These are stored on the connector as structured data, not baked into the
 * label text, so the same edges can later feed a knowledge graph, backlinks or
 * relationship search without re-parsing prose.
 */
export type RelationshipType =
  | 'none'
  | 'causes'
  | 'leads_to'
  | 'related_to'
  | 'supports'
  | 'contradicts'
  | 'influences'
  | 'results_in'
  | 'depends_on'
  | 'part_of'
  | 'example_of'
  | 'inspired_by'
  | 'similar_to'
  | 'different_from'
  | 'custom'

export const RELATIONSHIP_LABEL: Record<RelationshipType, string> = {
  none: 'No relationship',
  causes: 'causes',
  leads_to: 'leads to',
  related_to: 'related to',
  supports: 'supports',
  contradicts: 'contradicts',
  influences: 'influences',
  results_in: 'results in',
  depends_on: 'depends on',
  part_of: 'part of',
  example_of: 'example of',
  inspired_by: 'inspired by',
  similar_to: 'similar to',
  different_from: 'different from',
  custom: 'Custom…',
}

/** Ordered for the picker; `none` and `custom` are handled separately. */
export const RELATIONSHIP_TYPES: RelationshipType[] = [
  'causes',
  'leads_to',
  'results_in',
  'influences',
  'supports',
  'contradicts',
  'depends_on',
  'related_to',
  'part_of',
  'example_of',
  'inspired_by',
  'similar_to',
  'different_from',
]

export interface ConnectorContent {
  fromId: string | null
  toId: string | null
  fromAnchor: Anchor
  toAnchor: Anchor
  /** Fallback endpoints for a connector not bound to an object. */
  fromPoint?: Point
  toPoint?: Point
  /** Structured relationship. `custom` means the label is the whole meaning. */
  relationship?: RelationshipType
  /** Text drawn on the line. Defaults to the relationship's wording. */
  label?: string
}

/**
 * A connector read as a relationship rather than a drawing. This is the shape
 * the knowledge graph will consume.
 */
export interface Connection {
  id: string
  spaceId: string
  pageId: string
  sourceId: string
  targetId: string
  relationship: RelationshipType
  label: string
  bidirectional: boolean
  createdAt: string
}

export interface Point {
  x: number
  y: number
}

export interface ObjectStyle {
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  radius?: number
  color?: string
  fontSize?: number
  fontWeight?: number
  fontStyle?: 'normal' | 'italic'
  textDecoration?: 'none' | 'underline'
  align?: 'left' | 'center' | 'right'
  fontFamily?: 'sans' | 'serif' | 'mono'
  shape?: ShapeKind
  arrowStart?: boolean
  arrowEnd?: boolean
  connector?: 'straight' | 'elbow' | 'curved'
  /** Dash pattern for connectors: solid, dashed or dotted. */
  line?: 'solid' | 'dashed' | 'dotted'
  /** Where the label sits along the path, 0 (start) to 1 (end). */
  labelPosition?: number
  lineHeight?: number
}

export interface SpaceObject {
  id: string
  spaceId: string
  pageId: string
  userId: string
  type: SpaceObjectType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
  locked: boolean
  hidden: boolean
  groupId: string | null
  parentFrameId: string | null
  /** Type-specific payload — text, connector endpoints, file ids, and so on. */
  content: Record<string, unknown>
  style: ObjectStyle
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface StoredFile {
  id: string
  userId: string
  spaceId: string | null
  name: string
  mimeType: string
  size: number
  /** The bytes. Local adapter keeps the Blob; Supabase Storage replaces it. */
  blob: Blob
  /** First-page/preview raster, generated at upload where possible. */
  previewUrl: string | null
  pageCount: number | null
  createdAt: string
}

export interface SpaceTemplate {
  id: string
  userId: string
  name: string
  category: string
  description: string | null
  thumbnail: string | null
  /** Objects normalized so the top-left of the selection sits at (0,0). */
  objects: Omit<
    SpaceObject,
    'id' | 'spaceId' | 'pageId' | 'userId' | 'createdAt' | 'updatedAt'
  >[]
  isFavorite: boolean
  createdAt: string
}

/* ------------------------------------------------------------------ helpers */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Viewport {
  /** Canvas-space coordinate rendered at the top-left of the screen. */
  x: number
  y: number
  zoom: number
}

export const MIN_ZOOM = 0.05
export const MAX_ZOOM = 4

/** Objects that hold editable text, used for the double-click-to-edit path. */
export const TEXT_EDITABLE: SpaceObjectType[] = ['text', 'sticky', 'shape', 'frame']

export const STICKY_COLORS = [
  { name: 'Butter', fill: '#FDE9A9', text: '#4A3B12' },
  { name: 'Mint', fill: '#C9E9D2', text: '#173D28' },
  { name: 'Sky', fill: '#C9DEF3', text: '#123454' },
  { name: 'Blush', fill: '#F3CFD3', text: '#4E1A22' },
  { name: 'Lilac', fill: '#DCD2F0', text: '#2E2150' },
  { name: 'Sand', fill: '#EADDCB', text: '#463620' },
  { name: 'Slate', fill: '#D8DDE2', text: '#26313A' },
]

export const SHAPE_PRESETS: { kind: ShapeKind; label: string }[] = [
  { kind: 'rectangle', label: 'Rectangle' },
  { kind: 'rounded', label: 'Rounded rectangle' },
  { kind: 'ellipse', label: 'Ellipse' },
  { kind: 'triangle', label: 'Triangle' },
  { kind: 'diamond', label: 'Diamond' },
  { kind: 'star', label: 'Star' },
]
