// context/AuthContext.jsx
// Contexto global de autenticación.
// Gestiona la sesión de Supabase Auth y el perfil del usuario
// (nombre, apellido, rol) obtenido desde la tabla 'usuarios'.
//
// Expone mediante useAuth():
//   - user    → objeto de sesión de Supabase (o null si no hay sesión)
//   - perfil  → { nombre, apellido, rol } de la tabla usuarios (o null)
//   - loading → true mientras se resuelve la sesión inicial
//   - logout  → función async para cerrar sesión

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// Creamos el contexto con valor por defecto null
const AuthContext = createContext(null)

// ─────────────────────────────────────────────
// Hook de consumo: useAuth()
// ─────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  }
  return ctx
}

// ─────────────────────────────────────────────
// Proveedor: <AuthProvider>
// ─────────────────────────────────────────────
export function AuthProvider({ children }) {
  // Sesión de Supabase Auth (objeto con user, access_token, etc.)
  const [user, setUser] = useState(null)

  // Perfil desde la tabla 'usuarios': { nombre, apellido, rol }
  const [perfil, setPerfil] = useState(null)

  // Indica si todavía se está resolviendo la sesión inicial
  // (evita que las rutas protegidas redirigen antes de tiempo)
  const [loading, setLoading] = useState(true)

  // ─── Carga el perfil desde la tabla 'usuarios' ───────────────
  async function cargarPerfil(userId) {
    const { data, error } = await supabase
      .from('usuarios')
      .select('nombre, apellido, rol')
      .eq('id', userId)
      .single()

    if (error) {
      // Si no existe el perfil (ej: usuario de auth sin registro en la tabla)
      // dejamos perfil en null; ProtectedRoute manejará el caso
      console.error('[AuthContext] Error cargando perfil:', error.message)
      setPerfil(null)
      return
    }

    // Guardamos el perfil en el estado global
    setPerfil(data)
  }

  // ─── Efecto principal: escucha cambios de sesión ──────────────
  useEffect(() => {
    // onAuthStateChange dispara inmediatamente con la sesión actual
    // y luego cada vez que el usuario se loguea o desloguea
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          // Hay sesión activa: guardamos el user y cargamos su perfil
          setUser(session.user)
          await cargarPerfil(session.user.id)
        } else {
          // Sin sesión: limpiamos todo el estado
          setUser(null)
          setPerfil(null)
        }

        // Una vez que Supabase resolvió el estado inicial, dejamos de cargar
        setLoading(false)
      }
    )

    // Limpiamos la suscripción cuando el componente se desmonta
    return () => subscription.unsubscribe()
  }, [])

  // ─── Función de cierre de sesión ─────────────────────────────
  async function logout() {
    await supabase.auth.signOut()
    // El listener onAuthStateChange se encarga de limpiar user y perfil
  }

  // ─── Valor del contexto ───────────────────────────────────────
  const value = {
    user,    // objeto sesión de Supabase
    perfil,  // { nombre, apellido, rol }
    loading, // boolean: true mientras carga la sesión inicial
    logout,  // función async para cerrar sesión
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
