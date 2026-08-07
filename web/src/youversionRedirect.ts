export function getYouVersionRedirectUrl() {
  const override = import.meta.env.VITE_YVP_REDIRECT_URL?.trim()
  if (override) {
    return override.replace(/\/$/, '')
  }

  try {
    const url = new URL(window.location.origin)
    if (url.hostname === '127.0.0.1' || url.hostname === '::1') {
      url.hostname = 'localhost'
    }
    return url.origin
  } catch {
    return window.location.origin
  }
}
