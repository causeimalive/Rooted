import { FormEvent, ReactNode, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth'
import { LogIn, LogOut, ArrowLeft, Sun, Moon } from 'lucide-react'
import { YouVersionProvider } from '@youversion/platform-react-ui'
import { useYVAuth } from '@youversion/platform-react-hooks'
import { auth } from './firebase'
import Landing from './Landing'
const YOUVERSION_API_HOST = 'rootedinchrist.faith/api/youversion'
import { beginYouVersionSignIn, getYouVersionRedirectUrl } from './youversionRedirect'

type Theme = 'dark' | 'light'

const YOUVERSION_APP_KEY = import.meta.env.VITE_YVP_APP_KEY?.trim() ?? ''

function getInitialTheme(): Theme {
  const saved = localStorage.getItem('bible-study-theme') as Theme | null
  if (saved === 'dark' || saved === 'light') return saved
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button
      className="secondary"
      onClick={onToggle}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
    >
      {theme === 'light' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}

function friendlyAuthError(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'Enter a valid email address.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.'
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.'
    default:
      return 'Unable to sign in. Please try again.'
  }
}

function LoginScreen({
  onBack,
  theme,
  onToggleTheme,
  onYouVersionLogin,
  callbackError,
}: {
  onBack: () => void
  theme: Theme
  onToggleTheme: () => void
  onYouVersionLogin?: () => void | Promise<void>
  callbackError?: string | null
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const brandingVersion = '20260803c'

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (err: any) {
      setError(friendlyAuthError(err?.code ?? ''))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        background: 'var(--bg)',
        color: 'var(--text)',
        padding: 'clamp(1rem, 4vw, 1.5rem)',
        position: 'relative',
        overflowY: 'auto',
      }}
    >
      <button
        className="secondary"
        onClick={onBack}
        style={{ position: 'absolute', top: 'clamp(0.75rem, 3vw, 1.5rem)', left: 'clamp(0.75rem, 3vw, 1.5rem)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
      >
        <ArrowLeft size={16} /> Back
      </button>
      <div style={{ position: 'absolute', top: 'clamp(0.75rem, 3vw, 1.5rem)', right: 'clamp(0.75rem, 3vw, 1.5rem)' }}>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
      <form
        onSubmit={handleSubmit}
        style={{
          width: 'min(100%, 26rem)',
          maxWidth: '100%',
          background: 'var(--surface)',
          borderRadius: '1.1rem',
          padding: 'clamp(1.25rem, 4vw, 2rem)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.9rem',
          boxShadow: '0 20px 45px rgba(0,0,0,0.25)',
          marginTop: 'clamp(3.25rem, 10vw, 4.5rem)',
        }}
      >
        <img
          src={theme === 'dark' ? `/branding/tan/wordmark-192.png?v=${brandingVersion}` : `/branding/green/wordmark-192.png?v=${brandingVersion}`}
          alt="Rooted"
          style={{ height: 48, alignSelf: 'center', marginBottom: '0.25rem' }}
        />
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>
          Sign in to continue
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem' }}>
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem' }}>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {(error || callbackError) && (
          <div style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error ?? callbackError}</div>
        )}
        <button type="submit" disabled={submitting} style={{ width: '100%' }}>
          {submitting ? 'Signing in…' : 'Sign In'}
        </button>
        {onYouVersionLogin ? (
          <>
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.2rem' }}>
              Or use YouVersion to continue
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() => void onYouVersionLogin()}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', width: '100%' }}
            >
              <LogIn size={16} /> Sign in with YouVersion
            </button>
          </>
        ) : null}
      </form>
    </div>
  )
}

export function AuthSignInButton() {
  const { auth: yvAuth } = useYVAuth()

  if (yvAuth.isAuthenticated) return null

  return (
    <button
      type="button"
      className="secondary header-signin"
      onClick={async () => {
        const redirectUrl = getYouVersionRedirectUrl()
        await beginYouVersionSignIn(redirectUrl, ['openid', 'profile'], ['highlights'])
      }}
      title="Sign in with YouVersion"
      aria-label="Sign in with YouVersion"
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', padding: '0.55rem 0.75rem' }}
    >
      <LogIn size={16} /> YouVersion
    </button>
  )
}

