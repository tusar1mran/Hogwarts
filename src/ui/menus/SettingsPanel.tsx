import { useEffect, useState } from 'react'
import { useSettings, type QualityPreset } from '../../game/state/settings'
import { useGame, type SettingsTab } from '../../game/state/gameStore'
import { ACTION_META, ACTIONS, RESERVED_CODES, findConflicts, keyLabel, type Action } from '../../game/input/bindings'

function Slider({ label, value, min, max, step, onChange, format, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string; hint?: string }) {
  const id = `s-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} <span className="muted">{format ? format(value) : value}</span>
        {hint && <span className="hint">{hint}</span>}
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = `t-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {hint && <span className="hint">{hint}</span>}
      </label>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </div>
  )
}

const pct = (v: number) => `${Math.round(v * 100)}%`

function GraphicsTab() {
  const g = useSettings((s) => s.graphics)
  const setGraphics = useSettings((s) => s.setGraphics)
  const applyPreset = useSettings((s) => s.applyQualityPreset)
  return (
    <div>
      <div className="field">
        <label htmlFor="quality">
          Quality preset<span className="hint">Sets shadows, bloom, resolution and draw distance.</span>
        </label>
        <select id="quality" value={g.quality} onChange={(e) => applyPreset(e.target.value as QualityPreset)}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <Toggle label="Shadows" checked={g.shadows} onChange={(v) => setGraphics({ shadows: v })} />
      <Toggle label="Bloom and vignette" checked={g.bloom} onChange={(v) => setGraphics({ bloom: v })} hint="Post-processing glow on magic and lights." />
      <Slider label="Resolution scale" value={g.resolutionScale} min={0.5} max={1} step={0.05} onChange={(v) => setGraphics({ resolutionScale: v })} format={pct} />
      <Toggle label="Adaptive resolution" checked={g.adaptiveResolution} onChange={(v) => setGraphics({ adaptiveResolution: v })} hint="Lowers resolution automatically when the frame rate drops." />
      <Slider label="Field of view" value={g.fov} min={45} max={90} step={1} onChange={(v) => setGraphics({ fov: v })} format={(v) => `${v}°`} />
      <Slider label="View distance" value={g.viewDistance} min={250} max={1200} step={50} onChange={(v) => setGraphics({ viewDistance: v })} format={(v) => `${v} m`} />
      <Toggle label="Performance overlay" checked={g.showDebug} onChange={(v) => setGraphics({ showDebug: v })} hint="Frame rate, frame time, draw calls (also F3)." />
    </div>
  )
}

function AudioTab() {
  const a = useSettings((s) => s.audio)
  const setAudio = useSettings((s) => s.setAudio)
  return (
    <div>
      <Slider label="Master volume" value={a.master} min={0} max={1} step={0.05} onChange={(v) => setAudio({ master: v })} format={pct} />
      <Slider label="Music" value={a.music} min={0} max={1} step={0.05} onChange={(v) => setAudio({ music: v })} format={pct} />
      <Slider label="Sound effects" value={a.sfx} min={0} max={1} step={0.05} onChange={(v) => setAudio({ sfx: v })} format={pct} />
      <Slider label="Ambience" value={a.ambient} min={0} max={1} step={0.05} onChange={(v) => setAudio({ ambient: v })} format={pct} />
      <Toggle label="Mute all" checked={a.muted} onChange={(v) => setAudio({ muted: v })} />
      <p className="muted" style={{ fontSize: '0.82rem' }}>
        Sound starts after your first click or key press, as browsers require. Music and effects are synthesised unless licensed audio files are installed (see ASSETS.md).
      </p>
    </div>
  )
}

