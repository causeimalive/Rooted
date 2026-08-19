const ANONYMOUS_USER_ID = 'anonymous'

export type VersionBrowseLanguagePreference = 'auto' | 'en' | 'es' | 'all'
export const VERSION_BROWSE_LANGUAGE_KEY = 'bible-study-yv-version-browse-language'
export const VERSION_BROWSE_LANGUAGE_CHANGED_EVENT = 'bible-study-yv-version-browse-language-changed'
export const VERSION_PINNED_KEY = 'bible-study-yv-version-pinned-ids'
export const VERSION_PINNED_CHANGED_EVENT = 'bible-study-yv-version-pinned-ids-changed'

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

function isVersionBrowseLanguagePreference(value: string | null): value is VersionBrowseLanguagePreference {
  return value === 'auto' || value === 'en' || value === 'es' || value === 'all'
}

function parseVersionIdList(value: string | null): number[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return Array.from(new Set(parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item))))
  } catch {
    return []
  }
}

export function getPinnedVersionIds(userId: string | null | undefined): number[] {
  return parseVersionIdList(getUserPreference(userId, VERSION_PINNED_KEY))
}

export function setPinnedVersionIds(userId: string | null | undefined, value: number[]): void {
  const ids = Array.from(new Set(value.map((item) => Number(item)).filter((item) => Number.isFinite(item))))
  setUserPreference(userId, VERSION_PINNED_KEY, JSON.stringify(ids))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(VERSION_PINNED_CHANGED_EVENT, { detail: ids }))
  }
}

export function getVersionBrowseLanguagePreference(userId: string | null | undefined): VersionBrowseLanguagePreference {
  const saved = getUserPreference(userId, VERSION_BROWSE_LANGUAGE_KEY)
  return isVersionBrowseLanguagePreference(saved) ? saved : 'auto'
}

export function setVersionBrowseLanguagePreference(
  userId: string | null | undefined,
  value: VersionBrowseLanguagePreference,
): void {
  setUserPreference(userId, VERSION_BROWSE_LANGUAGE_KEY, value)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(VERSION_BROWSE_LANGUAGE_CHANGED_EVENT, { detail: value }))
  }
}

export function resolveVersionBrowseLanguagePreference(
  preference: VersionBrowseLanguagePreference,
  appLanguage: string,
): 'en' | 'es' | null {
  if (preference === 'all') return null
  if (preference === 'auto') return appLanguage.toLowerCase().startsWith('es') ? 'es' : 'en'
  return preference
}
