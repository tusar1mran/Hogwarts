import { useEffect, useRef, useState } from 'react'
import { useGame } from '../../game/state/gameStore'
import { useProgression } from '../../game/state/progressionStore'
import { useHud } from '../../game/state/hudStore'
import { SPELLS } from '../../game/spells/registry'
import { selectSpell } from '../../game/spells/SpellRuntime'
import { ARTIFACTS, QUESTS, XP_PER_LEVEL, levelForXp } from '../../game/quests/questData'
import { objectiveTarget, questStatus } from '../../game/quests/questEngine'
import { SECRETS } from '../../game/world/layout'
import { returnToMenu, resumeGame } from '../../game/session'
import { events } from '../../game/core/events'
import { SettingsPanel } from './SettingsPanel'

const click = (fn: () => void) => () => {
  events.emit({ type: 'ui:click' })
  fn()
}

function useAutofocus<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => ref.current?.focus(), [])
  return ref
}

export function PauseMenu() {
  const open = useGame((s) => s.openOverlay)
  const xp = useProgression((s) => s.progression.xp)
  const first = useAutofocus<HTMLButtonElement>()
  const [confirmQuit, setConfirmQuit] = useState(false)
  return (
    <div className="panel modal" style={{ width: 'min(400px, calc(100vw - 32px))' }} role="dialog" aria-label="Paused">
      <h2 className="panel-title">Paused</h2>
      <div className="stat-row" style={{ marginBottom: 10 }}>
        <span>Level {levelForXp(xp)}</span>
        <span>
          {xp % XP_PER_LEVEL} / {XP_PER_LEVEL} XP
        </span>
      </div>
      <nav style={{ display: 'grid', gap: 2 }}>
        <button ref={first} type="button" className="btn btn-primary" onClick={resumeGame}>
          Resume
        </button>
        <button type="button" className="btn" onClick={click(() => open('spellbook'))}>
          Spellbook
        </button>
        <button type="button" className="btn" onClick={click(() => open('journal'))}>
          Quest Journal
        </button>
        <button type="button" className="btn" onClick={click(() => open('inventory'))}>
          Artefacts
        </button>
        <button type="button" className="btn" onClick={click(() => open('settings'))}>
          Settings
        </button>
        {confirmQuit ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 14px' }}>
            <span className="muted">Progress is saved. Return to the title?</span>
            <button type="button" className="btn btn-small" onClick={click(returnToMenu)}>
              Yes
            </button>
            <button type="button" className="btn btn-small" onClick={() => setConfirmQuit(false)}>
              No
            </button>
          </div>
        ) : (
          <button type="button" className="btn" onClick={() => setConfirmQuit(true)}>
            Return to Main Menu
          </button>
        )}
      </nav>
    </div>
  )
}

function CloseButton() {
  const open = useGame((s) => s.openOverlay)
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button type="button" className="btn btn-small" onClick={click(() => open('pause'))}>
        Menu
      </button>
      <button type="button" className="btn btn-small" onClick={resumeGame}>
        Resume
      </button>
    </div>
  )
}

