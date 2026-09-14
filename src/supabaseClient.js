// supabaseClient.js
// Crea y exporta el cliente de Supabase como singleton.
// Todos los módulos de la app importan desde aquí para
// reutilizar la misma instancia de conexión.
//
// Las credenciales se leen de variables de entorno de Vite
// (definidas en .env, nunca hardcodeadas en el código).

import { createClient } from '@supabase/supabase-js'

// URL del proyecto Supabase (ej: https://xyzxyz.supabase.co)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

// Clave anónima del proyecto (segura para el frontend con RLS activo)
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Validación temprana: si faltan las variables, se muestra un error
// claro en consola en lugar de un error críptico de red más adelante
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[supabaseClient] Faltan variables de entorno. ' +
    'Copiá .env.example como .env y completá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.'
  )
}

// Exportación del cliente listo para usar en toda la app
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
