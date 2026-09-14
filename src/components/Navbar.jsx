// components/Navbar.jsx
// Barra de navegación superior compartida por los dashboards
// de Operaciones y Finanzas.
//
// Props:
//   - titulo (string): texto principal de la navbar (ej: "Cash Flow")
//   - accentColor (string): clase de Tailwind para el color del título
//     (permite diferenciar visualmente el rol activo)

import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Navbar({ titulo, accentColor = 'text-white' }) {
  const { perfil, logout } = useAuth()
  const navigate = useNavigate()

  // Maneja el click en "Cerrar sesión": cierra la sesión y
  // deja que onAuthStateChange de Supabase limpie el estado global,
  // lo que hace que ProtectedRoute redirija automáticamente a /login.
  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="bg-slate-900 border-b border-slate-700/60">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">

        {/* ── Título de la sección ──────────────────────────── */}
        <span className={`text-base font-semibold tracking-tight ${accentColor}`}>
          {titulo}
        </span>

        {/* ── Info del usuario + logout ─────────────────────── */}
        <div className="flex items-center gap-5">
          {/* Nombre del usuario logueado */}
          {perfil && (
            <span className="text-slate-300 text-sm">
              {perfil.nombre} {perfil.apellido}
            </span>
          )}

          {/* Separador vertical */}
          <span className="w-px h-4 bg-slate-600" aria-hidden="true" />

          {/* Botón de cierre de sesión */}
          <button
            onClick={handleLogout}
            className="text-slate-400 text-sm hover:text-white transition-colors duration-150"
          >
            Cerrar sesión
          </button>
        </div>

      </div>
    </header>
  )
}
