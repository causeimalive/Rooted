import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from './i18n.tsx'
import App from './App.tsx'
import AuthGate from './AuthGate.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <I18nProvider>
        <App />
      </I18nProvider>
    </AuthGate>
  </StrictMode>,
)
