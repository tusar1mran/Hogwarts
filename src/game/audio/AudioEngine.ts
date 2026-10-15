import { AUDIO_ASSETS } from '../assets/manifest'
import { probeAsset } from '../assets/probe'
import type { MusicState } from './musicDirector'
import { THEMES, type Theme } from './themes'

/**
 * Web Audio engine.
 *
 * - Buses: master -> {music, sfx, ambient}; sfx/ambient also feed a convolution reverb whose
 *   wet level follows the current room (large halls ring, outdoors stays dry).
 * - Every cue has a synthesised fallback, so the game is never silent or broken when licensed
 *   audio files are absent. Files listed in the asset manifest replace cues automatically.
 * - The AudioContext is only created/resumed after a user gesture (autoplay policy).
 */

export interface Vec3Like {
  x: number
  y: number
  z: number
}

export interface PlayOptions {
  position?: Vec3Like
  volume?: number
  /** Playback-rate / pitch multiplier. */
  rate?: number
  bus?: 'sfx' | 'ambient'
}

export interface LoopHandle {
  setPosition(p: Vec3Like): void
  setLevel(level: number, rate?: number): void
  stop(): void
}

type SynthFn = (e: AudioEngine, out: AudioNode, t: number, rate: number) => number

const MAX_VOICES = 32

export class AudioEngine {
  ctx: AudioContext | null = null
  private master!: GainNode
  private musicBus!: GainNode
  private sfxBus!: GainNode
  private ambientBus!: GainNode
  private reverb!: ConvolverNode
  private reverbSend!: GainNode
  private noiseBuffer!: AudioBuffer
  private buffers = new Map<string, AudioBuffer>()
  private voices = 0
  private musicLayers = new Map<MusicState, { gain: GainNode; stop: () => void }>()
  private beds = new Map<string, LoopHandle>()
  private volumes = { master: 0.8, music: 0.55, sfx: 0.8, ambient: 0.7, muted: false }
  private failed = false
  private warned = new Set<string>()
  private synths = new Map<string, SynthFn>()
  musicState: MusicState = 'silent'

