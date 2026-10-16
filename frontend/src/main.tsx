import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ready } from '@thebes/sdk'
import { HashRouter } from 'react-router-dom'
import './index.css'
import { App } from './App'

// HashRouter (not BrowserRouter): the contract serves exact asset paths and has
// no SPA rewrite, so client-side deep links live under `#/…` and always resolve
// to index.html. Every route is reachable on refresh + share.
const root = createRoot(document.getElementById('root')!)
const render = () =>
  root.render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)

// This browser's signing key (made on a first visit, kept after) is loaded before
// the first render, because pages read identity() while rendering. A browser that
// cannot sign still gets the page; its calls then fail with a named error.
ready().then(render, render)
