import { useEffect, useState } from 'react'
import { useHud } from '../../game/state/hudStore'
import { useGame } from '../../game/state/gameStore'
import { useProgression } from '../../game/state/progressionStore'
import { useSettings } from '../../game/state/settings'
import { SPELLS, findSpell } from '../../game/spells/registry'
import { activeQuests, currentObjective, objectiveTarget, questStatus, type Progression } from '../../game/quests/questEngine'
import { keyLabel } from '../../game/input/bindings'
import { runtime } from '../../game/core/runtime'
import { wrapAngle } from '../../game/core/math'
import { FLIGHT_PLATFORM, FLIGHT_RINGS, SECRETS, TRAINING_YARD } from '../../game/world/layout'
import { NPCS } from '../../game/npc/NPCs'
import { lockOrPrompt } from '../../game/session'

type Point = [number, number]

/** World position the current objective points to, for the compass. */
function objectivePosition(p: Progression): { label: string; at: Point } | null {
  const q = activeQuests(p)[0]
  if (!q) {
    if (questStatus(p, 'first-spark') === 'available') return { label: 'Magister Vale', at: [NPCS[0].position[0], NPCS[0].position[2]] }
    return null
  }
  const o = currentObjective(p, q.id)
  if (!o) return null
  const npc = (id: string) => NPCS.find((n) => n.id === id)
  switch (o.kind) {
    case 'talk': {
      const n = npc(o.npcId)
      return n ? { label: 'Talk', at: [n.position[0], n.position[2]] } : null
    }
    case 'spellHit':
      return { label: 'Targets', at: [(TRAINING_YARD.minX + TRAINING_YARD.maxX) / 2, (TRAINING_YARD.minZ + TRAINING_YARD.maxZ) / 2] }
    case 'collect':
      return { label: 'Codex', at: [-43, -40] }
    case 'rings': {
      const i = FLIGHT_RINGS.findIndex((_, idx) => !p.ringsCollected.includes(idx))
      return i >= 0 ? { label: 'Ring', at: [FLIGHT_RINGS[i][0], FLIGHT_RINGS[i][2]] } : null
    }
    case 'reach':
      return { label: 'Platform', at: FLIGHT_PLATFORM.center }
    default:
      return null
  }
}

const PX_PER_RAD = 115

