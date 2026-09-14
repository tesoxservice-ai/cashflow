// pages/Login.jsx
// Pantalla de inicio de sesión.
//
// Flujo:
//   1. El usuario ingresa email + contraseña y presiona "Ingresar"
//   2. Se llama a supabase.auth.signInWithPassword()
//   3. Si hay error → se muestra un mensaje inline
//   4. Si ok → onAuthStateChange en AuthContext actualiza el estado,
//      y el efecto de redirección en este componente lleva al usuario
//      a su dashboard según su rol

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

// Mapa de rutas por rol (igual que en ProtectedRoute)
const RUTA_POR_ROL = {
  operaciones: '/operaciones',
  finanzas:    '/finanzas',
}

export default function Login() {
  const navigate = useNavigate()
  const { user, perfil, loading } = useAuth()

  // Campos del formulario
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')

  // Estado de la solicitud de login
  const [cargando, setCargando] = useState(false)
  const [error, setError]       = useState('')

  // ── Redirección automática si ya hay sesión activa ────────────
  // Evita que un usuario logueado vea la pantalla de login
  useEffect(() => {
    if (!loading && user && perfil) {
      const destino = RUTA_POR_ROL[perfil.rol] || '/login'
      navigate(destino, { replace: true })
    }
  }, [user, perfil, loading, navigate])

  // ── Manejo del submit ─────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setCargando(true)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email:    email.trim(),
      password: password,
    })

    if (authError) {
      // Traducimos el mensaje de error más común al español
      if (authError.message.includes('Invalid login credentials')) {
        setError('Email o contraseña incorrectos.')
      } else {
        setError('Ocurrió un error al iniciar sesión. Intentá de nuevo.')
      }
      setCargando(false)
      return
    }

    // Si el login fue exitoso, onAuthStateChange en AuthContext
    // actualiza user y perfil → el useEffect de arriba redirige
    // No seteamos cargando(false) aquí a propósito: el spinner
    // se mantiene hasta que la redirección ocurre, evitando un flash
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* ── Encabezado ──────────────────────────────────────── */}
        <div className="mb-8 text-center">
          {/* Ícono decorativo: gráfico de barras estilizado con CSS */}
          <div className="inline-flex items-end gap-0.5 mb-5" aria-hidden="true">
            <span className="w-1.5 h-4 bg-blue-500 rounded-sm opacity-60" />
            <span className="w-1.5 h-6 bg-blue-500 rounded-sm opacity-80" />
            <span className="w-1.5 h-8 bg-blue-400 rounded-sm" />
            <span className="w-1.5 h-5 bg-blue-500 rounded-sm opacity-80" />
            <span className="w-1.5 h-3 bg-blue-500 rounded-sm opacity-60" />
          </div>
          <h1 className="text-white text-xl font-semibold tracking-tight">
            Cash Flow Predictivo
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Ingresá con tu cuenta corporativa
          </p>
        </div>

        {/* ── Card del formulario ──────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-2xl shadow-black/40 p-8">
          <form onSubmit={handleSubmit} noValidate className="space-y-5">

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="nombre@empresa.com"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200
                           text-slate-900 placeholder:text-slate-400
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           transition-shadow duration-150"
              />
            </div>

            {/* Contraseña */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200
                           text-slate-900 placeholder:text-slate-400
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           transition-shadow duration-150"
              />
            </div>

            {/* Mensaje de error inline */}
            {error && (
              <div className="flex items-start gap-2.5 bg-red-50 border border-red-100
                              text-red-700 text-sm rounded-lg px-3.5 py-3">
                {/* Ícono de advertencia */}
                <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd"
                    d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28
                       10.875c.673 1.167-.17 2.625-1.516
                       2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485
                       2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0
                       01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Botón de submit */}
            <button
              type="submit"
              disabled={cargando || !email || !password}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800
                         disabled:opacity-50 disabled:cursor-not-allowed
                         text-white text-sm font-medium
                         px-4 py-2.5 rounded-lg
                         transition-colors duration-150
                         flex items-center justify-center gap-2"
            >
              {/* Spinner mientras carga */}
              {cargando && (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white
                                 rounded-full animate-spin" />
              )}
              {cargando ? 'Verificando…' : 'Ingresar'}
            </button>

          </form>
        </div>

        {/* Pie discreto */}
        <p className="text-center text-slate-600 text-xs mt-6">
          Acceso restringido al personal autorizado
        </p>

      </div>
    </div>
  )
}
