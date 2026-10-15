import type { AudioEngine } from './AudioEngine'

/**
 * Synthesised fallbacks for every sound cue. Each returns its duration in seconds.
 * Replace any of them by dropping a licensed file with the same id into /public/assets/audio.
 */
export function registerSynthCues(e: AudioEngine) {
  const r = (v: number) => v * (0.92 + Math.random() * 0.16)

  e.registerSynth('footstep-stone', (en, out, t, rate) => {
    en.noise(t, 0.07, out, { type: 'bandpass', freq: r(2400) * rate, q: 1.4, gain: 0.35 })
    en.tone(t, 0.05, out, { type: 'triangle', freq: r(180), gain: 0.12 })
    return 0.1
  })
  e.registerSynth('footstep-grass', (en, out, t, rate) => {
    en.noise(t, 0.14, out, { type: 'lowpass', freq: r(900) * rate, q: 0.6, gain: 0.3, attack: 0.02 })
    return 0.16
  })
  e.registerSynth('footstep-wood', (en, out, t, rate) => {
    en.noise(t, 0.08, out, { type: 'bandpass', freq: r(700) * rate, q: 1.2, gain: 0.3 })
    en.tone(t, 0.12, out, { type: 'sine', freq: r(140), freqEnd: 90, gain: 0.22 })
    return 0.14
  })
  e.registerSynth('robe', (en, out, t) => {
    en.noise(t, 0.3, out, { type: 'bandpass', freq: 800, freqEnd: 2400, q: 0.7, gain: 0.08, attack: 0.08 })
    return 0.32
  })
  e.registerSynth('wand-swish', (en, out, t) => {
    en.noise(t, 0.18, out, { type: 'highpass', freq: 1500, freqEnd: 5000, q: 0.8, gain: 0.08, attack: 0.03 })
    return 0.2
  })
  e.registerSynth('cast-arc', (en, out, t) => {
    en.tone(t, 0.22, out, { type: 'sawtooth', freq: 520, freqEnd: 1900, gain: 0.12 })
    en.tone(t, 0.3, out, { type: 'sine', freq: 1300, freqEnd: 2600, gain: 0.1 })
    en.noise(t, 0.2, out, { type: 'highpass', freq: 3000, gain: 0.12 })
    return 0.35
  })
  e.registerSynth('cast-wave', (en, out, t) => {
    en.tone(t, 0.5, out, { type: 'sine', freq: 110, freqEnd: 38, gain: 0.5, attack: 0.005 })
    en.noise(t, 0.6, out, { type: 'lowpass', freq: 2600, freqEnd: 180, gain: 0.35, attack: 0.01 })
    return 0.65
  })
  e.registerSynth('cast-shield', (en, out, t) => {
    for (const f of [659.25, 987.77, 1318.5]) en.tone(t, 1.4, out, { type: 'sine', freq: f, gain: 0.07, attack: 0.04, vibrato: 6 })
    en.noise(t, 0.5, out, { type: 'bandpass', freq: 4000, q: 3, gain: 0.05, attack: 0.05 })
    return 1.5
  })
  e.registerSynth('shield-block', (en, out, t) => {
    en.tone(t, 0.6, out, { type: 'triangle', freq: 1760, freqEnd: 1500, gain: 0.15 })
    en.tone(t, 0.4, out, { type: 'sine', freq: 2640, gain: 0.08 })
    return 0.6
  })
  e.registerSynth('shield-down', (en, out, t) => {
    for (const [i, f] of [1318.5, 987.77, 659.25].entries()) en.tone(t + i * 0.08, 0.5, out, { type: 'sine', freq: f, freqEnd: f * 0.8, gain: 0.05 })
    return 0.8
  })
  e.registerSynth('cast-orb', (en, out, t) => {
    en.tone(t, 1.8, out, { type: 'sine', freq: 880, gain: 0.12, attack: 0.003 })
    en.tone(t, 1.2, out, { type: 'sine', freq: 1760 * 1.003, gain: 0.04, attack: 0.003 })
    en.tone(t + 0.12, 1.5, out, { type: 'sine', freq: 1318.5, gain: 0.06, attack: 0.003 })
    return 1.9
  })
  e.registerSynth('cast-pull', (en, out, t) => {
    en.tone(t, 0.7, out, { type: 'sawtooth', freq: 420, freqEnd: 140, gain: 0.08, vibrato: 30 })
    en.noise(t, 0.6, out, { type: 'bandpass', freq: 1200, freqEnd: 400, q: 2, gain: 0.08 })
    return 0.75
  })
  e.registerSynth('cast-blink', (en, out, t) => {
    en.noise(t, 0.28, out, { type: 'bandpass', freq: 300, freqEnd: 5200, q: 1.5, gain: 0.3, attack: 0.2 })
    en.tone(t + 0.25, 0.15, out, { type: 'sine', freq: 1600, freqEnd: 800, gain: 0.12 })
    return 0.45
  })
  e.registerSynth('impact-spark', (en, out, t) => {
    en.noise(t, 0.18, out, { type: 'highpass', freq: 1800, gain: 0.35 })
    en.tone(t, 0.25, out, { type: 'sine', freq: 2200, freqEnd: 700, gain: 0.08 })
    return 0.3
  })
  e.registerSynth('fizzle', (en, out, t) => {
    en.noise(t, 0.25, out, { type: 'bandpass', freq: 1500, freqEnd: 300, q: 2, gain: 0.1 })
    return 0.3
  })
  e.registerSynth('target-break', (en, out, t) => {
    en.noise(t, 0.4, out, { type: 'bandpass', freq: 900, q: 0.8, gain: 0.4 })
    en.tone(t, 0.3, out, { type: 'triangle', freq: 220, freqEnd: 90, gain: 0.2 })
    return 0.45
  })
  e.registerSynth('broom-summon', (en, out, t) => {
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => en.tone(t + i * 0.09, 0.9, out, { type: 'sine', freq: f, gain: 0.08 }))
    en.noise(t, 0.7, out, { type: 'bandpass', freq: 600, freqEnd: 3000, q: 1, gain: 0.08, attack: 0.3 })
    return 1.2
  })
  e.registerSynth('broom-takeoff', (en, out, t) => {
    en.noise(t, 1.0, out, { type: 'bandpass', freq: 250, freqEnd: 1800, q: 0.8, gain: 0.35, attack: 0.25 })
    en.tone(t, 0.9, out, { type: 'sine', freq: 70, freqEnd: 110, gain: 0.15, attack: 0.2 })
    return 1.1
  })
  e.registerSynth('broom-land', (en, out, t) => {
    en.tone(t, 0.35, out, { type: 'sine', freq: 90, freqEnd: 45, gain: 0.35 })
    en.noise(t, 0.3, out, { type: 'lowpass', freq: 700, gain: 0.25 })
    return 0.4
  })
  e.registerSynth('land', (en, out, t, rate) => {
    en.tone(t, 0.2, out, { type: 'sine', freq: 85 * rate, freqEnd: 50, gain: 0.3 })
    en.noise(t, 0.15, out, { type: 'lowpass', freq: 900, gain: 0.2 })
    return 0.25
  })
  e.registerSynth('hurt', (en, out, t) => {
    en.tone(t, 0.3, out, { type: 'sawtooth', freq: 160, freqEnd: 90, gain: 0.12 })
    en.noise(t, 0.25, out, { type: 'lowpass', freq: 600, gain: 0.3 })
    return 0.35
  })
  e.registerSynth('door', (en, out, t) => {
    en.tone(t, 0.9, out, { type: 'sawtooth', freq: 95, freqEnd: 70, gain: 0.05, vibrato: 12 })
    en.noise(t, 0.8, out, { type: 'bandpass', freq: 500, freqEnd: 300, q: 4, gain: 0.08, attack: 0.1 })
    en.tone(t + 0.85, 0.3, out, { type: 'sine', freq: 70, freqEnd: 40, gain: 0.35 })
    return 1.2
  })
  e.registerSynth('bell', (en, out, t) => {
    for (let i = 0; i < 3; i++) {
      en.tone(t + i * 2.2, 5, out, { type: 'sine', freq: 196, gain: 0.35, attack: 0.004 })
      en.tone(t + i * 2.2, 3.5, out, { type: 'sine', freq: 196 * 2.76, gain: 0.12, attack: 0.004 })
      en.tone(t + i * 2.2, 2.5, out, { type: 'sine', freq: 196 * 5.4, gain: 0.05, attack: 0.004 })
    }
    return 9.5
  })
  e.registerSynth('owl', (en, out, t) => {
    en.tone(t, 0.35, out, { type: 'sine', freq: 420, freqEnd: 360, gain: 0.12, attack: 0.05 })
    en.tone(t + 0.5, 0.6, out, { type: 'sine', freq: 430, freqEnd: 340, gain: 0.12, attack: 0.05 })
    return 1.2
  })
  e.registerSynth('ring', (en, out, t) => {
    ;[783.99, 1174.66, 1567.98].forEach((f, i) => en.tone(t + i * 0.06, 0.8, out, { type: 'sine', freq: f, gain: 0.1 }))
    return 1
  })
  e.registerSynth('quest-complete', (en, out, t) => {
    ;[392, 493.88, 587.33, 783.99].forEach((f, i) => {
      en.tone(t + i * 0.14, 1.4, out, { type: 'triangle', freq: f, gain: 0.1, attack: 0.02 })
      en.tone(t + i * 0.14, 1.4, out, { type: 'sine', freq: f * 2, gain: 0.04 })
    })
    return 2
  })
  e.registerSynth('discovery', (en, out, t) => {
    ;[659.25, 830.61, 987.77, 1318.5].forEach((f, i) => en.tone(t + i * 0.1, 1.6, out, { type: 'sine', freq: f, gain: 0.07, vibrato: 4 }))
    return 2
  })
  e.registerSynth('ui-click', (en, out, t) => {
    en.tone(t, 0.06, out, { type: 'triangle', freq: 1200, freqEnd: 900, gain: 0.08 })
    return 0.08
  })
  e.registerSynth('ui-open', (en, out, t) => {
    en.noise(t, 0.25, out, { type: 'bandpass', freq: 1800, freqEnd: 900, q: 1.2, gain: 0.06, attack: 0.04 })
    return 0.3
  })
}
