// main.jsx
// Punto de entrada de la aplicación React.
// Monta el árbol de componentes en el elemento #root del index.html.
//
// Orden de providers (de afuera hacia adentro):
//   BrowserRouter → AuthProvider → App
//
// BrowserRouter debe envolver todo para que React Router funcione.
// AuthProvider debe estar dentro de BrowserRouter porque algunos
// hooks de navegación pueden usarse en contextos futuros del auth.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import { AuthProvider } from './context/AuthContext'
import App from './App'

// Importación del CSS global con las directivas de Tailwind
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
)
