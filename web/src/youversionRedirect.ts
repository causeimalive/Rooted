function normalizeOrigin(origin: string): string {
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

export function getYouVersionRedirectUrl() {
  const override = import.meta.env.VITE_YVP_REDIRECT_URL?.trim()
  if (override) {
    return override.replace(/\/$/, '')
  }
  return normalizeOrigin(window.location.origin).replace(/\/$/, '')
}