function Compass() {
  const heading = -useHud((s) => s.heading)
  const progression = useProgression((s) => s.progression)
  const hasLens = progression.artifacts.includes('cartographers-lens')
  const pos = runtime.player.position
  const bearingTo = (x: number, z: number) => Math.atan2(x - pos.x, -(z - pos.z))
  const marks: Array<{ label: string; bearing: number; cls: string }> = [
    { label: 'N', bearing: 0, cls: 'cardinal' },
    { label: 'E', bearing: Math.PI / 2, cls: 'cardinal' },
    { label: 'S', bearing: Math.PI, cls: 'cardinal' },
    { label: 'W', bearing: -Math.PI / 2, cls: 'cardinal' },
    { label: 'Castle', bearing: bearingTo(0, -26), cls: '' },
  ]
  const obj = objectivePosition(progression)
  if (obj) marks.push({ label: `◆ ${obj.label}`, bearing: bearingTo(obj.at[0], obj.at[1]), cls: 'target' })
  if (hasLens) {
    for (const s of SECRETS) if (!progression.secretsFound.includes(s.id)) marks.push({ label: '✦', bearing: bearingTo(s.position[0], s.position[2]), cls: 'secret' })
  }
  return (
    <div className="compass" aria-hidden>
      <div className="compass-strip">
        {marks.map((m, i) => {
          const d = wrapAngle(m.bearing - heading)
          if (Math.abs(d) > 1.6) return null
          return (
            <span key={i} className={`compass-mark ${m.cls}`} style={{ left: d * PX_PER_RAD }}>
              {m.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function ObjectiveTracker() {
  const progression = useProgression((s) => s.progression)
  const q = activeQuests(progression)[0]
  if (!q) {
    const next = questStatus(progression, 'first-spark') === 'available' ? 'Find Magister Vale at the Practice Grounds, east of the courtyard.' : null
    if (!next) return null
    return (
      <div className="objective">
        <h3>Next</h3>
        <p>{next}</p>
      </div>
    )
  }
  const o = currentObjective(progression, q.id)
  const qp = progression.quests[q.id]
  const target = o ? objectiveTarget(o) : 1
  return (
    <div className="objective" aria-live="polite">
      <h3>{q.title}</h3>
      <p>
        {o?.text}
        {target > 1 && ` (${qp?.count ?? 0}/${target})`}
      </p>
    </div>
  )
}

function Toasts() {
  const notifications = useHud((s) => s.notifications)
  const dismiss = useHud((s) => s.dismiss)
  useEffect(() => {
    if (!notifications.length) return
    const oldest = notifications[0]
    const left = 5500 - (Date.now() - oldest.createdAt)
    const id = window.setTimeout(() => dismiss(oldest.id), Math.max(200, left))
    return () => window.clearTimeout(id)
  }, [notifications, dismiss])
  return (
    <div className="toasts" aria-live="polite">
      {notifications.map((n) => (
        <div key={n.id} className={`toast ${n.kind}`}>
          <strong>{n.title}</strong>
          {n.body && <span>{n.body}</span>}
        </div>
      ))}
    </div>
  )
}

function SpellBar() {
  const selected = useHud((s) => s.selectedSpell)
  const cooldowns = useHud((s) => s.cooldowns)
  const unlocked = useProgression((s) => s.progression.unlockedSpells)
  const fizzle = useHud((s) => s.lastFizzle)
  const [, force] = useState(0)
  useEffect(() => {
    if (!fizzle) return
    const id = window.setTimeout(() => force((n) => n + 1), 2200)
    return () => window.clearTimeout(id)
  }, [fizzle])
  const showFizzle = fizzle && Date.now() - fizzle.at < 2000
  const glyph: Record<string, string> = { 'arc-bolt': 'ϟ', 'force-wave': '◎', 'aegis-shield': '⛉', 'luminous-orb': '✺', 'mystic-pull': '⟲', 'blink-step': '➶' }
  return (
    <>
      {showFizzle && <div className="fizzle">{fizzle.text}</div>}
      <div className="spell-name">{findSpell(selected)?.name}</div>
      <div className="spellbar">
        {SPELLS.map((s, i) => {
          const known = unlocked.includes(s.id)
          const cd = cooldowns[s.id] ?? 0
          return (
            <div key={s.id} className={`spell-slot${selected === s.id ? ' selected' : ''}${known ? '' : ' locked'}`} title={s.name}>
              <span className="key">{i + 1}</span>
              <span style={{ fontSize: '1.4rem', color: known ? s.visual.color : 'var(--stone-400)' }}>{known ? glyph[s.id] : '·'}</span>
              {cd > 0 && <div className="cooldown" style={{ transform: `scaleY(${cd})` }} />}
            </div>
          )
        })}
      </div>
    </>
  )
}

function Vitals() {
  const health = useHud((s) => s.health)
  const maxHealth = useHud((s) => s.maxHealth)
  const mana = useHud((s) => s.mana)
  const maxMana = useHud((s) => s.maxMana)
  const shield = useHud((s) => s.shieldActive)
  return (
    <div className="hud-bottom-left">
      <div>
        <div className="bar-label">
          <span>Vitality{shield ? ' · Shielded' : ''}</span>
          <span>{health}</span>
        </div>
        <div className="bar">
          <i style={{ width: `${(health / maxHealth) * 100}%`, background: shield ? 'linear-gradient(90deg,#3c9c84,#7fe3c4)' : 'linear-gradient(90deg,#7a2a26,var(--health))' }} />
        </div>
      </div>
      <div>
        <div className="bar-label">
          <span>Mana</span>
          <span>{mana}</span>
        </div>
        <div className="bar">
          <i style={{ width: `${(mana / maxMana) * 100}%`, background: 'linear-gradient(90deg,#2b4a8a,var(--mana))' }} />
        </div>
      </div>
    </div>
  )
}

function FlightIndicator() {
  const state = useHud((s) => s.flightState)
  const speed = useHud((s) => s.flightSpeed)
  const altitude = useHud((s) => s.altitude)
  const rings = useHud((s) => s.ringsCollected)
  const total = useHud((s) => s.ringsTotal)
  if (state === 'Grounded') return null
  const label: Record<string, string> = {
    Summoning: 'Summoning broom',
    Mounting: 'Mounting',
    TakingOff: 'Taking off',
    Flying: 'Flying',
    Landing: 'Landing',
    Dismounting: 'Dismounting',
  }
  return (
    <div className="flight-indicator">
      <div className="muted" style={{ letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: '0.75rem' }}>
        {label[state]}
      </div>
      <div className="speed">{speed} km/h</div>
      <div className="muted">Altitude {altitude} m</div>
      <div className="muted">
        Rings {rings}/{total}
      </div>
    </div>
  )
}

function ControlsHint() {
  const flying = useHud((s) => s.flightState) !== 'Grounded'
  const b = useSettings((s) => s.controls.bindings)
  const k = (codes: string[]) => (
    <span className="kbd" style={{ marginRight: 2 }}>
      {codes.map(keyLabel).join('/')}
    </span>
  )
  if (flying) {
    return (
      <div className="controls-hint">
        {k([b.moveForward[0]])} faster {k([b.moveBack[0]])} brake {k([b.moveLeft[0], b.moveRight[0]])} steer · Mouse aims
        <br />
        {k(b.ascend)} climb {k(b.descend)} descend {k(b.sprint.slice(0, 1))} boost {k(b.toggleBroom)} land
      </div>
    )
  }
  return (
    <div className="controls-hint">
      {k([b.moveForward[0], b.moveLeft[0], b.moveBack[0], b.moveRight[0]])} move {k(b.sprint.slice(0, 1))} sprint {k(b.jump)} jump {k(b.interact)} interact
      <br />
      <span className="kbd">RMB</span> aim <span className="kbd">LMB</span> cast {k(['Digit1', 'Digit6'])} spells {k(b.toggleBroom)} broom
      <br />
      {k(b.spellbook)} spellbook {k(b.journal)} journal {k(b.inventory)} artefacts <span className="kbd">Esc</span> pause
    </div>
  )
}

export function HUD() {
  const prompt = useHud((s) => s.prompt)
  const aiming = useHud((s) => s.aiming)
  const area = useHud((s) => s.areaName)
  const health = useHud((s) => s.health)
  const flightState = useHud((s) => s.flightState)
  const overlay = useGame((s) => s.overlay)
  const needsClick = useGame((s) => s.needsClickToResume)
  const locked = useGame((s) => s.pointerLocked)
  const interactKey = useSettings((s) => s.controls.bindings.interact[0])

  return (
    <div className="hud">
      <div className="vignette-damage" style={{ opacity: health < 40 ? (40 - health) / 40 : 0 }} />
      <Compass />
      {area && <div className="area-name">{area}</div>}
      <ObjectiveTracker />
      <ControlsHint />
      <Toasts />
      <Vitals />
      <SpellBar />
      <FlightIndicator />
      {overlay === null && <div className={`crosshair${aiming || flightState !== 'Grounded' ? '' : ' dot'}`} />}
      {overlay === null && prompt && (
        <div className="prompt">
          <span className="kbd">{keyLabel(interactKey ?? 'KeyE')}</span> {prompt.verb} <strong>{prompt.label}</strong>
        </div>
      )}
      {overlay === null && needsClick && !locked && (
        <button type="button" className="panel click-resume btn" onClick={lockOrPrompt}>
          Click to continue
        </button>
      )}
    </div>
  )
}
