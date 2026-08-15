import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from './i18n.tsx'
import App from './App.tsx'
import AuthGate from './AuthGate.tsx'
import { YouVersionAPIUsers, YouVersionPlatformConfiguration } from '@youversion/platform-core'
import './index.css'

const originalObtainLocation = (YouVersionAPIUsers as any).obtainLocation
if (originalObtainLocation) {
  (YouVersionAPIUsers as any).obtainLocation = function (callbackURL: string, state: string) {
    const url = new URL(callbackURL)
    const params = new URLSearchParams(url.search)
    if (params.get('state') !== state) {
      throw new Error('Invalid state parameter')
    }
    const serverCallbackUrl = new URL(
      `https://${YouVersionPlatformConfiguration.apiHost}/auth/callback`,
    )
    params.forEach((value, key) => {
      serverCallbackUrl.searchParams.set(key, value)
    })
    const redirectUri = localStorage.getItem('youversion-auth-redirect-uri')
    if (redirectUri) {
      serverCallbackUrl.searchParams.set('redirect_uri', redirectUri)
    }
    window.location.href = serverCallbackUrl.toString()
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
