/** Small deterministic value-noise implementation used by terrain and textures. */

const hash2 = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

/** Value noise in [-1, 1]. */
export function valueNoise2(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)
  const u = fade(xf)
  const v = fade(yf)
  const v0 = a + (b - a) * u
  const v1 = c + (d - c) * u
  return (v0 + (v1 - v0) * v) * 2 - 1
}

/** Fractal Brownian motion, roughly in [-1, 1]. */
export function fbm2(x: number, y: number, octaves = 5, lacunarity = 2, gain = 0.5): number {
  let amp = 0.5
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2(x * freq, y * freq) * amp
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return sum / norm
}

/** Ridged noise in [0, 1], good for mountain crests. */
export function ridged2(x: number, y: number, octaves = 4): number {
  let amp = 0.5
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise2(x * freq, y * freq))
    sum += n * n * amp
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}
