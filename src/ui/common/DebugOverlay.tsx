import { useEffect, useRef } from 'react'
import { runtime } from '../../game/core/runtime'
import { useSettings } from '../../game/state/settings'
import { input } from '../../game/input/InputManager'

/**
 * Performance and state readout. Writes text directly to the DOM a few times per second so
 * it never re-renders React or touches the game loop.
 */
export function DebugOverlay() {
  const show = useSettings((s) => s.graphics.showDebug)
  const setGraphics = useSettings((s) => s.setGraphics)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(
    () =>
      input.onPress((a) => {
        if (a === 'toggleDebug') setGraphics({ showDebug: !useSettings.getState().graphics.showDebug })
      }),
    [setGraphics],
  )

  useEffect(() => {
    if (!show) return
    const id = window.setInterval(() => {
      const el = ref.current
      if (!el) return
      const p = runtime.player
      const f = runtime.perf
      el.textContent = [
        `FPS        ${f.fps.toFixed(0)}  (${f.frameMs.toFixed(1)} ms)`,
        `DPR        ${f.dpr.toFixed(2)}`,
        `Draw calls ${f.drawCalls}`,
        `Triangles  ${(f.triangles / 1000).toFixed(0)}k`,
        `Geometries ${f.geometries}  Textures ${f.textures}`,
        `Position   ${p.position.x.toFixed(1)}, ${p.position.y.toFixed(1)}, ${p.position.z.toFixed(1)}`,
        `Area       ${p.area}   Surface ${p.surface}`,
        `Grounded   ${p.grounded}   Speed ${p.speed.toFixed(1)} m/s`,
        `Anim       ${p.animState}`,
        `Flight     ${runtime.flight.state}  ${runtime.flight.speed.toFixed(1)} m/s`,
        `Aim        ${runtime.aim.hit ? runtime.aim.hitEntityId ?? 'surface' : 'none'}`,
      ].join('\n')
    }, 250)
    return () => window.clearInterval(id)
  }, [show])

  if (!show) return null
  return <div className="debug" ref={ref} aria-hidden />
}
