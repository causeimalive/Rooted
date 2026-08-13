import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (!env.VITE_GOOGLE_MAPS_API_KEY) {
    throw new Error('VITE_GOOGLE_MAPS_API_KEY is required. Add it to web/.env (e.g. VITE_GOOGLE_MAPS_API_KEY=...).')
  }
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
    },
  }
})
