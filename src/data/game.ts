import * as repo from './repository'
import * as spaceRepo from './spaces'
import type { GameInput } from '@/lib/game'
import type { Learning } from '@/types'

/**
 * Assembles the game layer's input from records the app already keeps.
 *
 * Nothing here writes: the game reads the same rows the reading and canvas
 * sides own, so there is exactly one underlying system (spec §33).
 */
export async function loadGameInput(userId: string): Promise<GameInput> {
  const [entries, sessions, notes, quotes, reviews, connections, activities] =
    await Promise.all([
      repo.listLibrary(userId),
      repo.listSessions(userId),
      repo.listNotes(userId),
      repo.listQuotes(userId),
      repo.listReviews(userId),
      spaceRepo.listConnections(userId),
      repo.listActivity(userId, 400),
    ])

  // Learnings are per book, so they are fetched alongside the library rather
  // than kept in a separate index.
  const learnings = (
    await Promise.all(entries.map((entry) => repo.getLearning(userId, entry.book.id)))
  ).filter((learning): learning is Learning => learning !== null)

  return { entries, sessions, notes, quotes, reviews, learnings, connections, activities }
}
