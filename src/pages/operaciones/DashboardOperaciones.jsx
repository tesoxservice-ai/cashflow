// pages/operaciones/DashboardOperaciones.jsx
// Dashboard principal para el rol 'operaciones'.
// Accesible en la ruta /operaciones.

import { useNavigate } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import { useAuth } from '../../context/AuthContext'

export default function DashboardOperaciones() {
  const { perfil } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      <Navbar titulo="Operaciones" accentColor="text-emerald-400" />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-10">

        <div className="mb-10">
          <h2 className="text-slate-900 text-2xl font-semibold tracking-tight">
            Buen día,{' '}
            <span className="text-emerald-700">
              {perfil ? `${perfil.nombre} ${perfil.apellido}` : '—'}
            </span>
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Panel de gestión de obras y presupuestos
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

          {/* Módulo activo: Presupuestos */}
          <ModuloActivo
            titulo="Presupuestos"
            descripcion="Cargá y editá el presupuesto mensual por obra y rubro."
            onIr={() => navigate('/operaciones/presupuestos')}
            icono={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0
                     01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504
                     1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125
                     1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504
                     1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0
                     0h-7.5m7.5 0h-7.5m0 0H9.375m3.75 0a1.125 1.125 0 01-1.125
                     1.125H9.375a1.125 1.125 0 01-1.125-1.125m3.75 0v-1.5A1.125
                     1.125 0 0010.5 15H9.375" />
              </svg>
            }
          />

          {/* Módulo activo: Obras */}
          <ModuloActivo
            titulo="Obras"
            descripcion="Administrá el catálogo de obras: alta, edición y activación."
            onIr={() => navigate('/operaciones/obras')}
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

        </div>

      </main>
    </div>
  )
}

function ModuloActivo({ titulo, descripcion, icono, onIr }) {
  return (
    <div className="bg-white border border-emerald-200 rounded-xl p-6
                    flex flex-col gap-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-lg
                        flex items-center justify-center">
          {icono}
        </div>
        <span className="text-xs font-medium text-emerald-700 bg-emerald-50
                         px-2.5 py-1 rounded-full border border-emerald-100">
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
          className="text-sm font-medium text-emerald-700 hover:text-emerald-900
                     flex items-center gap-1.5 transition-colors"
        >
          Ir al módulo
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24"
               strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    </div>
  )
}
