import { onRequest } from 'firebase-functions/v2/https'
import type { Request, Response } from 'express'
import { logger } from 'firebase-functions'
import * as admin from 'firebase-admin'
import { isAllowedOrigin, setCorsHeaders } from './cors'

if (admin.apps.length === 0) {
  admin.initializeApp()
}

// Bridges a YouVersion OAuth sign-in into a real Firebase Auth session.
//
// Bookmarks/notes/recent searches live in Firestore under users/{uid}/...,
// and the security rules only allow access when there's a genuine Firebase
// Auth session (request.auth.uid == uid). Signing in with YouVersion alone
// never creates one, so without this bridge that data only ever lives in
// whichever single browser created it and silently fails to sync -- it
// looks like it "disappeared" the moment someone switches devices, clears
// site data, or reinstalls.
//
// YouVersion's client SDK does not expose a JWKS/issuer discovery endpoint
// we can use to cryptographically verify the ID token's signature, so
// identity here is established by proving the caller currently holds a
// live, YouVersion-issued OAuth access token: we make a real call to
// YouVersion's user-scoped Highlights API with it and only mint a token if
// YouVersion's own backend accepts it. That's a meaningfully stronger bar
// than trusting a client-supplied id with no verification at all, though it
// falls short of full signature verification. If YouVersion later publishes
// a JWKS/issuer, this should be upgraded to verify the ID token directly.
export const mintYouVersionFirebaseToken = onRequest(
  { region: 'us-central1' },
  async (req: Request, res: Response) => {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined
    const allowedOrigin = isAllowedOrigin(origin)
    setCorsHeaders(res, allowedOrigin, 'POST, OPTIONS')

    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed')
      return
    }

    const body = typeof req.body === 'object' && req.body ? req.body : {}
    const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
    const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : ''
    const appKey = typeof body.appKey === 'string' ? body.appKey.trim() : ''

    if (!userId || !accessToken || !appKey) {
      res.status(400).json({ error: 'userId, accessToken, and appKey are required' })
      return
    }
    // Namespaced so it can never collide with a Firebase-native uid or any
    // other identity scheme this app might add later.
    const uid = `yv_${userId}`
    if (uid.length > 128) {
      res.status(400).json({ error: 'userId is too long' })
      return
    }

    try {
      // A single, cheap, well-known passage -- we only care whether
      // YouVersion's backend accepts this access token, not the highlight
      // data itself.
      const verifyUrl = 'https://api.youversion.com/v1/highlights?bible_id=1&passage_id=JHN.1.1'
      const verifyRes = await fetch(verifyUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'x-yvp-app-key': appKey,
        },
      })

      if (verifyRes.status === 401 || verifyRes.status === 403) {
        res.status(401).json({ error: 'Invalid or expired YouVersion access token' })
        return
      }
      // Any other response (200/204 with or without highlights, or even an
      // unrelated non-auth error for this specific passage/version) means
      // YouVersion's auth layer itself accepted the token.

      const token = await admin.auth().createCustomToken(uid)
      res.status(200).json({ token })
    } catch (error: any) {
      logger.error('Failed to mint YouVersion-backed Firebase token', error)
      res.status(502).json({ error: 'Failed to verify YouVersion access token' })
    }
  },
)
