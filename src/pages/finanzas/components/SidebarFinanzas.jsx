// pages/finanzas/components/SidebarFinanzas.jsx
// Barra lateral de navegación de Finanzas, fija a la izquierda en todos los módulos:
// logo, módulos agrupados por sección y el usuario con el cierre de sesión. En
// pantallas chicas se convierte en una barra superior con un menú desplegable.
//
// Las páginas que la usan agregan CLASE_SIDEBAR a su contenedor para dejarle lugar.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'

// Espacio que deja la barra lateral: a la izquierda en escritorio y arriba en celular.
export const CLASE_SIDEBAR = 'lg:pl-[232px] pt-14 lg:pt-0'

const Ico = ({ d, className = 'w-[17px] h-[17px]' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
)

const ICONOS = {
  inicio: 'M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
  obras: 'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z',
  cashflow: 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941',
  ventas: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
  presupuesto: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  margen: 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941M3 3v18h18',
  fima: 'M12 6v12m-4-9h5.5a2.5 2.5 0 010 5H10a2.5 2.5 0 000 5h6',
  historial: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
  salir: 'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75',
  menu: 'M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5',
  cerrar: 'M6 18L18 6M6 6l12 12',
}

const SECCIONES = [
  { titulo: 'General', items: [{ id: 'inicio', label: 'Inicio', ruta: '/finanzas' }] },
  {
    titulo: 'Gestión',
    items: [
      { id: 'cashflow', label: 'Cash Flow', ruta: '/finanzas/cashflow' },
      { id: 'ventas', label: 'Ventas proyectadas', ruta: '/finanzas/ventas' },
      { id: 'obras', label: 'Obras', ruta: '/finanzas/obras' },
    ],
  },
  {
    titulo: 'Análisis',
    items: [
      { id: 'presupuesto', label: 'Presupuesto vs. Real', ruta: '/finanzas/presupuesto' },
      { id: 'margen', label: 'Margen por obra', ruta: '/finanzas/margen' },
      { id: 'fima', label: 'FIMA', ruta: '/finanzas/fima' },
    ],
  },
  { titulo: 'Control', items: [{ id: 'historial', label: 'Historial', ruta: '/finanzas/historial' }] },
]

function Item({ item, activo, onIr }) {
  return (
    <button onClick={() => onIr(item.ruta)}
      className={`group relative w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left border transition-all
        ${activo ? 'bg-teal-50/60 border-teal-200/80' : 'border-transparent hover:bg-slate-50'}`}>
      {activo && <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-teal-600" />}
      <span className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center transition-colors
        ${activo ? 'bg-teal-700 text-white shadow-[0_4px_10px_rgba(14,116,144,0.30)]'
                 : 'bg-slate-50 text-slate-500 group-hover:bg-white group-hover:text-teal-700 group-hover:shadow-sm'}`}>
        <Ico d={ICONOS[item.id]} />
      </span>
      <span className={`text-[13px] font-semibold tracking-tight ${activo ? 'text-teal-900' : 'text-slate-600 group-hover:text-slate-900'}`}>
        {item.label}
      </span>
    </button>
  )
}

function Contenido({ perfil, activo, onIr, onLogout }) {
  const iniciales = perfil ? `${perfil.nombre?.[0] ?? ''}${perfil.apellido?.[0] ?? ''}` : 'U'
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-5 pb-3">
        <img src="/logo-psdata.png" alt="PSDATA" className="h-9" />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pt-4 pb-4 space-y-5">
        {SECCIONES.map(sec => (
          <div key={sec.titulo}>
            <p className="px-2.5 mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{sec.titulo}</p>
            <div className="space-y-0.5">
              {sec.items.map(it => <Item key={it.id} item={it} activo={activo === it.id} onIr={onIr} />)}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3">
        <div className="rounded-2xl bg-slate-50/80 border border-slate-100 p-2.5 flex items-center gap-2.5">
          <span className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-[13px] font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #0e7490, #0d9488)' }}>
            {iniciales}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-bold text-slate-800 truncate leading-tight">
              {perfil ? `${perfil.nombre} ${perfil.apellido}` : 'Usuario'}
            </p>
            <p className="text-[10.5px] text-slate-400 capitalize leading-tight mt-0.5">{perfil?.rol ?? 'Finanzas'}</p>
          </div>
          <button onClick={onLogout} title="Cerrar sesión"
            className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-white hover:shadow-sm transition-all">
            <Ico d={ICONOS.salir} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SidebarFinanzas({ perfil, activo = 'inicio' }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(false)
  const ir = ruta => { setAbierto(false); navigate(ruta) }

  return (
    <>
      {/* Escritorio: fija a la izquierda */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-[232px] bg-white border-r border-slate-100
                        shadow-[8px_0_32px_rgba(15,23,42,0.04)] z-30">
        <Contenido perfil={perfil} activo={activo} onIr={ir} onLogout={logout} />
      </aside>

      {/* Celular: barra superior + menú desplegable */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-30 h-14 bg-white/95 backdrop-blur border-b border-slate-100 px-4 flex items-center justify-between">
        <img src="/logo-psdata.png" alt="PSDATA" className="h-9" />
        <button onClick={() => setAbierto(true)} className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-50">
          <Ico d={ICONOS.menu} className="w-6 h-6" />
        </button>
      </div>
      {abierto && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setAbierto(false)} />
          <aside className="relative w-[272px] max-w-[85%] h-full bg-white shadow-2xl">
            <button onClick={() => setAbierto(false)} className="absolute top-4 right-3 w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-50 z-10">
              <Ico d={ICONOS.cerrar} />
            </button>
            <Contenido perfil={perfil} activo={activo} onIr={ir} onLogout={logout} />
          </aside>
        </div>
      )}
    </>
  )
}
