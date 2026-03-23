import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import './primitives.css'
import App from './App'
import { queryClient } from './lib/query-client'

// Prevent browser pinch-to-zoom (capture phase ensures we intercept before any child handler)
const preventGestureZoom = (event: Event) => event.preventDefault()
const gestureListenerOptions: AddEventListenerOptions = { passive: false, capture: true }

document.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) e.preventDefault() }, { passive: false, capture: true })
document.addEventListener('gesturestart', preventGestureZoom, gestureListenerOptions)
document.addEventListener('gesturechange', preventGestureZoom, gestureListenerOptions)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
