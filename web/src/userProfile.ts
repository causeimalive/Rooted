const ANONYMOUS_USER_ID = 'anonymous'

export type VersionBrowseLanguagePreference = 'auto' | 'en' | 'es' | 'all'
export const VERSION_BROWSE_LANGUAGE_KEY = 'bible-study-yv-version-browse-language'
export const VERSION_BROWSE_LANGUAGE_CHANGED_EVENT = 'bible-study-yv-version-browse-language-changed'

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
