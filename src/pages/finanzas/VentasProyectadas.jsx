// pages/finanzas/VentasProyectadas.jsx
// Solo lectura: muestra lo que Operaciones proyectó, con el estado de
// cobertura calculado contra los ingresos reales ya cargados en Movimientos.
// Finanzas registra el cobro real como cualquier otro movimiento en
// Movimientos; acá no se crea ni se borra nada, para no duplicar ingresos.

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import SidebarFinanzas, { CLASE_SIDEBAR } from './components/SidebarFinanzas'
import { CARD, ico, CardResumen as CardPremium, CLS_LABEL, CLS_CAMPO, EstadoVacioPremium, CargandoPremium } from '../directorio/utilsDirectorio'
import { calcularCoberturaVentas } from '../../lib/proyeccionPresupuesto'

const RUBROS = [
  { value: 'abono',                  label: 'Abono' },
  { value: 'correctivos',            label: 'Correctivos' },
  { value: 'extras',                 label: 'Extras' },
  { value: 'anticipo',               label: 'Anticipo' },
  { value: 'certificados_ejecucion', label: 'Certificados de ejecución' },
  { value: 'facturacion',            label: 'Facturación' },
]

const fmtARS = n => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 2,
}).format(n ?? 0)

const labelRubro  = v => RUBROS.find(r => r.value === v)?.label ?? v

function labelPeriodo(fechaStr) {
  if (!fechaStr) return '—'
  const d = new Date(fechaStr + 'T00:00:00')
  const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// Desde diciembre de 2024 (fijo) hasta 24 meses después de hoy
function generarPeriodos() {
  const lista = [{ value: 'todos', label: '— Todos los períodos —' }]
  const hoy = new Date()
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 24, 1)
  for (let d = new Date(2024, 11, 1); d <= fin; d.setMonth(d.getMonth() + 1)) {
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    lista.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return lista
}
const PERIODOS = generarPeriodos()

// ─── Íconos ───────────────────────────────────────────────────────────────────

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
const IconBack = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
  </svg>
)

// ─── TopNav ───────────────────────────────────────────────────────────────────

