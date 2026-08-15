import { onRequest } from 'firebase-functions/v2/https'
import type { Request, Response } from 'express'
import getRawBody from 'raw-body'
import { logger } from 'firebase-functions'

const ALLOWED_ORIGINS = new Set([
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

function isAllowedOrigin(origin: string | undefined): string | null {
  if (!origin) return null
  if (ALLOWED_ORIGINS.has(origin)) return origin
  if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) return origin
  return null
}

function setCorsHeaders(res: Response, origin: string | null): void {
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
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

export const proxyYouVersion = onRequest(
  { region: 'us-central1' },
  async (req: Request, res: Response) => {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined
    const allowedOrigin = isAllowedOrigin(origin)
    setCorsHeaders(res, allowedOrigin)

    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }

    const PROXY_PREFIX = '/api/youversion'
    let path = req.path || '/'
    if (path.startsWith(PROXY_PREFIX)) {
      path = path.slice(PROXY_PREFIX.length) || '/'
    }

    if (path === '/' || !path) {
      res.status(400).send('Missing YouVersion API path')
      return
    }

    const rawHost = req.query.host
    const host = (Array.isArray(rawHost) ? rawHost[0] : rawHost) ?? 'api.youversion.com'
    const query = new URLSearchParams()
    const arrayKey = (key: string) => (key.endsWith('[]') ? key : `${key}[]`)
    for (const [key, value] of Object.entries(req.query)) {
      if (key === 'path' || key === 'host') continue
      if (typeof value === 'string') {
        query.append(key, value)
      } else if (Array.isArray(value)) {
        const useKey = arrayKey(key)
        for (const item of value) {
          query.append(useKey, String(item))
        }
      }
    }
    const queryString = query.toString()
    const yvUrl = `https://${host}${path}${queryString ? `?${queryString}` : ''}`

    const forwardHeaders = new Set([
      'authorization',
      'x-yvp-app-key',
      'x-yvp-installation-id',
      'x-yvp-sdk',
      'accept-language',
      'accept',
      'content-type',
      'content-length',
      'range',
    ])
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(req.headers)) {
      if (forwardHeaders.has(key.toLowerCase()) && typeof value === 'string') {
        headers[key.toLowerCase()] = value
      }
    }
    if (!headers['x-yvp-sdk']) {
      headers['x-yvp-sdk'] = 'ReactSDK=2.5.0'
    }

    let body: Buffer | undefined
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (Buffer.isBuffer((req as any).rawBody)) {
        body = (req as any).rawBody
      } else if (Buffer.isBuffer(req.body)) {
        body = req.body
      } else if (typeof req.body === 'string' && req.body.length > 0) {
        body = Buffer.from(req.body)
      } else if (typeof (req as any).rawBody === 'string' && (req as any).rawBody.length > 0) {
        body = Buffer.from((req as any).rawBody)
      } else {
        try {
          body = await getRawBody(req, {
            length: Number(req.headers['content-length']) || undefined,
            limit: '5mb',
          })
        } catch (e) {
          logger.warn('Could not read request body: ' + String(e) + ' ' + JSON.stringify(e))
        }
      }
      if (body) {
        headers['content-length'] = String(body.length)
      } else {
        logger.warn('Request body missing for ' + req.method + ' ' + req.path)
      }
    }

    try {
      logger.info(`Proxying ${req.method} ${yvUrl}`)
      const yvRes = await fetch(yvUrl, {
        method: req.method,
        headers,
        body,
        redirect: 'manual',
      })
      const responseBuffer = Buffer.from(await yvRes.arrayBuffer())

      res.status(yvRes.status)
      yvRes.headers.forEach((value, key) => {
        const lower = key.toLowerCase()
        if (['content-length', 'transfer-encoding', 'connection', 'content-encoding', 'keep-alive', 'accept-ranges'].includes(lower)) return
        res.setHeader(key, value)
      })
      if (!yvRes.headers.has('content-type') && responseBuffer.length > 0) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      }
      res.send(responseBuffer)
    } catch (error: any) {
      logger.error('YouVersion proxy request failed', error)
      res.status(502).send(`Proxy request failed: ${error.message || String(error)}`)
    }
  },
)
