// pages/finanzas/DashboardFinanzas.jsx
// Dashboard principal para el rol 'finanzas'.
// Accesible en la ruta /finanzas.

import { useNavigate } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import { useAuth } from '../../context/AuthContext'

export default function DashboardFinanzas() {
  const { perfil } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar titulo="Cash Flow" accentColor="text-blue-400" />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-10">

        <div className="mb-10">
          <h2 className="text-slate-900 text-2xl font-semibold tracking-tight">
            Buen día,{' '}
            <span className="text-blue-700">
              {perfil ? `${perfil.nombre} ${perfil.apellido}` : '—'}
            </span>
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Panel de gestión de cash flow y finanzas corporativas
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

          <ModuloActivo
            titulo="Obras"
            descripcion="Administración del catálogo de obras: alta, edición y activación."
            onIr={() => navigate('/finanzas/obras')}
            icono={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75
                     6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75
                     3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621
                     0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75
                     3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0
                     3h.008v.008h-.008v-.008z" />
              </svg>
            }
          />

          <ModuloActivo
            titulo="Cash Flow"
            descripcion="Proyección y seguimiento de ingresos y egresos por período."
            onIr={() => navigate('/finanzas/cashflow')}
            icono={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0
                     015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94
                     2.28l-2.28 5.941" />
              </svg>
            }
          />

          <ModuloActivo
            titulo="Movimientos"
            descripcion="Cargá facturas, pagos y movimientos entre cuentas."
            onIr={() => navigate('/finanzas/movimientos')}
            icono={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21
                     7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
            }
          />

          <ModuloActivo
            titulo="Ventas Proyectadas"
            descripcion="Ingresos esperados cargados por Operaciones. Registralos para que impacten en el Cash Flow."
            onIr={() => navigate('/finanzas/ventas')}
            icono={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198
                     1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0
                     013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25
                     6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621
                     0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125
                     1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0
                     0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75
                     0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12
                     0h.008v.008H6V10.5z" />
              </svg>
            }
          />

          <ModuloActivo
            titulo="Exportar a Excel"
            descripcion="Generá el reporte mensual para el Directorio con 5 hojas."
            onIr={() => navigate('/finanzas/exportar')}
            icono={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021
                     18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            }
          />

          <ModuloActivo
            titulo="Presupuesto vs. Real"
            descripcion="Comparativa entre lo presupuestado y lo ejecutado."
            onIr={() => navigate('/finanzas/presupuesto')}
            icono={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504
                     1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125
                     1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125
                     1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0
                     .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0
                     01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125
                     1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0
                     .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0
                     01-1.125-1.125V4.125z" />
              </svg>
            }
          />

        </div>
      </main>
    </div>
  )
}

function ModuloActivo({ titulo, descripcion, icono, onIr }) {
  return (
    <div className="bg-white border border-blue-200 rounded-xl p-6
                    flex flex-col gap-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
          {icono}
        </div>
        <span className="text-xs font-medium text-blue-700 bg-blue-50
                         px-2.5 py-1 rounded-full border border-blue-100">
          Disponible
        </span>
      </div>
      <div>
        <h3 className="text-slate-800 font-semibold text-sm">{titulo}</h3>
        <p className="text-slate-500 text-sm mt-1 leading-relaxed">{descripcion}</p>
      </div>
      <div className="mt-auto pt-4 border-t border-slate-100">
        <button
          onClick={onIr}
          className="text-sm font-medium text-blue-700 hover:text-blue-900
                     flex items-center gap-1.5 transition-colors"
        >
          Ir al módulo
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    </div>
  )
}