export function AuthSignOutButton() {
  const { auth: yvAuth, signOut: yvSignOut } = useYVAuth()
  const handleSignOut = async () => {
    try {
      if (yvAuth.isAuthenticated) {
        await yvSignOut()
      }
    } catch (error) {
      console.error('YouVersion sign out failed:', error)
    }
    try {
      await signOut(auth)
    } catch (error) {
      console.error('Firebase sign out failed:', error)
    }
  }
  return (
    <button
      type="button"
      className="secondary header-signout"
      onClick={handleSignOut}
      title="Sign out"
      aria-label="Sign out"
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.55rem' }}
    >
      <LogOut size={16} />
    </button>
  )
}

function AuthGateNoProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null | undefined>(undefined)
  const [showLogin, setShowLogin] = useState(false)
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      if (!nextUser) setShowLogin(false)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('bible-study-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  if (user === undefined) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
          color: 'var(--text-muted)',
        }}
      >
        Loading�
      </div>
    )
  }

  if (!user) {
    return showLogin ? (
      <LoginScreen
        onBack={() => setShowLogin(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    ) : (
      <Landing onLogin={() => setShowLogin(true)} theme={theme} onToggleTheme={toggleTheme} />
    )
  }

  return <>{children}</>
}

function AuthGateContent({
  children,
  theme,
  onToggleTheme,
}: {
  children: ReactNode
  theme: Theme
  onToggleTheme: () => void
}) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null | undefined>(undefined)
  const [showLogin, setShowLogin] = useState(false)
  const { auth: yvAuth } = useYVAuth()
  const callbackError = yvAuth.error?.message ?? null

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setFirebaseUser(nextUser)
      if (!nextUser) setShowLogin(false)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const timeout = setTimeout(() => {
      setFirebaseUser((u) => (u === undefined ? null : u))
    }, 5000)
    return () => clearTimeout(timeout)
  }, [])

  const isAuthenticated = Boolean(firebaseUser) || yvAuth.isAuthenticated
  const isOAuthCallback =
    typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).has('state') ||
      new URLSearchParams(window.location.search).has('code') ||
      new URLSearchParams(window.location.search).has('error'))

  if (!isAuthenticated && (firebaseUser === undefined || yvAuth.isLoading || (isOAuthCallback && !callbackError))) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
          color: 'var(--text-muted)',
        }}
      >
        Loading…
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <AuthEntryScreen
        showLogin={showLogin}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onLogin={() => setShowLogin(true)}
        onBack={() => setShowLogin(false)}
        callbackError={callbackError}
      />
    )
  }

  return <>{children}</>
}

function AuthEntryScreen({
  showLogin,
  theme,
  onToggleTheme,
  onLogin,
  onBack,
  callbackError,
}: {
  showLogin: boolean
  theme: Theme
  onToggleTheme: () => void
  onLogin: () => void
  onBack: () => void
  callbackError: string | null
}) {
  const handleYouVersionLogin = async () => {
    const redirectUrl = getYouVersionRedirectUrl()
    await beginYouVersionSignIn(redirectUrl, ['openid', 'profile'], ['highlights'])
  }

  return showLogin ? (
    <LoginScreen
      onBack={onBack}
      theme={theme}
      onToggleTheme={onToggleTheme}
      onYouVersionLogin={handleYouVersionLogin}
      callbackError={callbackError}
    />
  ) : (
    <Landing
      onLogin={onLogin}
      theme={theme}
      onToggleTheme={onToggleTheme}
    />
  )
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('bible-study-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  if (!YOUVERSION_APP_KEY) {
    return <AuthGateNoProvider>{children}</AuthGateNoProvider>
  }

  return (
    <YouVersionProvider appKey={YOUVERSION_APP_KEY} apiHost={YOUVERSION_API_HOST} theme={theme} includeAuth={true} authRedirectUrl={getYouVersionRedirectUrl()}>
      <AuthGateContent theme={theme} onToggleTheme={toggleTheme}>
        {children}
      </AuthGateContent>
    </YouVersionProvider>
  )
}

