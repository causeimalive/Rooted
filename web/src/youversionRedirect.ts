import { Capacitor } from '@capacitor/core'
import { YouVersionPlatformConfiguration } from '@youversion/platform-core'

const DEFAULT_REDIRECT = 'https://rootedinchrist.faith/'
const NATIVE_BRIDGE_SCHEME = 'com.rooted.christ://auth/'

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
  if (Capacitor.isNativePlatform()) {
    return DEFAULT_REDIRECT
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

const REQUESTED_PERMISSIONS_KEY = 'youversion-auth-requested-permissions'
const PENDING_GRANTED_PERMISSIONS_KEY = 'youversion-auth-pending-granted-permissions'

function randomURLSafeString(byteCount: number): string {
  const bytes = new Uint8Array(byteCount)
  crypto.getRandomValues(bytes)
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function pkceChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function scopeString(scopes: string[]): string {
  const sorted = [...scopes].sort()
  const joined = sorted.join(' ')
  return joined.includes('openid') ? joined : joined ? `${joined} openid` : 'openid'
}

export async function beginYouVersionSignIn(
  redirectUrl: string,
  scopes: string[] = ['openid', 'profile'],
  permissions: string[] = ['highlights'],
): Promise<void> {
  const appKey = YouVersionPlatformConfiguration.appKey || import.meta.env.VITE_YVP_APP_KEY?.trim()
  if (!appKey) throw new Error('YouVersion app key not configured')

  const codeVerifier = randomURLSafeString(32)
  const codeChallengeValue = await pkceChallenge(codeVerifier)
  const state = randomURLSafeString(24) + (Capacitor.isNativePlatform() ? ':app' : '')
  const nonce = randomURLSafeString(24)

  localStorage.setItem('youversion-auth-code-verifier', codeVerifier)
  localStorage.setItem('youversion-auth-redirect-uri', redirectUrl)
  localStorage.setItem('youversion-auth-state', state)
  localStorage.removeItem(PENDING_GRANTED_PERMISSIONS_KEY)
  localStorage.removeItem(REQUESTED_PERMISSIONS_KEY)
  YouVersionPlatformConfiguration.clearDataExchangeInitiator()

  if (permissions.length > 0) {
    localStorage.setItem(
      REQUESTED_PERMISSIONS_KEY,
      JSON.stringify({ state, permissions: [...permissions] }),
    )
  }

  const url = new URL(`https://${YouVersionPlatformConfiguration.apiHost}/auth/authorize`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', appKey)
  url.searchParams.set('redirect_uri', redirectUrl)
  url.searchParams.set('nonce', nonce)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallengeValue)
  url.searchParams.set('code_challenge_method', 'S256')

  const installId = YouVersionPlatformConfiguration.installationId
  if (installId) url.searchParams.set('x-yvp-installation-id', installId)

  const scopeValue = scopeString(scopes)
  if (scopeValue) url.searchParams.set('scope', scopeValue)

  const permissionsValue = [...permissions].sort().join(',')
  if (permissionsValue) url.searchParams.set('requested_permissions', permissionsValue)

  console.info('YouVersion sign-in redirectUrl:', redirectUrl)
  console.info('YouVersion authorize URL:', url.toString())
  window.location.href = url.toString()
}
