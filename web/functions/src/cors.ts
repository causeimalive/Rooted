import type { Response } from 'express'

export const ALLOWED_ORIGINS = new Set([
  'https://rootedinchrist.faith',
  'https://www.rootedinchrist.faith',
  'https://app.rootedinchrist.faith',
  'https://rootedinchrist-faith.web.app',
  'https://rootedinchrist-faith-2026.web.app',
  'https://rootedinchrist-faith.firebaseapp.com',
  'https://rootedinchrist-faith-2026.firebaseapp.com',
  'http://localhost:5173',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
])

export function isAllowedOrigin(origin: string | undefined): string | null {
  if (!origin) return null
  if (ALLOWED_ORIGINS.has(origin)) return origin
  if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) return origin
  return null
}

export function setCorsHeaders(res: Response, origin: string | null, methods = 'GET, POST, PUT, DELETE, PATCH, OPTIONS'): void {
  res.setHeader('Access-Control-Allow-Methods', methods)
  res.setHeader(
    'Access-Control-Allow-Headers',
    'authorization, x-yvp-app-key, x-yvp-installation-id, x-yvp-sdk, content-type',
  )
  res.setHeader('Access-Control-Max-Age', '7200')
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
}
