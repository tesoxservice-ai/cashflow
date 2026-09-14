// pages/finanzas/DashboardFinanzas.jsx
// Dashboard principal para el rol 'finanzas'.
// Accesible en la ruta /finanzas.
//
// Muestra:
//   - Navbar con el título "Cash Flow" en azul (color del rol)
//   - Bienvenida personalizada con nombre y apellido
//   - Placeholders para los módulos de finanzas

import { useNavigate } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import { useAuth } from '../../context/AuthContext'

export default function DashboardFinanzas() {
  const { perfil } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* ── Navbar con acento azul para el rol Finanzas ──────── */}
      <Navbar
        titulo="Cash Flow"
        accentColor="text-blue-400"
      />

      {/* ── Contenido principal ───────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-10">

        {/* Bienvenida */}
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

        {/* ── Módulos del rol ───────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

          {/* Módulo activo: Obras */}
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

          {/* Módulo activo: Cash Flow */}
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

          {/* Módulo activo: Movimientos */}
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

          <PlaceholderModulo
            titulo="Cuentas y Saldos"
            descripcion="Saldos actuales en bancos y fondos de inversión."
            etiqueta="Próximamente"
            icono={
              // Ícono: billetera / banco
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6
                     2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25
                     2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25
                     2.25v10.5A2.25 2.25 0 004.5 19.5z" />
              </svg>
            }
          />

          <PlaceholderModulo
            titulo="Débitos Automáticos"
            descripcion="Gestioná los servicios con débito recurrente."
            etiqueta="Próximamente"
            icono={
              // Ícono: reloj / recurrencia
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />

          <PlaceholderModulo
            titulo="Presupuesto vs. Real"
            descripcion="Comparativa entre lo presupuestado y lo ejecutado."
            etiqueta="Próximamente"
            icono={
              // Ícono: escala / comparativa
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12
                     20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416
                     48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5
                     0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106
                     1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988
                     0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75
                     4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62
                     10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0
                     01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25
                     4.971z" />
              </svg>
            }
          />

        </div>

      </main>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Subcomponente: ModuloActivo
// Card de módulo disponible con botón de navegación.
// ─────────────────────────────────────────────────────────────
function ModuloActivo({ titulo, descripcion, icono, onIr }) {
  return (
    <div className="bg-white border border-blue-200 rounded-xl p-6
                    flex flex-col gap-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-lg
                        flex items-center justify-center">
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
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24"
               strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Subcomponente: PlaceholderModulo
// Renderiza un módulo aún no implementado con su estado visual.
// ─────────────────────────────────────────────────────────────
function PlaceholderModulo({ titulo, descripcion, etiqueta, icono }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6
                    flex flex-col gap-4">
      {/* Cabecera con ícono y badge */}
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-lg
                        flex items-center justify-center">
          {icono}
        </div>
        <span className="text-xs font-medium text-slate-400 bg-slate-100
                         px-2.5 py-1 rounded-full">
          {etiqueta}
        </span>
      </div>

      {/* Texto */}
      <div>
        <h3 className="text-slate-800 font-semibold text-sm">{titulo}</h3>
        <p className="text-slate-500 text-sm mt-1 leading-relaxed">
          {descripcion}
        </p>
      </div>

      {/* Indicador de contenido futuro */}
      <div className="mt-auto pt-4 border-t border-slate-100">
        <div className="h-1.5 bg-slate-100 rounded-full w-2/3" />
        <div className="h-1.5 bg-slate-100 rounded-full w-1/3 mt-1.5" />
      </div>
    </div>
  )
}
