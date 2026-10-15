export function Credits({ onClose }: { onClose: () => void }) {
  return (
    <div className="panel modal" role="dialog" aria-label="Credits">
      <div className="modal-header">
        <h2 className="panel-title">Credits</h2>
        <button type="button" className="btn btn-small" onClick={onClose}>
          Back
        </button>
      </div>
      <p>
        <strong>Eldoria: Academy of Arcane Arts</strong> is an original setting. Its characters, places, spells and music are created for this project.
      </p>
      <hr className="rule" />
      <h4 style={{ color: 'var(--gold)', fontWeight: 'normal', fontFamily: 'var(--font-display)' }}>Built with</h4>
      <ul className="muted" style={{ lineHeight: 1.8 }}>
        <li>three.js (MIT)</li>
        <li>React, React Three Fiber, Drei (MIT)</li>
        <li>Rapier physics (Apache-2.0) via @react-three/rapier (licence not declared in its npm metadata; see the upstream repository)</li>
        <li>postprocessing and @react-three/postprocessing (Zlib / MIT)</li>
        <li>Zustand (MIT)</li>
      </ul>
      <h4 style={{ color: 'var(--gold)', fontWeight: 'normal', fontFamily: 'var(--font-display)' }}>Art and audio</h4>
      <p className="muted">
        Character bodies, hairstyles and animations: Quaternius, Universal Base Characters and Universal Animation Library (CC0 1.0), dressed with clothing generated in code. Textures, architecture, music and sound effects are generated procedurally at runtime. Asset details are in ASSETS.md.
      </p>
    </div>
  )
}
