import { Component, useState, type ReactNode } from 'react'
import type { FatalError } from '../../game/state/gameStore'

export function LoadingScreen({ label, progress, done }: { label: string; progress: number; done: boolean }) {
  return (
    <div className={`loading${done ? ' done' : ''}`} role="status" aria-live="polite" aria-busy={!done}>
      <div className="loading-inner">
        <h1 className="title-mark">Eldoria</h1>
        <div className="subtitle">Academy of Arcane Arts</div>
        <div className="progress" aria-hidden>
          <div style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <div className="muted" style={{ fontSize: '0.85rem' }}>
          {label}… {Math.round(progress * 100)}%
        </div>
      </div>
    </div>
  )
}

export function FatalErrorScreen({ error }: { error: FatalError }) {
  return (
    <div className="fatal" role="alert">
      <div className="panel">
        <h2 className="panel-title">{error.title}</h2>
        <p>{error.message}</p>
        {error.detail && <pre>{error.detail}</pre>}
        <button type="button" className="btn btn-small btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    </div>
  )
}

/** Catches render errors anywhere in the tree and shows a useful message instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode; title?: string }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error('[eldoria] unhandled render error', error)
  }
  render() {
    if (this.state.error) {
      return (
        <FatalErrorScreen
          error={{
            title: this.props.title ?? 'Something went wrong',
            message: 'The game hit an unexpected error. Reloading usually fixes it; your progress is saved at each checkpoint.',
            detail: String(this.state.error?.stack ?? this.state.error),
          }}
        />
      )
    }
    return this.props.children
  }
}

/** Shown on small or touch-only screens, which the desktop controls cannot support well. */
export function SmallScreenNotice() {
  const [dismissed, setDismissed] = useState(false)
  const small = typeof window !== 'undefined' && (window.innerWidth < 900 || window.innerHeight < 500)
  const touchOnly = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches && !window.matchMedia?.('(pointer: fine)').matches
  if (dismissed || (!small && !touchOnly)) return null
  return (
    <div className="overlay-backdrop" style={{ zIndex: 60 }}>
      <div className="panel modal" style={{ width: 'min(420px, calc(100vw - 32px))' }} role="alertdialog" aria-label="Device notice">
        <h2 className="panel-title">Best on a desktop</h2>
        <p>Eldoria is a 3D game designed for a keyboard, a mouse and a larger screen. {touchOnly ? 'Touch controls are not supported yet.' : 'Your window is quite small.'}</p>
        <p className="muted">You can continue, but the interface may be cramped and performance limited.</p>
        <button type="button" className="btn btn-small btn-primary" onClick={() => setDismissed(true)}>
          Continue anyway
        </button>
      </div>
    </div>
  )
}

/** Detects WebGL 2 support without leaking a context. */
export function detectWebGL(): { ok: true } | { ok: false; reason: string } {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    if (!gl) return { ok: false, reason: 'WebGL 2 is not available. It may be disabled, blocked by your browser, or unsupported by your graphics driver.' }
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: `WebGL initialisation failed: ${String(err)}` }
  }
}
