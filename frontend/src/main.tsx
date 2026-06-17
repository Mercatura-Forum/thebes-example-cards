import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import { App } from './App'

// HashRouter (not BrowserRouter): the contract serves exact asset paths and has
// no SPA rewrite, so client-side deep links live under `#/…` and always resolve
// to index.html. Every route is reachable on refresh + share.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