function TopNav({ perfil }) {
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
              <p className="text-slate-400 text-xs mt-0.5 leading-none capitalize">{perfil?.rol ?? 'Finanzas'}</p>
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
                  <p className="text-slate-400 text-xs capitalize mt-0.5">{perfil?.rol ?? 'Finanzas'}</p>
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

// ─── Componente principal ─────────────────────────────────────────────────────

export default function VentasProyectadasFinanzas() {
  const { perfil } = useAuth()
  const navigate = useNavigate()

  const [obras,         setObras]         = useState([])
  const [obraFiltro,    setObraFiltro]    = useState('')
  const [periodoFiltro, setPeriodoFiltro] = useState('todos')
  const [estadoFiltro,  setEstadoFiltro]  = useState('pendiente')
  const [ventas,        setVentas]        = useState([])
  const [cobertura,     setCobertura]     = useState({})
  const [cargando,      setCargando]      = useState(false)
  const [error,         setError]         = useState('')

  useEffect(() => {
    supabase.from('obras').select('id, codigo, nombre, cliente').eq('activa', true).order('codigo')
      .then(({ data }) => setObras(data ?? []))
  }, [])

  const cargarDatos = useCallback(async () => {
    setCargando(true); setError('')

    let q = supabase
      .from('ventas_proyectadas')
      .select('id, obra_id, rubro, periodo, monto, obras(codigo, nombre, cliente)')
      .order('periodo', { ascending: true })
      .order('rubro',   { ascending: true })
    if (obraFiltro) q = q.eq('obra_id', obraFiltro)
    if (periodoFiltro !== 'todos') q = q.eq('periodo', periodoFiltro)

    // La cobertura se calcula contra TODOS los ingresos de Ventas, sin
    // filtrar por obra/período: si se filtra la lista a una sola obra, los
    // grupos obra+período que se muestran siguen completos igual.
    const [{ data: dataVentas, error: errVentas }, { data: dataMov, error: errMov }] = await Promise.all([
      q,
      supabase.from('movimientos')
        .select('obra_id, periodo, tipo, categoria, monto_bruto, estado_proyeccion')
        .eq('categoria', 'ingreso_cliente').eq('tipo', 'ingreso'),
    ])

    if (errVentas || errMov) { setError('No se pudieron cargar las ventas proyectadas.'); setCargando(false); return }

    setVentas(dataVentas ?? [])
    setCobertura(calcularCoberturaVentas(dataVentas ?? [], dataMov ?? []))
    setCargando(false)
  }, [obraFiltro, periodoFiltro])

  useEffect(() => { cargarDatos() }, [cargarDatos])

  const ventasConEstado = ventas.map(v => {
    const c = cobertura[`${v.obra_id}|${v.periodo}`]
    return { ...v, cubierto: c?.cubierto ?? false, pendienteGrupo: c?.pendiente ?? Number(v.monto) }
  })

  const ventasFiltradas = ventasConEstado.filter(v => {
    if (estadoFiltro === 'pendiente') return !v.cubierto
    if (estadoFiltro === 'cubierto')  return v.cubierto
    return true
  })

  // Los totales se arman por grupo obra+período, no por fila: si un período
  // está cubierto solo en parte, lo pendiente es lo que falta de verdad, no el
  // monto completo de las filas (si no, "Pendiente" se infla y se contradice
  // con lo que muestra el Cash Flow).
  const grupos         = Object.values(cobertura)
  const totalGeneral   = grupos.reduce((s, g) => s + g.proyectado, 0)
  const totalPendiente = grupos.reduce((s, g) => s + g.pendiente, 0)
  const totalCubierto  = totalGeneral - totalPendiente
  const totalFiltrado  = ventasFiltradas.reduce((s, v) => s + Number(v.monto), 0)

  return (
    <div className={`min-h-screen flex flex-col ${CLASE_SIDEBAR}`} style={{ backgroundColor: '#f0f7fa' }}>
      <SidebarFinanzas perfil={perfil} activo="ventas" />

      <main className="flex-1 w-full max-w-[1600px] px-6 lg:px-8 py-8">

        {/* Encabezado */}
        <div className="mb-8">
          <h1 className="text-slate-900 text-2xl font-extrabold tracking-tight">Ventas Proyectadas</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Ingresos esperados cargados por Operaciones, de solo lectura. El cobro real se carga con "Nuevo movimiento" en el Cash Flow,
            y el estado de acá se actualiza solo cuando esa factura/ingreso coincide en obra y período.
          </p>
        </div>

        {/* Filtros */}
        <div className={`${CARD} p-4 sm:p-5 mb-5`}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={lbCls}>Obra</label>
              <select value={obraFiltro} onChange={e => setObraFiltro(e.target.value)} className={selCls}>
                <option value="">— Todas las obras —</option>
                {obras.map(o => <option key={o.id} value={o.id}>{o.codigo} · {o.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className={lbCls}>Período</label>
              <select value={periodoFiltro} onChange={e => setPeriodoFiltro(e.target.value)} className={selCls}>
                {PERIODOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className={lbCls}>Estado</label>
              <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)} className={selCls}>
                <option value="todos">Todos</option>
                <option value="pendiente">Pendientes de facturar</option>
                <option value="cubierto">Ya cubiertas</option>
              </select>
            </div>
          </div>
        </div>

        {/* Cards resumen */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <CardPremium label="Total proyectado" valor={fmtARS(totalGeneral)} icono={ico('billetera')} tono="teal" color="text-slate-900"
            subLabel="Lo que Operaciones espera vender" />
          <CardPremium label="Pendiente de facturar" valor={fmtARS(totalPendiente)} icono={ico('calendario')} tono="amber" color="text-amber-600"
            subLabel="Todavía sin ingreso real" />
          <CardPremium label="Ya cubierto por ingresos reales" valor={fmtARS(totalCubierto)} icono={ico('tendencia')} tono="emerald" color="text-emerald-600"
            subLabel="Cobrado o facturado" />
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start justify-between gap-3 bg-red-50 border border-red-100
                          text-red-700 text-sm rounded-xl px-4 py-3 mb-5">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Contenido */}
        {cargando ? (
          <CargandoPremium texto="Cargando ventas…" />
        ) : ventasFiltradas.length === 0 ? (
          <EstadoVacioPremium titulo="Sin ventas para estos filtros"
            descripcion="Operaciones todavía no cargó ventas proyectadas, o no coinciden con los filtros seleccionados." />
        ) : (
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70">
                    <Th>Obra</Th>
                    <Th>Período</Th>
                    <Th>Rubro</Th>
                    <Th align="right">Monto</Th>
                    <Th align="center">Estado</Th>
                  </tr>
                </thead>
                <tbody>
                  {ventasFiltradas.map(v => (
                    <tr key={v.id} className="border-b border-slate-100/80 last:border-0 hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5 text-xs text-slate-700">
                        <span className="font-semibold text-slate-800">{v.obras?.codigo}</span>
                        <span className="text-slate-300 mx-1.5">·</span>
                        {v.obras?.nombre}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-500">{labelPeriodo(v.periodo)}</td>
                      <td className="px-5 py-3.5 text-xs text-slate-700">{labelRubro(v.rubro)}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-slate-800 text-xs">
                        {fmtARS(v.monto)}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {v.cubierto ? (
                          <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg">
                            Cubierto
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold bg-amber-50 text-amber-700 px-2.5 py-1 rounded-lg"
                            title={`Falta facturar ${fmtARS(v.pendienteGrupo)} de esta obra y período`}>
                            Pendiente
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-sky-50/80 border-t border-sky-100">
                    <td colSpan={3} className="px-5 py-3 text-sm font-bold" style={{ color: '#0e7490' }}>
                      Total
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-sm font-bold" style={{ color: '#0e7490' }}>
                      {fmtARS(totalFiltrado)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function Th({ children, align = 'left' }) {
  return (
    <th className={`px-5 py-3.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider
                    ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}>
      {children}
    </th>
  )
}

const lbCls = CLS_LABEL
const selCls = CLS_CAMPO
