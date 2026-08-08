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
    try {
      const overrideUrl = new URL(override)
      const currentUrl = new URL(normalizeOrigin(window.location.origin))
      if (
        overrideUrl.protocol === currentUrl.protocol &&
        overrideUrl.hostname === currentUrl.hostname &&
        overrideUrl.port === currentUrl.port
      ) {
        return override.replace(/\/$/, '')
      }
    } catch {
      // fall through to current origin
    }
  }
  return normalizeOrigin(window.location.origin).replace(/\/$/, '')
}
