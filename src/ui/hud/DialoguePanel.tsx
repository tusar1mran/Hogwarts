import { useEffect, useRef } from 'react'
import { useDialogue, getNode } from '../../game/state/dialogueStore'
import { useProgression } from '../../game/state/progressionStore'
import { DIALOGUES } from '../../game/npc/dialogueData'
import { lockOrPrompt } from '../../game/session'
import { events } from '../../game/core/events'

/** Parchment dialogue box: name, text, continue, choices (click or number keys). */
export function DialoguePanel() {
  const active = useDialogue((s) => s.active)
  const progression = useProgression((s) => s.progression)
  const choose = useDialogue((s) => s.choose)
  const advance = useDialogue((s) => s.advance)
  const close = useDialogue((s) => s.close)
  const firstChoice = useRef<HTMLButtonElement>(null)

  const node = active ? getNode(active.npcId, active.nodeId) : null
  const choices = node?.choices?.filter((c) => !c.visible || c.visible(progression)) ?? []

  const finish = () => {
    close()
    // Closing the conversation returns control; re-lock the pointer from this gesture.
    lockOrPrompt()
  }

  useEffect(() => {
    if (!active) return
    firstChoice.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault()
        finish()
        return
      }
      const n = Number(e.key)
      if (choices.length && n >= 1 && n <= choices.length) {
        e.preventDefault()
        events.emit({ type: 'ui:click' })
        const c = choices[n - 1]
        choose(c)
        if (c.next === null) lockOrPrompt()
        return
      }
      if (!choices.length && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE')) {
        e.preventDefault()
        if (node?.next == null) finish()
        else advance()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!active || !node) return null
  const dlg = DIALOGUES[active.npcId]
  const text = typeof node.text === 'function' ? node.text(progression) : node.text

  return (
    <div className="dialogue" role="dialog" aria-label={`Conversation with ${dlg?.name}`}>
      <div className="speaker">
        {dlg?.name}
        <small>{dlg?.title}</small>
      </div>
      <p>{text}</p>
      {choices.length > 0 ? (
        <div className="choices">
          {choices.map((c, i) => (
            <button
              key={i}
              ref={i === 0 ? firstChoice : undefined}
              type="button"
              className={`choice${c.action?.type === 'acceptQuest' ? ' accept' : ''}`}
              onClick={() => {
                events.emit({ type: 'ui:click' })
                choose(c)
                if (c.next === null) lockOrPrompt()
              }}
            >
              {i + 1}. {c.text}
            </button>
          ))}
        </div>
      ) : (
        <div className="footer">
          <button
            ref={firstChoice}
            type="button"
            className="choice"
            onClick={() => (node.next == null ? finish() : advance())}
          >
            {node.next == null ? 'Farewell' : 'Continue'} <span className="kbd" style={{ color: '#3a2410', borderColor: '#8a7240' }}>Space</span>
          </button>
        </div>
      )}
    </div>
  )
}
