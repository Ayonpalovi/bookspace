/**
 * Minimal promise wrapper around IndexedDB.
 *
 * Every store is keyed by `id` and indexed by `userId` where the record is
 * user-scoped, which mirrors how the Supabase tables are keyed and how RLS
 * filters them. Keeping the access shape identical means the Supabase adapter
 * can be dropped in behind the same repository interface.
 */

export const DB_NAME = 'bookspace'
export const DB_VERSION = 1

export type StoreName =
  | 'profiles'
  | 'books'
  | 'user_books'
  | 'shelves'
  | 'shelf_books'
  | 'reading_sessions'
  | 'reading_goals'
  | 'reviews'
  | 'quotes'
  | 'notes'
  | 'learnings'
  | 'activities'
  | 'tabs'
  | 'credentials'
  | 'meta'

interface StoreSpec {
  name: StoreName
  keyPath: string | string[]
  indexes?: { name: string; keyPath: string | string[]; unique?: boolean }[]
}

const STORES: StoreSpec[] = [
  {
    name: 'profiles',
    keyPath: 'id',
    indexes: [
      { name: 'by_email', keyPath: 'email', unique: true },
      { name: 'by_username', keyPath: 'username', unique: true },
    ],
  },
  { name: 'books', keyPath: 'id', indexes: [{ name: 'by_owner', keyPath: 'ownerId' }] },
  {
    name: 'user_books',
    keyPath: 'id',
    indexes: [
      { name: 'by_user', keyPath: 'userId' },
      { name: 'by_user_book', keyPath: ['userId', 'bookId'], unique: true },
    ],
  },
  { name: 'shelves', keyPath: 'id', indexes: [{ name: 'by_user', keyPath: 'userId' }] },
  {
    name: 'shelf_books',
    keyPath: ['shelfId', 'bookId'],
    indexes: [
      { name: 'by_user', keyPath: 'userId' },
      { name: 'by_shelf', keyPath: 'shelfId' },
      { name: 'by_book', keyPath: 'bookId' },
    ],
  },
  {
    name: 'reading_sessions',
    keyPath: 'id',
    indexes: [
      { name: 'by_user', keyPath: 'userId' },
      { name: 'by_book', keyPath: 'bookId' },
    ],
  },
  {
    name: 'reading_goals',
    keyPath: 'id',
    indexes: [{ name: 'by_user', keyPath: 'userId' }],
  },
  {
    name: 'reviews',
    keyPath: 'id',
    indexes: [
      { name: 'by_user', keyPath: 'userId' },
      { name: 'by_user_book', keyPath: ['userId', 'bookId'], unique: true },
    ],
  },
  {
    name: 'quotes',
    keyPath: 'id',
    indexes: [
      { name: 'by_user', keyPath: 'userId' },
      { name: 'by_book', keyPath: 'bookId' },
    ],
  },
  {
    name: 'notes',
    keyPath: 'id',
    indexes: [
      { name: 'by_user', keyPath: 'userId' },
      { name: 'by_book', keyPath: 'bookId' },
    ],
  },
  {
    name: 'learnings',
    keyPath: 'id',
    indexes: [
      { name: 'by_user', keyPath: 'userId' },
      { name: 'by_user_book', keyPath: ['userId', 'bookId'], unique: true },
    ],
  },
  {
    name: 'activities',
    keyPath: 'id',
    indexes: [{ name: 'by_user', keyPath: 'userId' }],
  },
  { name: 'tabs', keyPath: 'id', indexes: [{ name: 'by_user', keyPath: 'userId' }] },
  { name: 'credentials', keyPath: 'email' },
  { name: 'meta', keyPath: 'key' },
]

let dbPromise: Promise<IDBDatabase> | null = null

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const spec of STORES) {
        const store = db.objectStoreNames.contains(spec.name)
          ? request.transaction!.objectStore(spec.name)
          : db.createObjectStore(spec.name, { keyPath: spec.keyPath })
        for (const index of spec.indexes ?? []) {
          if (!store.indexNames.contains(index.name)) {
            store.createIndex(index.name, index.keyPath, { unique: index.unique })
          }
        }
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () =>
      reject(new Error('BookSpace database is open in another tab. Close it and reload.'))
  })
  return dbPromise
}

async function withStore<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest | Promise<T>,
): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode)
    let result: T
    const maybeRequest = fn(tx.objectStore(store))
    if (maybeRequest instanceof IDBRequest) {
      maybeRequest.onsuccess = () => {
        result = maybeRequest.result as T
      }
      maybeRequest.onerror = () => reject(maybeRequest.error)
    }
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))
  })
}

export function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return withStore<T | undefined>(store, 'readonly', (s) => s.get(key))
}

export function getAll<T>(store: StoreName): Promise<T[]> {
  return withStore<T[]>(store, 'readonly', (s) => s.getAll())
}

export function getAllByIndex<T>(
  store: StoreName,
  index: string,
  value: IDBValidKey,
): Promise<T[]> {
  return withStore<T[]>(store, 'readonly', (s) => s.index(index).getAll(value))
}

export function getByIndex<T>(
  store: StoreName,
  index: string,
  value: IDBValidKey,
): Promise<T | undefined> {
  return withStore<T | undefined>(store, 'readonly', (s) => s.index(index).get(value))
}

export async function put<T>(store: StoreName, value: T): Promise<T> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(value)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))
  })
  return value
}

export async function putMany<T>(store: StoreName, values: T[]): Promise<void> {
  if (!values.length) return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const objectStore = tx.objectStore(store)
    for (const value of values) objectStore.put(value)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))
  })
}

export function remove(store: StoreName, key: IDBValidKey): Promise<void> {
  return withStore<void>(store, 'readwrite', (s) => s.delete(key))
}

export async function removeWhere<T>(
  store: StoreName,
  predicate: (value: T) => boolean,
  keyOf: (value: T) => IDBValidKey,
): Promise<number> {
  const all = await getAll<T>(store)
  const doomed = all.filter(predicate)
  if (!doomed.length) return 0
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const objectStore = tx.objectStore(store)
    for (const value of doomed) objectStore.delete(keyOf(value))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  return doomed.length
}

export async function count(store: StoreName): Promise<number> {
  return withStore<number>(store, 'readonly', (s) => s.count())
}

export async function clearAll(): Promise<void> {
  const db = await openDb()
  const names = Array.from(db.objectStoreNames)
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite')
    for (const name of names) tx.objectStore(name).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