function ControlsTab() {
  const c = useSettings((s) => s.controls)
  const setControls = useSettings((s) => s.setControls)
  const setBinding = useSettings((s) => s.setBinding)
  const resetBindings = useSettings((s) => s.resetBindings)
  const [listening, setListening] = useState<{ action: Action; slot: number } | null>(null)
  const conflicts = findConflicts(c.bindings)

  useEffect(() => {
    if (!listening) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.code === 'Escape') {
        setListening(null)
        return
      }
      if (e.code === 'Backspace' || e.code === 'Delete') {
        setBinding(listening.action, listening.slot, null)
        setListening(null)
        return
      }
      if (RESERVED_CODES.has(e.code)) return
      setBinding(listening.action, listening.slot, e.code)
      setListening(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [listening, setBinding])

  const groups = ['Movement', 'Magic', 'Flight', 'Interface'] as const
  return (
    <div>
      <Slider label="Mouse sensitivity" value={c.mouseSensitivity} min={0.2} max={3} step={0.05} onChange={(v) => setControls({ mouseSensitivity: v })} format={(v) => v.toFixed(2)} />
      <Toggle label="Invert vertical look" checked={c.invertY} onChange={(v) => setControls({ invertY: v })} />
      <Slider label="Camera distance" value={c.cameraDistance} min={3} max={9} step={0.25} onChange={(v) => setControls({ cameraDistance: v })} format={(v) => `${v.toFixed(1)} m`} hint="Mouse wheel also zooms in game." />
      <hr className="rule" />
      <p className="muted" style={{ fontSize: '0.82rem', marginTop: 0 }}>
        Mouse: look. Left button: cast. Right button: aim. Esc: pause (fixed). Click a key to rebind; Backspace clears; Esc cancels. Browsers reserve Ctrl+W, so C is also bound to Descend.
      </p>
      {conflicts.length > 0 && (
        <p className="warn" role="alert">
          Conflicts: {conflicts.map((cf) => `${keyLabel(cf.code)} is used by both "${ACTION_META[cf.actions[0]].label}" and "${ACTION_META[cf.actions[1]].label}"`).join('; ')}
        </p>
      )}
      {groups.map((group) => (
        <div key={group}>
          <h4 style={{ margin: '14px 0 4px', color: 'var(--gold)', fontWeight: 'normal', fontFamily: 'var(--font-display)' }}>{group}</h4>
          {ACTIONS.filter((a) => ACTION_META[a].group === group).map((action) => (
            <div className="binding-row" key={action}>
              <span>{ACTION_META[action].label}</span>
              {[0, 1].map((slot) => {
                const code = c.bindings[action][slot]
                const isListening = listening?.action === action && listening.slot === slot
                return (
                  <button
                    key={slot}
                    type="button"
                    className={`binding-btn${isListening ? ' listening' : ''}`}
                    onClick={() => setListening({ action, slot })}
                    aria-label={`Rebind ${ACTION_META[action].label} slot ${slot + 1}`}
                  >
                    {isListening ? 'Press a key' : code ? keyLabel(code) : '-'}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      ))}
      <div style={{ marginTop: 14 }}>
        <button type="button" className="btn btn-small" onClick={resetBindings}>
          Reset key bindings
        </button>
      </div>
    </div>
  )
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const tab = useGame((s) => s.settingsTab)
  const setTab = useGame((s) => s.setSettingsTab)
  const resetAll = useSettings((s) => s.resetAll)
  const tabs: Array<[SettingsTab, string]> = [
    ['graphics', 'Graphics'],
    ['audio', 'Audio'],
    ['controls', 'Controls'],
  ]
  return (
    <div className="panel modal" role="dialog" aria-label="Settings">
      <div className="modal-header">
        <h2 className="panel-title">Settings</h2>
        <button type="button" className="btn btn-small" onClick={onClose}>
          Back
        </button>
      </div>
      <div className="tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'graphics' && <GraphicsTab />}
      {tab === 'audio' && <AudioTab />}
      {tab === 'controls' && <ControlsTab />}
      <hr className="rule" />
      <button type="button" className="btn btn-small" onClick={resetAll}>
        Restore all defaults
      </button>
    </div>
  )
}
