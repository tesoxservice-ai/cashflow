// components/TopNav.jsx
// Barra superior con logo, usuario y cierre de sesión. Es la misma que se
// repite dentro de cada página; las páginas nuevas pueden usar esta.

import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const IconBell = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0
         006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714
         0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
  </svg>
)
const IconChevronDown = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
)
const IconLogout = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0
         007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
  </svg>
)

export default function TopNav({ perfil }) {
  const { logout } = useAuth()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const iniciales = perfil ? `${perfil.nombre?.[0] ?? ''}${perfil.apellido?.[0] ?? ''}` : 'U'

  return (
    <header className="bg-white border-b border-slate-100 px-6 py-3 flex items-center justify-between sticky top-0 z-20">
      <img src="/logo-psdata.png" alt="PSDATA" className="h-14" />
      <div className="flex items-center gap-4">
        <button className="w-9 h-9 rounded-full flex items-center justify-center
                           text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
          <IconBell />
        </button>
        <div className="w-px h-6 bg-slate-200" />
        <div className="relative">
          <button onClick={() => setMenuAbierto(v => !v)}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: '#0e7490' }}>
              {iniciales}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-slate-800 text-sm font-semibold leading-none">
                {perfil ? `${perfil.nombre} ${perfil.apellido}` : 'Usuario'}
              </p>
              <p className="text-slate-400 text-xs mt-0.5 leading-none capitalize">{perfil?.rol ?? ''}</p>
            </div>
            <span className={`transition-transform duration-200 ${menuAbierto ? 'rotate-180' : ''}`}>
              <IconChevronDown />
            </span>
          </button>
          {menuAbierto && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuAbierto(false)} />
              <div className="absolute right-0 mt-3 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-1.5 z-20">
                <div className="px-4 py-2.5 border-b border-slate-100">
                  <p className="text-slate-800 text-sm font-semibold truncate">
                    {perfil ? `${perfil.nombre} ${perfil.apellido}` : 'Usuario'}
                  </p>
                  <p className="text-slate-400 text-xs capitalize mt-0.5">{perfil?.rol ?? ''}</p>
                </div>
                <button onClick={async () => { setMenuAbierto(false); await logout() }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                  <IconLogout />
                  Cerrar sesión
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
