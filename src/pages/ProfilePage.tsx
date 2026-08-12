import { Link, useParams } from 'react-router-dom'
import { BookCover } from '@/components/books/BookCover'
import { Button } from '@/components/ui/button'
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  PageLoader,
  SectionHeading,
  StarRating,
  Stat,
} from '@/components/ui/primitives'
import { useAsync } from '@/hooks/useAsync'
import { useTab } from '@/hooks/useTab'
import * as repo from '@/data/repository'
import { useSession } from '@/stores/session'
import { useVersion } from '@/stores/data'
import { formatDate, formatNumber } from '@/lib/utils'

export function ProfilePage() {
  const { username = '' } = useParams()
  const profile = useSession((s) => s.profile)!
  const libraryVersion = useVersion('library')
  const isSelf = profile.username === username

  useTab({ title: isSelf ? 'Your profile' : `@${username}`, kind: 'page', icon: 'home' })

  const { data, loading } = useAsync(
    async () => {
      if (!isSelf) return null
      const [entries, stats, reviews, goal] = await Promise.all([
        repo.listLibrary(profile.id),
        repo.getStats(profile.id),
        repo.listReviews(profile.id),
        repo.getGoal(profile.id, 'year', 'books'),
      ])
      return { entries, stats, reviews, goal }
    },
    [profile.id, isSelf, libraryVersion],
  )

  if (!isSelf) {
    return (
      <div className="p-8">
        <EmptyState
          title="This profile isn't available"
          description="Following other readers and public profiles arrive with the social features. For now only your own profile exists."
          actions={
            <Button asChild variant="primary">
              <Link to={`/profile/${profile.username}`}>Go to your profile</Link>
            </Button>
          }
        />
      </div>
    )
  }

  if (loading && !data) return <PageLoader label="Loading profile" />
  if (!data) return null

  const { entries, stats, reviews, goal } = data
  const favorites = entries.filter((e) => e.userBook.isFavorite).slice(0, 6)
  const recentlyFinished = entries
    .filter((e) => e.userBook.status === 'finished')
    .sort((a, b) =>
      (b.userBook.dateFinished ?? '').localeCompare(a.userBook.dateFinished ?? ''),
    )
    .slice(0, 6)
  const bookById = new Map(entries.map((e) => [e.book.id, e.book]))

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex flex-wrap items-start gap-5">
        <Avatar name={profile.displayName} src={profile.avatarUrl} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-[26px] leading-tight tracking-tight">
            {profile.displayName}
          </h1>
          <p className="text-[13px] text-text-faint">@{profile.username}</p>
          {profile.bio && (
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-text-muted">
              {profile.bio}
            </p>
          )}
          {profile.favoriteGenres.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {profile.favoriteGenres.map((genre) => (
                <Badge key={genre} tone="outline">
                  {genre}
                </Badge>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-text-faint">
            Reading here since {formatDate(profile.createdAt)}
          </p>
        </div>
        <Button asChild>
          <Link to="/settings">Edit profile</Link>
        </Button>
      </div>

      <Card className="my-8 grid grid-cols-2 gap-5 p-5 sm:grid-cols-4">
        <Stat label="Books read" value={stats.booksFinishedAllTime} />
        <Stat label="Pages read" value={formatNumber(stats.pagesReadAllTime)} />
        <Stat
          label={`${new Date().getFullYear()} goal`}
          value={goal ? `${stats.booksFinishedThisYear}/${goal.target}` : '—'}
        />
        <Stat
          label="Average rating"
          value={stats.averageRating ? stats.averageRating.toFixed(1) : '—'}
        />
      </Card>

      {favorites.length > 0 && (
        <section className="mb-8">
          <SectionHeading title="Favorites" />
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
            {favorites.map((entry) => (
              <Link key={entry.book.id} to={`/books/${entry.book.id}`} className="group">
                <BookCover
                  book={entry.book}
                  className="transition-transform group-hover:-translate-y-0.5"
                />
                <p className="mt-2 truncate text-[12px] text-text-muted">
                  {entry.book.title}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {recentlyFinished.length > 0 && (
        <section className="mb-8">
          <SectionHeading title="Recently finished" />
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
            {recentlyFinished.map((entry) => (
              <Link key={entry.book.id} to={`/books/${entry.book.id}`} className="group">
                <BookCover
                  book={entry.book}
                  className="transition-transform group-hover:-translate-y-0.5"
                />
                <p className="mt-2 truncate text-[12px] text-text-muted">
                  {entry.book.title}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHeading
          title="Your reviews"
          description="Private to you until sharing arrives."
        />
        {reviews.length === 0 ? (
          <EmptyState
            title="No reviews written yet"
            description="Open a finished book and use the Review tab."
          />
        ) : (
          <div className="space-y-3">
            {reviews.slice(0, 5).map((review) => {
              const book = bookById.get(review.bookId)
              return (
                <Card key={review.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {review.title && (
                        <p className="font-serif text-[17px] tracking-tight">
                          {review.title}
                        </p>
                      )}
                      {book && (
                        <Link
                          to={`/books/${book.id}`}
                          className="text-[13px] text-text-muted hover:text-accent hover:underline"
                        >
                          {book.title}
                        </Link>
                      )}
                    </div>
                    <StarRating value={review.rating} size={14} />
                  </div>
                  {review.body && (
                    <p className="mt-3 line-clamp-4 text-[13px] leading-relaxed text-text-muted">
                      {review.body}
                    </p>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
