import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

const root = document.getElementById('root') as HTMLElement
const app = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// The built pages arrive with their HTML already in place, so React attaches to it instead of redrawing.
if (root.hasChildNodes()) {
  ReactDOM.hydrateRoot(root, app)
} else {
  ReactDOM.createRoot(root).render(app)
}
