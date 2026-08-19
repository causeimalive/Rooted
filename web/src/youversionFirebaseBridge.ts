import { signInWithCustomToken } from 'firebase/auth'
import { auth } from './firebase'

// Bookmarks, notes, and recent searches are stored in Firestore under
// users/{uid}/..., but Firestore's security rules only allow access when
// there's a real Firebase Auth session (request.auth.uid == uid). Signing
// in with YouVersion alone never creates one, so without this bridge that
// data silently never reaches the cloud for YouVersion-only sign-ins and
// only lives in that one browser's local storage.
//
// This calls the mintYouVersionFirebaseToken Cloud Function, which verifies
// the YouVersion access token against YouVersion's own API and, if valid,
// mints a Firebase custom token for a uid derived from the YouVersion user
// id. Signing in with that token gives the app a real Firebase session, so
// the existing bookmark/note/search sync logic (which already prefers
// firebaseUser.uid) picks it up automatically.
const MINT_TOKEN_ENDPOINT = '/api/auth/youversion-token'

export async function linkYouVersionToFirebase(
  userId: string,
  accessToken: string,
  appKey: string,
): Promise<boolean> {
  try {
    const response = await fetch(MINT_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, accessToken, appKey }),
    })
    if (!response.ok) return false
    const data = (await response.json()) as { token?: string }
    if (!data.token) return false
    await signInWithCustomToken(auth, data.token)
    return true
  } catch {
    return false
  }
}
