/**
 * Open Library search — the free, keyless, CORS-enabled catalogue BookSpace
 * uses for book discovery and recommendations.
 *
 * No API key, no backend proxy: every call here runs directly from the
 * browser against openlibrary.org, which explicitly supports cross-origin
 * requests. Results are mapped into the same shape `addBook` already accepts,
 * tagged with `externalSource: 'openlibrary'` so re-adding a search result
 * updates the existing row instead of creating a duplicate (see
 * `findBookByExternalId` in repository.ts).
 */

export const OPEN_LIBRARY_SOURCE = 'openlibrary'

export interface DiscoveredBook {
  source: typeof OPEN_LIBRARY_SOURCE
  externalId: string
  title: string
  authors: string[]
  firstPublishYear: number | null
  coverId: number | null
  isbn: string | null
  pageCount: number | null
  subjects: string[]
  editionCount: number | null
}

interface SearchDoc {
  key: string
  title: string
  author_name?: string[]
  first_publish_year?: number
  isbn?: string[]
  cover_i?: number
  number_of_pages_median?: number
  subject?: string[]
  edition_count?: number
}

interface SearchResponse {
  numFound: number
  docs: SearchDoc[]
}

/** `/works/OL123W` → `OL123W` — the id we store as `books.externalId`. */
function workId(key: string): string {
  return key.replace(/^\/works\//, '')
}

function mapDoc(doc: SearchDoc): DiscoveredBook {
  return {
    source: OPEN_LIBRARY_SOURCE,
    externalId: workId(doc.key),
    title: doc.title,
    authors: doc.author_name ?? [],
    firstPublishYear: doc.first_publish_year ?? null,
    coverId: doc.cover_i ?? null,
    isbn: doc.isbn?.[0] ?? null,
    pageCount: doc.number_of_pages_median ?? null,
    subjects: (doc.subject ?? []).slice(0, 8),
    editionCount: doc.edition_count ?? null,
  }
}

const SEARCH_FIELDS =
  'key,title,author_name,first_publish_year,isbn,cover_i,number_of_pages_median,subject,edition_count'

export class OpenLibraryError extends Error {}

async function fetchJson<T>(url: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(url)
  } catch {
    throw new OpenLibraryError(
      'Could not reach Open Library. Check your connection and try again.',
    )
  }
  if (!response.ok) {
    throw new OpenLibraryError(`Open Library returned an error (${response.status}).`)
  }
  return response.json() as Promise<T>
}

export async function searchBooks(query: string, limit = 24): Promise<DiscoveredBook[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(trimmed)}&limit=${limit}&fields=${SEARCH_FIELDS}`
  const data = await fetchJson<SearchResponse>(url)
  return data.docs.filter((doc) => doc.title).map(mapDoc)
}

/**
 * Well-regarded works for a subject, used to power "you might also like".
 * Sorted by rating rather than Open Library's default (unsorted catalogue
 * order, which surfaces essentially random editions) so the suggestions are
 * at least plausible — subject tagging on Open Library is crowd-sourced and
 * occasionally wrong, which is why results are shown for the user to accept
 * or skip rather than added automatically.
 */
export async function worksBySubject(subject: string, limit = 10): Promise<DiscoveredBook[]> {
  const slug = subject.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^\w-]/g, '')
  if (!slug) return []
  const url = `https://openlibrary.org/subjects/${encodeURIComponent(slug)}.json?limit=${limit}&sort=rating`
  const data = await fetchJson<{
    works: {
      key: string
      title: string
      authors?: { name: string }[]
      cover_id?: number
      first_publish_year?: number
      edition_count?: number
    }[]
  }>(url)
  return (data.works ?? [])
    .filter((work) => work.title)
    .map((work) => ({
      source: OPEN_LIBRARY_SOURCE,
      externalId: workId(work.key),
      title: work.title,
      authors: work.authors?.map((a) => a.name) ?? [],
      firstPublishYear: work.first_publish_year ?? null,
      coverId: work.cover_id ?? null,
      isbn: null,
      pageCount: null,
      subjects: [subject],
      editionCount: work.edition_count ?? null,
    }))
}

/** Lazily fetched — the search endpoint doesn't carry a description. */
export async function getWorkDescription(externalId: string): Promise<string | null> {
  try {
    const data = await fetchJson<{ description?: string | { value: string } }>(
      `https://openlibrary.org/works/${encodeURIComponent(externalId)}.json`,
    )
    if (!data.description) return null
    return typeof data.description === 'string' ? data.description : data.description.value
  } catch {
    // A missing description shouldn't block adding the book.
    return null
  }
}

export function coverUrl(coverId: number | null, size: 'S' | 'M' | 'L' = 'M'): string | null {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg` : null
}
