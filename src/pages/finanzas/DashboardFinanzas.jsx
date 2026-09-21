// pages/finanzas/DashboardFinanzas.jsx
// Dashboard principal para el rol 'finanzas'. Ruta: /finanzas

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

// ─── Íconos SVG inline ────────────────────────────────────────────────────────

const IconObras = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75
         3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125
         1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75
         4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0
         3h.008v.008h-.008v-.008z" />
  </svg>
)

const IconCashFlow = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0
         0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
  </svg>
)

const IconMovimientos = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0
         0L16.5 12M21 7.5H7.5" />
  </svg>
)

const IconVentas = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342
         1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0
         0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0
         .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504
         1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75
         0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0
         01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0
         11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12
         0h.008v.008H6V10.5z" />
  </svg>
)

const IconExportar = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5
         12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
)

const IconMargen = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0
         0l-5.94-2.28m5.94 2.28l-2.28 5.941M3 3v18h18" />
  </svg>
)

const IconPresupuesto = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125
         1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013
         19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0
         1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125
         1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125
         1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504
         1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
  </svg>
)

const IconBell = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118
         9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64
         3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714
         0a3 3 0 11-5.714 0" />
  </svg>
)

const IconChevronDown = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
)

const IconCalendar = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25
         2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0
         0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121
         11.25v7.5" />
  </svg>
)

const IconArrow = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
)

// ─── Decoración geométrica (esquina superior derecha de cada card) ─────────────

const CardDecoration = () => (
  <div className="absolute top-0 right-0 overflow-hidden rounded-xl w-28 h-28 pointer-events-none">
    <div
      className="absolute"
      style={{
        width: '96px',
        height: '96px',
        top: '-28px',
        right: '-28px',
        borderRadius: '50%',
        border: '24px solid #dbeafe',
        opacity: 0.6,
      }}
    />
    <div
      className="absolute"
      style={{
        width: '56px',
        height: '56px',
        top: '-8px',
        right: '24px',
        borderRadius: '50%',
        border: '16px solid #bfdbfe',
        opacity: 0.4,
      }}
    />
  </div>
)

// ─── Card de módulo ───────────────────────────────────────────────────────────

function ModuloCard({ titulo, descripcion, icono, onIr }) {
  return (
    <div className="relative bg-white rounded-2xl p-6 flex flex-col gap-3
                    shadow-sm hover:shadow-md transition-shadow duration-200
                    border border-slate-100 overflow-hidden cursor-pointer group"
      onClick={onIr}
    >
      <CardDecoration />

      {/* Ícono */}
      <div className="w-12 h-12 rounded-full flex items-center justify-center z-10"
        style={{ backgroundColor: '#e0f2fe', color: '#0e7490' }}>
        {icono}
      </div>

      {/* Texto */}
      <div className="z-10">
        <h3 className="text-slate-800 font-bold text-base leading-snug">{titulo}</h3>
        <p className="text-slate-400 text-sm mt-1 leading-relaxed">{descripcion}</p>
      </div>

      {/* Link */}
      <div className="mt-auto pt-3 border-t border-slate-100 z-10">
        <button
          onClick={e => { e.stopPropagation(); onIr() }}
          className="text-sm font-semibold flex items-center gap-1 transition-colors duration-150"
          style={{ color: '#0e7490' }}
          onMouseEnter={e => e.currentTarget.style.color = '#164e63'}
          onMouseLeave={e => e.currentTarget.style.color = '#0e7490'}
        >
          Ir al módulo
          <IconArrow />
        </button>
      </div>
    </div>
  )
}

// ─── Logo PSDATA ──────────────────────────────────────────────────────────────

function LogoPSData() {
  return (
    <img src="/logo-psdata.png" alt="PSDATA" className="h-11" />
  )
}

const IconLogout = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25
         2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
  </svg>
)

// ─── Navbar ───────────────────────────────────────────────────────────────────

