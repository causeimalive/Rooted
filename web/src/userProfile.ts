const ANONYMOUS_USER_ID = 'anonymous'

function userStorageKey(userId: string | null | undefined, key: string): string {
  return `bible-study-yv-user-${userId ?? ANONYMOUS_USER_ID}-${key}`
}

export function getUserPreference(
  userId: string | null | undefined,
  key: string,
  fallback: string | null = null,
): string | null {
  return window.localStorage.getItem(userStorageKey(userId, key)) ?? fallback
}

export function setUserPreference(userId: string | null | undefined, key: string, value: string): void {
  window.localStorage.setItem(userStorageKey(userId, key), value)
}

export function removeUserPreference(userId: string | null | undefined, key: string): void {
  window.localStorage.removeItem(userStorageKey(userId, key))
}
