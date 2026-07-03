import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'
import { ensureWebApi } from './web/api'

// Desktop build: Electron preload provides window.api. Web build: install the
// HTTP shim (no-op if window.api already exists).
ensureWebApi()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
