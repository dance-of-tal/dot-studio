import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import './primitives.css'
import App from './App'
import { queryClient } from './lib/query-client'

// Prevent browser pinch-to-zoom (capture phase ensures we intercept before any child handler)
document.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) e.preventDefault() }, { passive: false, capture: true })
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false, capture: true } as any)
document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false, capture: true } as any)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