  get ready() {
    return this.ctx !== null && this.ctx.state === 'running'
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (this.failed) return
    try {
      if (!this.ctx) this.build()
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined)
    } catch (err) {
      this.failed = true
      console.warn('[audio] Web Audio unavailable; continuing without sound.', err)
    }
  }

  private build() {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) throw new Error('AudioContext not supported')
    const ctx = new Ctor({ latencyHint: 'interactive' })
    this.ctx = ctx
    this.master = ctx.createGain()
    // Gentle limiter on the master to keep stacked effects from clipping.
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -10
    comp.ratio.value = 6
    this.master.connect(comp)
    comp.connect(ctx.destination)

    this.musicBus = ctx.createGain()
    this.sfxBus = ctx.createGain()
    this.ambientBus = ctx.createGain()
    this.musicBus.connect(this.master)
    this.sfxBus.connect(this.master)
    this.ambientBus.connect(this.master)

    this.reverb = ctx.createConvolver()
    this.reverb.buffer = this.impulse(3.2, 2.6)
    this.reverbSend = ctx.createGain()
    this.reverbSend.gain.value = 0.1
    this.reverbSend.connect(this.reverb)
    this.reverb.connect(this.master)
    this.sfxBus.connect(this.reverbSend)
    this.ambientBus.connect(this.reverbSend)

    const len = ctx.sampleRate * 2
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = this.noiseBuffer.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1

    this.applyVolumes()
    void this.loadOptionalAssets()
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  private onVisibility = () => {
    if (!this.ctx) return
    if (document.hidden) void this.ctx.suspend().catch(() => undefined)
    else void this.ctx.resume().catch(() => undefined)
  }

  private impulse(seconds: number, decay: number) {
    const ctx = this.ctx!
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const data = buf.getChannelData(c)
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
    }
    return buf
  }

  /** Loads any licensed audio files that have been dropped into /public/assets/audio. */
  private async loadOptionalAssets() {
    const ctx = this.ctx
    if (!ctx) return
    await Promise.all(
      AUDIO_ASSETS.map(async (a) => {
        if (!(await probeAsset(a.url))) return
        try {
          const res = await fetch(a.url)
          const data = await res.arrayBuffer()
          const buf = await ctx.decodeAudioData(data)
          this.buffers.set(a.id, buf)
          if (import.meta.env.DEV) console.info(`[audio] loaded ${a.url}`)
          // Restart the current music layer so a newly available file takes over.
          if (a.kind === 'music' && a.id === `music-${this.musicState}`) {
            const s = this.musicState
            this.musicState = 'silent'
            this.setMusic(s)
          }
        } catch (err) {
          console.warn(`[audio] could not decode ${a.url}; using synthesised fallback`, err)
        }
      }),
    )
  }

  setVolumes(v: { master: number; music: number; sfx: number; ambient: number; muted: boolean }) {
    this.volumes = { ...v }
    this.applyVolumes()
  }

  private applyVolumes() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const v = this.volumes
    this.master.gain.setTargetAtTime(v.muted ? 0 : v.master, t, 0.05)
    this.musicBus.gain.setTargetAtTime(v.music * 0.7, t, 0.05)
    this.sfxBus.gain.setTargetAtTime(v.sfx, t, 0.05)
    this.ambientBus.gain.setTargetAtTime(v.ambient, t, 0.05)
  }

  /** Room acoustics: 0 = dry outdoors, 1 = cathedral-like hall. */
  setReverb(amount: number) {
    if (!this.ctx) return
    this.reverbSend.gain.setTargetAtTime(0.06 + amount * 0.55, this.ctx.currentTime, 0.6)
  }

  setListener(pos: Vec3Like, forward: Vec3Like) {
    const ctx = this.ctx
    if (!ctx) return
    const l = ctx.listener
    const t = ctx.currentTime
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.02)
      l.positionY.setTargetAtTime(pos.y, t, 0.02)
      l.positionZ.setTargetAtTime(pos.z, t, 0.02)
      l.forwardX.setTargetAtTime(forward.x, t, 0.02)
      l.forwardY.setTargetAtTime(forward.y, t, 0.02)
      l.forwardZ.setTargetAtTime(forward.z, t, 0.02)
      l.upX.value = 0
      l.upY.value = 1
      l.upZ.value = 0
    } else {
      l.setPosition(pos.x, pos.y, pos.z)
      l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0)
    }
  }

  /* -------------------------------------------------------------------------------------- */
  /* Building blocks used by synth cues                                                       */
  /* -------------------------------------------------------------------------------------- */

  noise(t: number, duration: number, out: AudioNode, opts: { type?: BiquadFilterType; freq?: number; freqEnd?: number; q?: number; gain?: number; attack?: number } = {}) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.playbackRate.value = 0.8 + Math.random() * 0.4
    const filter = ctx.createBiquadFilter()
    filter.type = opts.type ?? 'bandpass'
    filter.frequency.setValueAtTime(opts.freq ?? 1000, t)
    if (opts.freqEnd) filter.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + duration)
    filter.Q.value = opts.q ?? 1
    const g = ctx.createGain()
    const peak = opts.gain ?? 0.5
    const attack = opts.attack ?? 0.005
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    src.connect(filter).connect(g).connect(out)
    src.start(t, Math.random() * 1.5)
    src.stop(t + duration + 0.05)
  }

  tone(t: number, duration: number, out: AudioNode, opts: { type?: OscillatorType; freq: number; freqEnd?: number; gain?: number; attack?: number; detune?: number; vibrato?: number }) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = opts.type ?? 'sine'
    osc.frequency.setValueAtTime(opts.freq, t)
    if (opts.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqEnd), t + duration)
    if (opts.detune) osc.detune.value = opts.detune
    if (opts.vibrato) {
      const lfo = ctx.createOscillator()
      const lg = ctx.createGain()
      lfo.frequency.value = 5.5
      lg.gain.value = opts.vibrato
      lfo.connect(lg).connect(osc.frequency)
      lfo.start(t)
      lfo.stop(t + duration + 0.05)
    }
    const g = ctx.createGain()
    const attack = opts.attack ?? 0.01
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.3, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    osc.connect(g).connect(out)
    osc.start(t)
    osc.stop(t + duration + 0.05)
  }

  private spatialOut(bus: GainNode, pos?: Vec3Like, volume = 1): { node: AudioNode; panner: PannerNode | null; gain: GainNode } {
    const ctx = this.ctx!
    const gain = ctx.createGain()
    gain.gain.value = volume
    if (!pos) {
      gain.connect(bus)
      return { node: gain, panner: null, gain }
    }
    const panner = ctx.createPanner()
    panner.panningModel = 'HRTF'
    panner.distanceModel = 'inverse'
    panner.refDistance = 4
    panner.maxDistance = 400
    panner.rolloffFactor = 1.2
    if (panner.positionX) {
      panner.positionX.value = pos.x
      panner.positionY.value = pos.y
      panner.positionZ.value = pos.z
    } else {
      panner.setPosition(pos.x, pos.y, pos.z)
    }
    gain.connect(panner).connect(bus)
    return { node: gain, panner, gain }
  }

  registerSynth(id: string, fn: SynthFn) {
    this.synths.set(id, fn)
  }

  /** Play a one-shot cue. Uses a loaded file when available, otherwise the synthesised version. */
  play(cue: string, opts: PlayOptions = {}) {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    if (this.voices >= MAX_VOICES) return
    const bus = opts.bus === 'ambient' ? this.ambientBus : this.sfxBus
    const { node } = this.spatialOut(bus, opts.position, opts.volume ?? 1)
    const t = ctx.currentTime + 0.005
    const rate = opts.rate ?? 1
    let duration = 0.5
    const buffer = this.buffers.get(cue)
    if (buffer) {
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.playbackRate.value = rate
      src.connect(node)
      src.start(t)
      duration = buffer.duration / rate
    } else {
      const synth = this.synths.get(cue)
      if (!synth) {
        if (import.meta.env.DEV && !this.warned.has(cue)) {
          this.warned.add(cue)
          console.warn(`[audio] no file or synth for cue "${cue}"`)
        }
        return
      }
      try {
        duration = synth(this, node, t, rate)
      } catch (err) {
        console.warn(`[audio] cue "${cue}" failed`, err)
        return
      }
    }
    this.voices++
    window.setTimeout(() => {
      this.voices = Math.max(0, this.voices - 1)
      node.disconnect()
    }, (duration + 0.3) * 1000)
  }

  /** Continuous sound (flight wind, projectile hum). Level 0 silences without stopping. */
  loop(kind: 'wind' | 'hum' | 'crackle' | 'water' | 'crickets' | 'room', opts: { position?: Vec3Like; bus?: 'sfx' | 'ambient' } = {}): LoopHandle | null {
    const ctx = this.ctx
    if (!ctx) return null
    const bus = opts.bus === 'ambient' ? this.ambientBus : this.sfxBus
    const out = this.spatialOut(bus, opts.position, 0)
    const stops: Array<() => void> = []
    let filter: BiquadFilterNode | null = null
    let osc: OscillatorNode | null = null
    const fileId = kind === 'wind' ? 'ambient-wind' : kind === 'crickets' ? 'ambient-forest' : kind === 'room' ? 'ambient-interior' : null
    const file = fileId ? this.buffers.get(fileId) : undefined
    if (file) {
      const src = ctx.createBufferSource()
      src.buffer = file
      src.loop = true
      src.connect(out.node)
      src.start()
      stops.push(() => src.stop())
    } else if (kind === 'hum') {
      osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = 180
      filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 900
      const trem = ctx.createOscillator()
      const tg = ctx.createGain()
      trem.frequency.value = 18
      tg.gain.value = 40
      trem.connect(tg).connect(osc.frequency)
      osc.connect(filter).connect(out.node)
      osc.start()
      trem.start()
      stops.push(() => {
        osc?.stop()
        trem.stop()
      })
    } else if (kind === 'crickets') {
      // Pulsed high sine, amplitude-modulated into chirps.
      const carrier = ctx.createOscillator()
      carrier.frequency.value = 4300
      const am = ctx.createGain()
      am.gain.value = 0
      const lfo = ctx.createOscillator()
      lfo.type = 'square'
      lfo.frequency.value = 22
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = 0.5
      const slow = ctx.createOscillator()
      slow.frequency.value = 0.7
      const slowGain = ctx.createGain()
      slowGain.gain.value = 0.5
      lfo.connect(lfoGain).connect(am.gain)
      slow.connect(slowGain).connect(am.gain)
      carrier.connect(am)
      const lvl = ctx.createGain()
      lvl.gain.value = 0.05
      am.connect(lvl).connect(out.node)
      carrier.start()
      lfo.start()
      slow.start()
      stops.push(() => {
        carrier.stop()
        lfo.stop()
        slow.stop()
      })
    } else {
      // Noise beds: wind, water, room tone, crackle.
      const src = ctx.createBufferSource()
      src.buffer = this.noiseBuffer
      src.loop = true
      filter = ctx.createBiquadFilter()
      filter.type = kind === 'water' ? 'lowpass' : kind === 'room' ? 'lowpass' : 'bandpass'
      filter.frequency.value = kind === 'wind' ? 500 : kind === 'water' ? 600 : kind === 'room' ? 220 : 2500
      filter.Q.value = kind === 'wind' ? 0.8 : 0.5
      const mod = ctx.createGain()
      const lfo = ctx.createOscillator()
      lfo.frequency.value = kind === 'water' ? 0.35 : kind === 'crackle' ? 9 : 0.13
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = kind === 'crackle' ? 0.6 : 0.35
      mod.gain.value = 0.65
      lfo.connect(lfoGain).connect(mod.gain)
      src.connect(filter).connect(mod).connect(out.node)
      src.start(0, Math.random() * 1.5)
      lfo.start()
      stops.push(() => {
        src.stop()
        lfo.stop()
      })
    }
    let stopped = false
    return {
      setPosition: (p) => {
        if (!out.panner) return
        const t = ctx.currentTime
        if (out.panner.positionX) {
          out.panner.positionX.setTargetAtTime(p.x, t, 0.03)
          out.panner.positionY.setTargetAtTime(p.y, t, 0.03)
          out.panner.positionZ.setTargetAtTime(p.z, t, 0.03)
        } else out.panner.setPosition(p.x, p.y, p.z)
      },
      setLevel: (level, rate) => {
        const t = ctx.currentTime
        out.gain.gain.setTargetAtTime(Math.max(0, level), t, 0.15)
        if (filter && rate !== undefined) filter.frequency.setTargetAtTime((kind === 'wind' ? 300 : 600) + rate * 1800, t, 0.2)
        if (osc && rate !== undefined) osc.frequency.setTargetAtTime(140 + rate * 160, t, 0.05)
      },
      stop: () => {
        if (stopped) return
        stopped = true
        out.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1)
        window.setTimeout(() => {
          stops.forEach((s) => {
            try {
              s()
            } catch {
              // already stopped
            }
          })
          out.node.disconnect()
        }, 500)
      },
    }
  }

  /** Persistent ambient beds keyed by name, faded by level. */
  bed(name: string, kind: Parameters<AudioEngine['loop']>[0]): LoopHandle | null {
    const existing = this.beds.get(name)
    if (existing) return existing
    const h = this.loop(kind, { bus: 'ambient' })
    if (h) this.beds.set(name, h)
    return h
  }

  /* -------------------------------------------------------------------------------------- */
  /* Music                                                                                    */
  /* -------------------------------------------------------------------------------------- */

  /** Crossfade to a music state (no-op if already playing it). */
  setMusic(state: MusicState) {
    const ctx = this.ctx
    if (!ctx || state === this.musicState) return
    this.musicState = state
    const t = ctx.currentTime
    for (const [s, layer] of this.musicLayers) {
      layer.gain.gain.cancelScheduledValues(t)
      layer.gain.gain.setTargetAtTime(0, t, 1.0)
      const stop = layer.stop
      this.musicLayers.delete(s)
      window.setTimeout(stop, 5000)
    }
    if (state === 'silent') return
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.gain.setTargetAtTime(1, t + 0.3, 1.2)
    gain.connect(this.musicBus)
    const file = this.buffers.get(`music-${state}`)
    if (file) {
      const src = ctx.createBufferSource()
      src.buffer = file
      src.loop = true
      src.connect(gain)
      src.start()
      this.musicLayers.set(state, {
        gain,
        stop: () => {
          try {
            src.stop()
          } catch {
            // ignore
          }
          gain.disconnect()
        },
      })
      return
    }
    const sequencer = new ThemeSequencer(this, THEMES[state], gain)
    sequencer.start()
    this.musicLayers.set(state, {
      gain,
      stop: () => {
        sequencer.stop()
        gain.disconnect()
      },
    })
  }

  dispose() {
    this.setMusic('silent')
    this.beds.forEach((b) => b.stop())
    this.beds.clear()
    document.removeEventListener('visibilitychange', this.onVisibility)
    void this.ctx?.close().catch(() => undefined)
    this.ctx = null
  }
}

