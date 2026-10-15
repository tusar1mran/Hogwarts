/**
 * Checks whether an optional asset exists before trying to load it, so missing files fall
 * back silently instead of throwing. Dev servers answer unknown paths with index.html (200),
 * so the content type is checked too.
 */
const cache = new Map<string, Promise<boolean>>()
const reported = new Set<string>()

export function probeAsset(url: string): Promise<boolean> {
  let p = cache.get(url)
  if (!p) {
    p = fetch(url, { method: 'HEAD' })
      .then((res) => {
        const type = res.headers.get('content-type') ?? ''
        return res.ok && !type.includes('text/html')
      })
      .catch(() => false)
      .then((ok) => {
        if (!ok && import.meta.env.DEV && !reported.has(url)) {
          reported.add(url)
          console.info(`[assets] optional asset not found, using fallback: ${url}`)
        }
        return ok
      })
    cache.set(url, p)
  }
  return p
}

export const clearProbeCache = () => cache.clear()
