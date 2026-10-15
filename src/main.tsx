import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Development-only inspection handle for manual testing; stripped from production builds.
if (import.meta.env.DEV) {
  void Promise.all([
    import('./game/core/runtime'),
    import('./game/state/settings'),
    import('./game/state/gameStore'),
    import('./game/state/progressionStore'),
    import('./game/input/InputManager'),
  ]).then(([r, s, g, p, i]) => {
    ;(window as unknown as Record<string, unknown>).__eldoria = {
      runtime: r.runtime,
      settings: s.useSettings,
      game: g.useGame,
      progression: p.useProgression,
      input: i.input,
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