export function Spellbook() {
  const unlocked = useProgression((s) => s.progression.unlockedSpells)
  const selected = useHud((s) => s.selectedSpell)
  return (
    <div className="panel modal" role="dialog" aria-label="Spellbook">
      <div className="modal-header">
        <h2 className="panel-title">Spellbook</h2>
        <CloseButton />
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Choose the spell bound to the left mouse button. Number keys 1-6 also select spells.
      </p>
      <div className="grid-cards">
        {SPELLS.map((s, i) => {
          const known = unlocked.includes(s.id)
          return (
            <div key={s.id} className={`card${known ? '' : ' locked'}`} style={selected === s.id ? { borderColor: 'var(--gold-bright)' } : undefined}>
              <h4>
                <span className="kbd" style={{ marginRight: 6 }}>
                  {i + 1}
                </span>
                {s.name}
              </h4>
              <p style={{ fontSize: '0.86rem', margin: '0 0 8px' }}>{known ? s.description : 'Not yet learned.'}</p>
              <div className="stat-row">
                <span>{s.cost} mana</span>
                <span>{s.cooldown}s cooldown</span>
                {s.range > 0 && <span>{s.range} m</span>}
              </div>
              {known && (
                <button type="button" className="btn btn-small" style={{ marginTop: 8 }} disabled={selected === s.id} onClick={click(() => selectSpell(s.id))}>
                  {selected === s.id ? 'Equipped' : 'Equip'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function QuestJournal() {
  const progression = useProgression((s) => s.progression)
  const [current, setCurrent] = useState(() => QUESTS.find((q) => progression.quests[q.id]?.status === 'active')?.id ?? QUESTS[0].id)
  const quest = QUESTS.find((q) => q.id === current) ?? QUESTS[0]
  const status = questStatus(progression, quest.id)
  const qp = progression.quests[quest.id]
  return (
    <div className="panel modal" role="dialog" aria-label="Quest journal">
      <div className="modal-header">
        <h2 className="panel-title">Quest Journal</h2>
        <CloseButton />
      </div>
      <div className="two-col">
        <div>
          {QUESTS.map((q) => {
            const st = questStatus(progression, q.id)
            return (
              <button key={q.id} type="button" className="list-item" aria-current={q.id === current} onClick={() => setCurrent(q.id)}>
                {q.title}
                <small>{st === 'available' ? 'Not started' : st === 'active' ? 'In progress' : 'Completed'}</small>
              </button>
            )
          })}
        </div>
        <div>
          <h3 style={{ margin: '4px 0', fontFamily: 'var(--font-display)', fontWeight: 'normal', color: 'var(--gold-bright)' }}>{quest.title}</h3>
          <p>{quest.summary}</p>
          {status === 'available' ? (
            <p className="muted">Find {quest.objectives[0].kind === 'talk' ? quest.objectives[0].text.replace(/^Speak to /, '') : 'the quest giver'} to begin.</p>
          ) : (
            <ul className="objective-list">
              {quest.objectives.map((o, i) => {
                const done = status === 'completed' || (qp && i < qp.stage)
                const isCurrent = status === 'active' && qp?.stage === i
                const target = objectiveTarget(o)
                return (
                  <li key={o.id} className={done ? 'done' : isCurrent ? 'current' : ''}>
                    {o.text}
                    {isCurrent && target > 1 && ` (${qp?.count ?? 0}/${target})`}
                  </li>
                )
              })}
            </ul>
          )}
          <hr className="rule" />
          <p className="muted" style={{ fontSize: '0.86rem' }}>
            Reward: {quest.reward.xp} XP. {status === 'completed' ? quest.reward.message : ''}
          </p>
        </div>
      </div>
    </div>
  )
}

export function Inventory() {
  const progression = useProgression((s) => s.progression)
  const hasLens = progression.artifacts.includes('cartographers-lens')
  return (
    <div className="panel modal" role="dialog" aria-label="Artefacts">
      <div className="modal-header">
        <h2 className="panel-title">Artefacts</h2>
        <CloseButton />
      </div>
      <div className="grid-cards">
        {ARTIFACTS.map((a) => {
          const owned = progression.artifacts.includes(a.id)
          return (
            <div key={a.id} className={`card${owned ? '' : ' locked'}`}>
              <h4>{owned ? a.name : 'Undiscovered'}</h4>
              <p style={{ fontSize: '0.86rem', margin: 0 }}>{owned ? a.description : 'Keep exploring.'}</p>
            </div>
          )
        })}
      </div>
      <hr className="rule" />
      <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 'normal', color: 'var(--gold)' }}>
        Secrets discovered: {progression.secretsFound.length} / {SECRETS.length}
      </h3>
      <ul className="objective-list">
        {SECRETS.map((s) => {
          const found = progression.secretsFound.includes(s.id)
          return (
            <li key={s.id} className={found ? 'done' : ''} style={found ? { textDecoration: 'none' } : undefined}>
              {found ? s.name : hasLens ? `Unknown place. Hint: ${s.hint}` : 'Unknown place'}
            </li>
          )
        })}
      </ul>
      <p className="muted" style={{ fontSize: '0.84rem' }}>
        Spectral runes revealed: {progression.runesRevealed.length} / 2. Rings this course: {progression.ringsCollected.length}.
      </p>
    </div>
  )
}

/** Renders whichever in-game overlay is open. */
export function GameOverlays() {
  const overlay = useGame((s) => s.overlay)
  const open = useGame((s) => s.openOverlay)
  if (!overlay || overlay === 'dialogue') return null
  return (
    <div className="overlay-backdrop">
      {overlay === 'pause' && <PauseMenu />}
      {overlay === 'spellbook' && <Spellbook />}
      {overlay === 'journal' && <QuestJournal />}
      {overlay === 'inventory' && <Inventory />}
      {overlay === 'settings' && <SettingsPanel onClose={() => open('pause')} />}
    </div>
  )
}
