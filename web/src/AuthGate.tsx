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
import { getYouVersionRedirectUrl } from './youversionRedirect'

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
}: {
  onBack: () => void
  theme: Theme
  onToggleTheme: () => void
  onYouVersionLogin?: () => void | Promise<void>
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
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        color: 'var(--text)',
        padding: '1.5rem',
        position: 'relative',
      }}
    >
      <button
        className="secondary"
        onClick={onBack}
        style={{ position: 'absolute', top: '1.5rem', left: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
      >
        <ArrowLeft size={16} /> Back
      </button>
      <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem' }}>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: 360,
          background: 'var(--surface)',
          borderRadius: '1rem',
          padding: '2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.9rem',
          boxShadow: '0 20px 45px rgba(0,0,0,0.25)',
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
        {error && (
          <div style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</div>
        )}
        <button type="submit" disabled={submitting}>
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
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
            >
              <LogIn size={16} /> Sign in with YouVersion
            </button>
          </>
        ) : null}
      </form>
    </div>
  )
}

export function AuthSignOutButton() {
  return (
    <button
      type="button"
      className="secondary"
      onClick={() => signOut(auth)}
      title="Sign out"
      aria-label="Sign out"
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.55rem' }}
    >
      <LogOut size={16} />
    </button>
  )
}

export default function AuthGate({ children }: { children: ReactNode }) {
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

  const loginScreen = (
    <LoginScreen onBack={() => setShowLogin(false)} theme={theme} onToggleTheme={toggleTheme} />
  )

  const landingScreen = (
    <Landing onLogin={() => setShowLogin(true)} theme={theme} onToggleTheme={toggleTheme} />
  )

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
        Loading…
      </div>
    )
  }

  if (!user) {
    if (!YOUVERSION_APP_KEY) {
      return showLogin ? loginScreen : landingScreen
    }

    return (
      <YouVersionProvider appKey={YOUVERSION_APP_KEY} theme={theme} includeAuth={true} authRedirectUrl={getYouVersionRedirectUrl()}>
        <AuthEntryScreen
          showLogin={showLogin}
          theme={theme}
          onToggleTheme={toggleTheme}
          onLogin={() => setShowLogin(true)}
          onBack={() => setShowLogin(false)}
        />
      </YouVersionProvider>
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
}: {
  showLogin: boolean
  theme: Theme
  onToggleTheme: () => void
  onLogin: () => void
  onBack: () => void
}) {
  const { signIn } = useYVAuth()

  const handleYouVersionLogin = async () => {
    await signIn({
      redirectUrl: getYouVersionRedirectUrl(),
      scopes: ['profile', 'email'],
      permissions: ['highlights'],
    })
  }

  return showLogin ? (
    <LoginScreen
      onBack={onBack}
      theme={theme}
      onToggleTheme={onToggleTheme}
      onYouVersionLogin={handleYouVersionLogin}
    />
  ) : (
    <Landing
      onLogin={onLogin}
      theme={theme}
      onToggleTheme={onToggleTheme}
      onYouVersionLogin={handleYouVersionLogin}
    />
  )
}
