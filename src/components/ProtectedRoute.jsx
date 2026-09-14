// components/ProtectedRoute.jsx
// Componente de guarda para rutas protegidas.
//
// Comportamiento:
//   - Mientras carga la sesión → muestra pantalla de carga
//   - Sin sesión activa        → redirige a /login
//   - Con sesión, sin rol      → redirige a /login (perfil roto)
//   - Con rol incorrecto       → redirige al dashboard del rol correcto
//   - Todo ok                  → renderiza los children
//
// Uso en App.jsx:
//   <ProtectedRoute rolRequerido="finanzas">
//     <DashboardFinanzas />
//   </ProtectedRoute>

import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Mapa de destinos por rol (fuente única de verdad para redirecciones)
const RUTA_POR_ROL = {
  operaciones: '/operaciones',
  finanzas:    '/finanzas',
}

export default function ProtectedRoute({ children, rolRequerido }) {
  const { user, perfil, loading } = useAuth()

  // ── 1. Sesión cargando ────────────────────────────────────────
  // Mostramos un spinner centrado mientras Supabase resuelve la sesión.
  // Esto evita un flash de redirección incorrecta.
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          {/* Spinner animado con Tailwind */}
          <div className="w-8 h-8 border-4 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Verificando sesión…</p>
        </div>
      </div>
    )
  }

  // ── 2. Sin sesión → Login ─────────────────────────────────────
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // ── 3. Perfil aún no cargado o roto → Login ──────────────────
  // Caso de usuario de auth sin registro en la tabla 'usuarios'
  if (!perfil) {
    return <Navigate to="/login" replace />
  }

  // ── 4. Rol incorrecto → dashboard del rol correcto ────────────
  // Si el usuario intenta acceder a una ruta que no le corresponde,
  // lo llevamos a su propio dashboard en vez de mostrar un 403.
  if (rolRequerido && perfil.rol !== rolRequerido) {
    const destino = RUTA_POR_ROL[perfil.rol] || '/login'
    return <Navigate to={destino} replace />
  }

  // ── 5. Todo ok → renderizamos la página protegida ─────────────
  return children
}
