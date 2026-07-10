import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'
import { ensureWebApi } from './web/api'

import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './query/queryClient'
import { useWebsocketQueryInvalidator } from './query/WebsocketQueryInvalidator'
import { AppProvider } from './context/AppContext'

// Desktop build: Electron preload provides window.api. Web build: install the
// HTTP shim (no-op if window.api already exists).
ensureWebApi()

function RootWithProviders() {
  useWebsocketQueryInvalidator()
  return <App />
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <RootWithProviders />
      </AppProvider>
    </QueryClientProvider>
  </React.StrictMode>
)


