import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator && window.isSecureContext) {
  void navigator.serviceWorker.register('/sw.js').catch(() => {
    // Connections settings retries registration and displays any error.
  });
}
