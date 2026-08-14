const DEFAULT_REDIRECT = 'https://rootedinchrist.faith/'

const AUTHORIZED_REDIRECT_ORIGINS = [
  'https://rootedinchrist.faith',
  'https://www.rootedinchrist.faith',
  'https://app.rootedinchrist.faith',
  'https://rootedinchrist-faith.web.app',
  'https://rootedinchrist-faith-2026.web.app',
  'https://rootedinchrist-faith.firebaseapp.com',
  'https://rootedinchrist-faith-2026.firebaseapp.com',
  'http://localhost:5173',
  'com.rooted.christ://auth',
]

function normalizeLocalhost(origin: string): string {
  try {
    const url = new URL(origin)
    if (url.hostname === '127.0.0.1' || url.hostname === '::1') {
      url.hostname = 'localhost'
    }
    return url.origin
  } catch {
    return origin
  }
}

function isKnownLocalOrCapacitor(origin: string): boolean {
  try {
    const url = new URL(origin)
    const localHosts = new Set(['localhost', '127.0.0.1', '::1'])
    return localHosts.has(url.hostname) || !['http:', 'https:'].includes(url.protocol)
  } catch {
    return true
  }
}


export function getYouVersionRedirectUrl(): string {
  const override = import.meta.env.VITE_YVP_REDIRECT_URL?.trim()
  if (override) {
    return override.endsWith('/') ? override : `${override}/`
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const normalized = normalizeLocalhost(origin)
  if (AUTHORIZED_REDIRECT_ORIGINS.includes(normalized)) {
    return `${normalized}/`
  }
  if (isKnownLocalOrCapacitor(origin)) {
    return DEFAULT_REDIRECT
  }
  return DEFAULT_REDIRECT
}
