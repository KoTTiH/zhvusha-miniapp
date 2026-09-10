import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { purgeLegacySharedKeys } from './lib/storage'
import { initTelegram } from './lib/tma'

async function bootstrap(): Promise<void> {
  await initTelegram()
  const purged = purgeLegacySharedKeys()
  if (purged > 0) {
    console.warn(`[zhvusha] purged ${purged} legacy shared localStorage keys`)
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