function TopNav({ perfil }) {
  const { logout } = useAuth()
  const [menuAbierto, setMenuAbierto] = useState(false)

  const iniciales = perfil
    ? `${perfil.nombre?.[0] ?? ''}${perfil.apellido?.[0] ?? ''}`
    : 'U'

  const handleCerrarSesion = async () => {
    setMenuAbierto(false)
    await logout()
  }

  return (
    <header className="bg-white border-b border-slate-100 px-6 py-3 flex items-center justify-between sticky top-0 z-20">
      <LogoPSData />

      <div className="flex items-center gap-4">
        {/* Campana */}
        <button className="w-9 h-9 rounded-full flex items-center justify-center
                           text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
          <IconBell />
        </button>

        {/* Divisor */}
        <div className="w-px h-6 bg-slate-200" />

        {/* Avatar + nombre + rol + dropdown */}
        <div className="relative">
          <button
            onClick={() => setMenuAbierto(v => !v)}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center
                            text-xs font-bold text-white"
              style={{ backgroundColor: '#0e7490' }}>
              {iniciales}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-slate-800 text-sm font-semibold leading-none">
                {perfil ? `${perfil.nombre} ${perfil.apellido}` : 'Usuario'}
              </p>
              <p className="text-slate-400 text-xs mt-0.5 leading-none capitalize">
                {perfil?.rol ?? 'Finanzas'}
              </p>
            </div>
            <span className={`transition-transform duration-200 ${menuAbierto ? 'rotate-180' : ''}`}>
              <IconChevronDown />
            </span>
          </button>

          {/* Dropdown */}
          {menuAbierto && (
            <>
              {/* Overlay para cerrar al hacer click afuera */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuAbierto(false)}
              />
              <div className="absolute right-0 mt-3 w-48 bg-white rounded-xl
                              shadow-lg border border-slate-100 py-1.5 z-20
                              animate-fade-in">
                {/* Info del usuario */}
                <div className="px-4 py-2.5 border-b border-slate-100">
                  <p className="text-slate-800 text-sm font-semibold truncate">
                    {perfil ? `${perfil.nombre} ${perfil.apellido}` : 'Usuario'}
                  </p>
                  <p className="text-slate-400 text-xs capitalize mt-0.5">
                    {perfil?.rol ?? 'Finanzas'}
                  </p>
                </div>

                {/* Cerrar sesión */}
                <button
                  onClick={handleCerrarSesion}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm
                             text-red-600 hover:bg-red-50 transition-colors"
                >
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

// ─── Selector de fecha (decorativo / funcional según necesidad) ───────────────

function FechaSelector() {
  const hoy = new Date()
  const fechaFormateada = hoy.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <button className="flex items-center gap-2 border border-slate-200 rounded-lg
                       px-3 py-2 text-sm text-slate-600 hover:bg-slate-50
                       transition-colors bg-white shadow-xs">
      <IconCalendar />
      <span>{fechaFormateada}</span>
      <IconChevronDown />
    </button>
  )
}

// ─── Dashboard principal ──────────────────────────────────────────────────────

export default function DashboardFinanzas() {
  const { perfil } = useAuth()
  const navigate = useNavigate()

  const modulos = [
    {
      titulo: 'Obras',
      descripcion: 'Administración del catálogo de obras: alta, edición y activación.',
      icono: <IconObras />,
      ruta: '/finanzas/obras',
    },
    {
      titulo: 'Cash Flow',
      descripcion: 'Proyección y seguimiento de ingresos y egresos por período.',
      icono: <IconCashFlow />,
      ruta: '/finanzas/cashflow',
    },
    {
      titulo: 'Movimientos',
      descripcion: 'Carga facturas, pagos y movimientos entre cuentas.',
      icono: <IconMovimientos />,
      ruta: '/finanzas/movimientos',
    },
    {
      titulo: 'Ventas Proyectadas',
      descripcion: 'Ingresos esperados cargados por Operaciones. Registralos para que impacten en el Cash Flow.',
      icono: <IconVentas />,
      ruta: '/finanzas/ventas',
    },
    {
      titulo: 'Exportar a Excel',
      descripcion: 'Generá el reporte mensual para el Directorio con 5 hojas.',
      icono: <IconExportar />,
      ruta: '/finanzas/exportar',
    },
    {
      titulo: 'Presupuesto vs. Real',
      descripcion: 'Comparativa entre lo presupuestado y lo ejecutado.',
      icono: <IconPresupuesto />,
      ruta: '/finanzas/presupuesto',
    },
    {
      titulo: 'Margen por Obra',
      descripcion: 'Ingresos proyectados menos egresos presupuestados, por obra y período.',
      icono: <IconMargen />,
      ruta: '/finanzas/margen',
    },
  ]

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f0f7fa' }}>
      <TopNav perfil={perfil} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-10">

        {/* Encabezado + fecha */}
        <div className="flex items-start justify-between mb-10 gap-4 flex-wrap">
          <div>
            <p className="text-slate-500 text-sm font-medium mb-0.5">Bienvenido,</p>
            <h1 className="text-slate-900 text-3xl font-extrabold tracking-tight leading-none">
              {perfil ? `${perfil.nombre} ${perfil.apellido}` : '—'}
            </h1>
            <p className="text-slate-400 text-sm mt-2">
              Panel de gestión de cash flow y finanzas corporativas.
            </p>
          </div>
          <FechaSelector />
        </div>

        {/* Grid de módulos */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {modulos.map((m) => (
            <ModuloCard
              key={m.titulo}
              titulo={m.titulo}
              descripcion={m.descripcion}
              icono={m.icono}
              onIr={() => navigate(m.ruta)}
            />
          ))}
        </div>

      </main>
    </div>
  )
}