import { useEffect, useMemo, useRef } from 'react'
import { useGame } from '../../game/state/gameStore'
import { hasValidSave } from '../../game/quests/saveSystem'
import { continueGame, startNewGame } from '../../game/session'
import { events } from '../../game/core/events'
import { SettingsPanel } from './SettingsPanel'
import { Credits } from './Credits'

/** Title screen over the live, slowly orbiting castle view. */
export function MainMenu() {
  const screen = useGame((s) => s.menuScreen)
  const setScreen = useGame((s) => s.setMenuScreen)
  const canContinue = useMemo(() => hasValidSave(), [screen])
  const first = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (screen === 'main') first.current?.focus()
  }, [screen])

  const click = (fn: () => void) => () => {
    events.emit({ type: 'ui:click' })
    fn()
  }

  if (screen === 'settings') {
    return (
      <div className="overlay-backdrop">
        <SettingsPanel onClose={() => setScreen('main')} />
      </div>
    )
  }
  if (screen === 'credits') {
    return (
      <div className="overlay-backdrop">
        <Credits onClose={() => setScreen('main')} />
      </div>
    )
  }

  return (
    <div className="main-menu">
      <div className="main-menu-inner">
        <h1 className="title-mark">Eldoria</h1>
        <div className="subtitle">Academy of Arcane Arts</div>
        <nav aria-label="Main menu">
          <button ref={first} type="button" className="btn btn-primary" onClick={click(startNewGame)}>
            Start New Game
          </button>
          <button
            type="button"
            className="btn"
            disabled={!canContinue}
            title={canContinue ? 'Resume from your last checkpoint' : 'No saved game yet'}
            onClick={click(() => continueGame())}
          >
            Continue
          </button>
          <button type="button" className="btn" onClick={click(() => setScreen('settings'))}>
            Settings
          </button>
          <button type="button" className="btn" onClick={click(() => setScreen('credits'))}>
            Credits
          </button>
        </nav>
        <p className="muted" style={{ marginTop: 28, fontSize: '0.82rem', lineHeight: 1.6 }}>
          Best with a keyboard and mouse. Click Start, then use WASD to move and the mouse to look.
        </p>
      </div>
      <footer className="muted">Prototype build. All art and audio are generated in the browser.</footer>
    </div>
  )
}