/**
 * Generative orchestral sketch: a scheduler that lays down pads, harp arpeggios, a sparse
 * melody, low drones and (for some themes) percussion, following a chord progression.
 */
class ThemeSequencer {
  private timer: ReturnType<typeof setInterval> | null = null
  private nextBar = 0
  private bar = 0
  private melodyDegree = 0

  private engine: AudioEngine
  private theme: Theme
  private out: GainNode

  constructor(engine: AudioEngine, theme: Theme, out: GainNode) {
    this.engine = engine
    this.theme = theme
    this.out = out
  }

  start() {
    const ctx = this.engine.ctx!
    this.nextBar = ctx.currentTime + 0.1
    this.timer = setInterval(() => this.schedule(), 200)
    this.schedule()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private freq(degree: number, octave = 0) {
    const { root, scale } = this.theme
    const n = scale.length
    const o = Math.floor(degree / n)
    const idx = ((degree % n) + n) % n
    return root * Math.pow(2, (scale[idx] + 12 * (o + octave)) / 12)
  }

  private schedule() {
    const ctx = this.engine.ctx
    if (!ctx) return
    const beat = 60 / this.theme.bpm
    const barLen = beat * 4
    while (this.nextBar < ctx.currentTime + 1.2) {
      this.scheduleBar(this.nextBar, beat, barLen)
      this.nextBar += barLen
      this.bar++
    }
  }

  private scheduleBar(t: number, beat: number, barLen: number) {
    const e = this.engine
    const th = this.theme
    const chord = th.progression[this.bar % th.progression.length]
    const triad = [chord, chord + 2, chord + 4]
    const out = this.out

    if (th.layers.pad && this.bar % 2 === 0) {
      for (const d of triad) {
        e.tone(t, barLen * 2.1, out, { type: 'sawtooth', freq: this.freq(d), gain: 0.022, attack: barLen * 0.5, detune: -6 })
        e.tone(t, barLen * 2.1, out, { type: 'sawtooth', freq: this.freq(d), gain: 0.022, attack: barLen * 0.5, detune: 7 })
      }
    }
    if (th.layers.choir && this.bar % 2 === 0) {
      for (const d of triad) e.tone(t + 0.05, barLen * 2, out, { type: 'triangle', freq: this.freq(d, 1), gain: 0.03, attack: barLen * 0.7, vibrato: 3 })
    }
    if (th.layers.drone) e.tone(t, barLen * 1.05, out, { type: 'sine', freq: this.freq(chord, -1), gain: 0.07, attack: 0.4 })
    if (th.layers.harp) {
      const pattern = [0, 1, 2, 1, 2, 3, 2, 1]
      for (let i = 0; i < 8; i++) {
        if (Math.random() < th.layers.harp) {
          const d = triad[pattern[i] % 3] + (pattern[i] === 3 ? 7 : 0)
          e.tone(t + i * (beat / 2), 1.6, out, { type: 'sine', freq: this.freq(d, 1), gain: 0.05, attack: 0.004 })
          e.tone(t + i * (beat / 2), 0.6, out, { type: 'triangle', freq: this.freq(d, 2), gain: 0.012, attack: 0.002 })
        }
      }
    }
    if (th.layers.bells && Math.random() < th.layers.bells) {
      const d = triad[Math.floor(Math.random() * 3)]
      e.tone(t + beat * Math.floor(Math.random() * 4), 3.5, out, { type: 'sine', freq: this.freq(d, 2), gain: 0.035, attack: 0.002 })
    }
    if (th.layers.melody) {
      // Random walk over the scale, resolving towards chord tones.
      const steps = [0, 1, 1.5, 2, 3]
      for (const s of steps) {
        if (Math.random() > th.layers.melody) continue
        this.melodyDegree += Math.floor(Math.random() * 5) - 2
        this.melodyDegree = Math.max(-2, Math.min(9, this.melodyDegree))
        e.tone(t + s * beat, beat * 1.4, out, { type: th.layers.melodyVoice ?? 'sine', freq: this.freq(this.melodyDegree, 1), gain: 0.045, attack: 0.06, vibrato: 4 })
      }
    }
    if (th.layers.pulse) {
      for (let i = 0; i < 8; i++) {
        e.tone(t + i * (beat / 2), beat * 0.35, out, { type: 'sawtooth', freq: this.freq(chord, -1 + (i % 2)), gain: 0.03, attack: 0.005 })
      }
    }
    if (th.layers.drums) {
      for (let i = 0; i < 4; i++) {
        if (i === 0 || i === 2 || Math.random() < 0.3) {
          e.tone(t + i * beat, 0.5, out, { type: 'sine', freq: 70, freqEnd: 38, gain: 0.22, attack: 0.003 })
          e.noise(t + i * beat, 0.25, out, { type: 'lowpass', freq: 400, gain: 0.08 })
        }
      }
    }
  }
}

export const audioEngine = new AudioEngine()
