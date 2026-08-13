import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Toaster } from '@/components/ui/toast'
import { RootRedirect, SignInPage, SignUpPage } from '@/pages/AuthPages'
import { WelcomePage } from '@/pages/WelcomePage'
import { DashboardPage } from '@/pages/DashboardPage'
import { LibraryPage } from '@/pages/LibraryPage'
import { BookDetailPage } from '@/pages/BookDetailPage'
import { NotesPage } from '@/pages/NotesPage'
import { NoteDetailPage } from '@/pages/NoteDetailPage'
import { QuotesPage } from '@/pages/QuotesPage'
import { SpacesPage } from '@/pages/SpacesPage'
import { SpaceEditorPage } from '@/pages/SpaceEditorPage'
import { TemplatesPage } from '@/pages/TemplatesPage'
import { FilesPage } from '@/pages/FilesPage'
import { PlayerPage } from '@/pages/PlayerPage'
import { GoalsPage } from '@/pages/GoalsPage'
import { StatisticsPage } from '@/pages/StatisticsPage'
import { ActivityPage } from '@/pages/ActivityPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { useSession } from '@/stores/session'
import { applyTheme, useThemeStore } from '@/stores/theme'

function useThemeEffect() {
  const mode = useThemeStore((s) => s.mode)
  const accent = useThemeStore((s) => s.accent)

  useEffect(() => {
    applyTheme(mode, accent)
    if (mode !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme(mode, accent)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [mode, accent])
}

export default function App() {
  const restore = useSession((s) => s.restore)
  useThemeEffect()

  useEffect(() => {
    void restore()
  }, [restore])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/welcome" element={<WelcomePage />} />

        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/library/:filter" element={<LibraryPage />} />
          <Route path="/books/:bookId" element={<BookDetailPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/notes/:noteId" element={<NoteDetailPage />} />
          <Route path="/quotes" element={<QuotesPage />} />
          <Route path="/spaces" element={<SpacesPage />} />
          <Route path="/spaces/:spaceId" element={<SpaceEditorPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/files" element={<FilesPage />} />
          <Route path="/player" element={<PlayerPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/statistics" element={<StatisticsPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile/:username" element={<ProfilePage />} />
        </Route>

        <Route path="/404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}
