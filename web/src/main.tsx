import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { I18nProvider } from './i18n.tsx'
import App from './App.tsx'
import AuthGate from './AuthGate.tsx'
import './index.css'

// A normal browser landed on a YouVersion OAuth callback. The PKCE state and
// code verifier live in the native app's WebView storage, so the browser cannot
// exchange the code. Only the final code/error callback goes to the native app;
// intermediate state-only callbacks are forwarded to YouVersion to get the code.
if (!Capacitor.isNativePlatform()) {
  const params = new URLSearchParams(window.location.search)
  const state = params.get('state')
  const code = params.get('code')
  const error = params.get('error')
  const storedState = localStorage.getItem('youversion-auth-state')
  const isWebAuth = state && storedState === state
  if (!isWebAuth) {
    if (code || error) {
      const isAndroid = /Android/i.test(navigator.userAgent)
      const deepLink = isAndroid
        ? `intent://auth${window.location.search}#Intent;scheme=com.rooted.christ;package=com.rooted.christ;end`
        : `com.rooted.christ://auth/${window.location.search}`
      window.location.replace(deepLink)
    } else if (state) {
      window.location.replace(`https://api.youversion.com/auth/callback${window.location.search}`)
    }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <I18nProvider>
        <App />
      </I18nProvider>
    </AuthGate>
  </StrictMode>,
)
