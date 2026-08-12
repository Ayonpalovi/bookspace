import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { applyTheme, useThemeStore } from '@/stores/theme'

// Paint the stored theme before first render so there is no light-mode flash.
const { mode, accent } = useThemeStore.getState()
applyTheme(mode, accent)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
