import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { I18nProvider } from './i18n.tsx'
import App from './App.tsx'
import AuthGate from './AuthGate.tsx'
import { YouVersionAPIUsers, YouVersionPlatformConfiguration } from '@youversion/platform-core'
import './index.css'

const isNative = Capacitor.isNativePlatform()
const bridgeState = new URLSearchParams(window.location.search).get('state')
const isMobileBridge = bridgeState ? bridgeState.endsWith(':app') : false

if (!isNative && isMobileBridge) {
  window.location.replace('com.rooted.christ://auth/' + window.location.search)
} else {
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
      console.info('YouVersion obtainLocation URL:', serverCallbackUrl.toString())
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
}
