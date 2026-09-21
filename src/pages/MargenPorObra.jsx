// pages/MargenPorObra.jsx
// Margen bruto proyectado por obra: Ingresos proyectados (ventas_proyectadas)
// menos Egresos presupuestados (presupuestos), por obra y por mes.
// Accesible desde ambos roles:
//   - /finanzas/margen    (rol 'finanzas')
//   - /operaciones/margen (rol 'operaciones')

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtARS = n => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 2,
}).format(n ?? 0)

const fmtPct = pct => `${pct.toFixed(1)}%`

function generarPeriodos() {
  const lista = []
  const hoy = new Date()
  for (let i = -24; i <= 12; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    lista.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return lista
}
const PERIODOS = generarPeriodos()

function labelPeriodo(fechaStr) {
  if (!fechaStr) return '—'
  const d = new Date(fechaStr + 'T00:00:00')
  const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

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
      <img src="/logo-psdata.png" alt="PSDATA" className="h-11" />
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
              <p className="text-slate-400 text-xs mt-0.5 leading-none capitalize">{perfil?.rol ?? '—'}</p>
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
                  <p className="text-slate-400 text-xs capitalize mt-0.5">{perfil?.rol ?? '—'}</p>
                </div>
                <button onClick={async () => { setMenuAbierto(false); await logout() }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                  <IconLogout />Cerrar sesión
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

export default function MargenPorObra() {
  const navigate = useNavigate()
  const { perfil } = useAuth()

  const esFinanzas      = perfil?.rol === 'finanzas'
  const breadcrumbLabel = esFinanzas ? 'Panel de Finanzas' : 'Panel de Operaciones'
  const breadcrumbRuta  = esFinanzas ? '/finanzas'         : '/operaciones'

  const [obras,       setObras]       = useState([])
  const [ventas,      setVentas]      = useState([])
  const [presupuestos,setPresupuestos]= useState([])
  const [obraId,      setObraId]      = useState('')
  const [periodo,     setPeriodo]     = useState('todos')
  const [cargando,    setCargando]    = useState(true)
  const [error,       setError]       = useState('')
  const [expandidos,  setExpandidos]  = useState(new Set())

  const modoTodos = periodo === 'todos'

  useEffect(() => {
    supabase.from('obras').select('id, codigo, nombre, cliente').eq('activa', true).order('codigo')
      .then(({ data, error }) => {
        if (error) setError('No se pudieron cargar las obras.')
        setObras(data ?? [])
      })
  }, [])

  const cargarDatos = useCallback(async () => {
    setCargando(true); setError('')
    let qVentas = supabase.from('ventas_proyectadas').select('obra_id, periodo, monto')
    let qPres   = supabase.from('presupuestos').select('obra_id, periodo, monto')
    if (!modoTodos) { qVentas = qVentas.eq('periodo', periodo); qPres = qPres.eq('periodo', periodo) }
    if (obraId)     { qVentas = qVentas.eq('obra_id', obraId); qPres = qPres.eq('obra_id', obraId) }

    const [{ data: dataVentas, error: errVentas }, { data: dataPres, error: errPres }] =
      await Promise.all([qVentas, qPres])

    if (errVentas || errPres) { setError('No se pudo cargar el margen. Intentá de nuevo.'); setCargando(false); return }
    setVentas(dataVentas ?? []); setPresupuestos(dataPres ?? []); setCargando(false)
  }, [periodo, modoTodos, obraId])

  useEffect(() => { cargarDatos() }, [cargarDatos])

  const filas = useMemo(() => {
    const mapa = {}
    const asegurar = obraId => { if (!mapa[obraId]) mapa[obraId] = { ingresos: 0, egresos: 0, porPeriodo: {} } }
    const asegurarPeriodo = (obraId, per) => {
      asegurar(obraId)
      if (!mapa[obraId].porPeriodo[per]) mapa[obraId].porPeriodo[per] = { ingresos: 0, egresos: 0 }
    }

    ventas.forEach(v => {
      asegurarPeriodo(v.obra_id, v.periodo)
      mapa[v.obra_id].ingresos += Number(v.monto)
      mapa[v.obra_id].porPeriodo[v.periodo].ingresos += Number(v.monto)
    })
    presupuestos.forEach(p => {
      asegurarPeriodo(p.obra_id, p.periodo)
      mapa[p.obra_id].egresos += Number(p.monto)
      mapa[p.obra_id].porPeriodo[p.periodo].egresos += Number(p.monto)
    })

    const resultado = Object.entries(mapa).map(([obraId, v]) => {
      const obra   = obras.find(o => o.id === obraId)
      const margen = v.ingresos - v.egresos
      const pct    = v.ingresos > 0 ? (margen / v.ingresos) * 100 : null
      const filasPeriodo = Object.entries(v.porPeriodo)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([per, vp]) => {
          const m = vp.ingresos - vp.egresos
          return { periodo: per, label: labelPeriodo(per), ingresos: vp.ingresos, egresos: vp.egresos,
            margen: m, pct: vp.ingresos > 0 ? (m / vp.ingresos) * 100 : null }
        })
      return {
        obraId, codigo: obra?.codigo ?? '—', nombre: obra?.nombre ?? 'Obra eliminada', cliente: obra?.cliente ?? '',
        ingresos: v.ingresos, egresos: v.egresos, margen, pct, filasPeriodo,
      }
    })
    resultado.sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }))
    return resultado
  }, [ventas, presupuestos, obras])

  const totales = useMemo(() => {
    const ingresos = filas.reduce((s, f) => s + f.ingresos, 0)
    const egresos  = filas.reduce((s, f) => s + f.egresos, 0)
    const margen   = ingresos - egresos
    return { ingresos, egresos, margen, pct: ingresos > 0 ? (margen / ingresos) * 100 : null }
  }, [filas])

  function toggleExpandido(obraId) {
    setExpandidos(prev => { const next = new Set(prev); next.has(obraId) ? next.delete(obraId) : next.add(obraId); return next })
  }

  const periodoLabel = modoTodos ? 'Todos los períodos' : PERIODOS.find(p => p.value === periodo)?.label ?? periodo

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f0f7fa' }}>
      <TopNav perfil={perfil} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">

        {/* Encabezado */}
        <div className="mb-8">
          <button onClick={() => navigate(breadcrumbRuta)}
            className="text-sm font-medium flex items-center gap-1.5 mb-2 transition-colors"
            style={{ color: '#0e7490' }}
            onMouseEnter={e => e.currentTarget.style.color = '#164e63'}
            onMouseLeave={e => e.currentTarget.style.color = '#0e7490'}>
            <IconBack />{breadcrumbLabel}
          </button>
          <h1 className="text-slate-900 text-2xl font-extrabold tracking-tight">Margen por Obra</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Ingresos proyectados menos egresos presupuestados, por obra y período
          </p>
        </div>

        {/* Filtros */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 mb-6 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lbCls}>Obra</label>
              <select value={obraId} onChange={e => setObraId(e.target.value)} className={selCls}>
                <option value="">— Todas las obras —</option>
                {obras.map(o => <option key={o.id} value={o.id}>{o.codigo} · {o.nombre} ({o.cliente})</option>)}
              </select>
            </div>
            <div>
              <label className={lbCls}>Período</label>
              <select value={periodo} onChange={e => setPeriodo(e.target.value)} className={selCls}>
                <option value="todos">— Todos los períodos —</option>
                {PERIODOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3 mb-5 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {cargando ? (
          <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
            <span className="w-5 h-5 border-2 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
            <span className="text-sm">Calculando márgenes…</span>
          </div>
        ) : filas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: '#e0f2fe', color: '#0e7490' }}>
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0
                     0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
              </svg>
            </div>
            <p className="text-slate-700 font-bold text-sm">Sin ventas ni presupuesto para {periodoLabel.toLowerCase()}</p>
            <p className="text-slate-400 text-xs mt-1">Probá con otro período.</p>
          </div>
        ) : (
          <>
            {/* Cards resumen */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <CardResumen label="Ingresos proyectados" valor={fmtARS(totales.ingresos)} color="text-emerald-600" />
              <CardResumen label="Egresos presupuestados" valor={fmtARS(totales.egresos)} color="text-red-600" />
              <CardResumen label="Margen bruto" valor={fmtARS(totales.margen)}
                color={totales.margen >= 0 ? 'text-emerald-600' : 'text-red-600'}
                subLabel={totales.pct !== null ? `${fmtPct(totales.pct)} de margen sobre ingresos` : undefined} />
            </div>

            {modoTodos && (
              <p className="text-xs font-semibold px-3 py-1.5 rounded-full border inline-block mb-4"
                style={{ backgroundColor: '#e0f2fe', color: '#0e7490', borderColor: '#a5f3fc' }}>
                Hacé clic en una obra para ver el desglose por mes
              </p>
            )}

            {/* Tabla */}
            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80">
                      {modoTodos && <Th>{/* chevron */}</Th>}
                      <Th>Obra</Th>
                      <Th align="right">Ingresos proyectados</Th>
                      <Th align="right">Egresos presupuestados</Th>
                      <Th align="right">Margen bruto</Th>
                      <Th>% Margen</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map(fila => (
                      modoTodos
                        ? <FilaObraTodos key={fila.obraId} fila={fila}
                            expandido={expandidos.has(fila.obraId)} onToggle={() => toggleExpandido(fila.obraId)} />
                        : <FilaObra key={fila.obraId} fila={fila} />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: '#e0f2fe' }} className="border-t-2 border-cyan-100">
                      {modoTodos && <td />}
                      <td className="px-5 py-3.5 text-sm font-bold" style={{ color: '#0e7490' }}>Total general</td>
                      <td className="px-5 py-3.5 text-right font-bold tabular-nums text-emerald-700">{fmtARS(totales.ingresos)}</td>
                      <td className="px-5 py-3.5 text-right font-bold tabular-nums text-red-700">{fmtARS(totales.egresos)}</td>
                      <td className={`px-5 py-3.5 text-right font-bold tabular-nums ${totales.margen >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {fmtARS(totales.margen)}
                      </td>
                      <td className="px-5 py-3.5 text-sm font-bold" style={{ color: '#0e7490' }}>
                        {totales.pct !== null ? fmtPct(totales.pct) : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

// ─── FilaObra (período específico) ────────────────────────────────────────────

function FilaObra({ fila }) {
  const negativo = fila.margen < 0
  return (
    <tr className={`border-b border-slate-100 last:border-0 transition-colors ${negativo ? 'bg-red-50/60' : 'hover:bg-slate-50/60'}`}>
      <td className="px-5 py-3.5 text-xs text-slate-700">
        <span className="font-semibold text-slate-800">{fila.codigo}</span>
        <span className="text-slate-300 mx-1.5">·</span>{fila.nombre}
        {fila.cliente && <span className="text-slate-400"> ({fila.cliente})</span>}
      </td>
      <td className="px-5 py-3.5 text-right tabular-nums text-xs text-emerald-700">{fmtARS(fila.ingresos)}</td>
      <td className="px-5 py-3.5 text-right tabular-nums text-xs text-red-700">{fmtARS(fila.egresos)}</td>
      <td className={`px-5 py-3.5 text-right tabular-nums text-xs font-bold ${negativo ? 'text-red-700' : 'text-emerald-700'}`}>
        {fmtARS(fila.margen)}
      </td>
      <td className="px-5 py-3.5">
        <span className={`text-xs font-semibold ${fila.pct === null ? 'text-slate-300' : negativo ? 'text-red-600' : 'text-emerald-600'}`}>
          {fila.pct !== null ? fmtPct(fila.pct) : '—'}
        </span>
      </td>
    </tr>
  )
}

// ─── FilaObraTodos (expandible por mes) ───────────────────────────────────────

function FilaObraTodos({ fila, expandido, onToggle }) {
  const negativo = fila.margen < 0
  return (
    <>
      <tr onClick={onToggle}
        className={`border-b border-slate-200 cursor-pointer select-none transition-colors ${negativo ? 'bg-red-50 hover:bg-red-100' : 'bg-slate-50 hover:bg-slate-100'}`}>
        <td className="pl-4 pr-2 py-3.5 w-8">
          <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${expandido ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </td>
        <td className="px-3 py-3.5 text-sm font-bold text-slate-800">
          {fila.codigo} <span className="text-slate-300 mx-1.5">·</span>
          <span className="font-normal text-slate-600">{fila.nombre}</span>
          {fila.cliente && <span className="text-slate-400 font-normal"> ({fila.cliente})</span>}
        </td>
        <td className="px-5 py-3.5 text-right tabular-nums text-sm font-semibold text-emerald-700">{fmtARS(fila.ingresos)}</td>
        <td className="px-5 py-3.5 text-right tabular-nums text-sm font-semibold text-red-700">{fmtARS(fila.egresos)}</td>
        <td className={`px-5 py-3.5 text-right tabular-nums text-sm font-bold ${negativo ? 'text-red-700' : 'text-emerald-700'}`}>
          {fmtARS(fila.margen)}
        </td>
        <td className="px-5 py-3.5">
          <span className={`text-xs font-semibold ${fila.pct === null ? 'text-slate-300' : negativo ? 'text-red-600' : 'text-emerald-600'}`}>
            {fila.pct !== null ? fmtPct(fila.pct) : '—'}
          </span>
        </td>
      </tr>
      {expandido && fila.filasPeriodo.map(fp => {
        const neg = fp.margen < 0
        return (
          <tr key={fp.periodo} className={`border-b border-slate-100 transition-colors ${neg ? 'bg-red-50' : 'bg-white hover:bg-slate-50/60'}`}>
            <td className="pl-4 pr-2 py-2.5"><div className="w-4 border-l-2 border-slate-200 h-4 ml-1" /></td>
            <td className="px-3 py-2.5 text-xs text-slate-600 pl-6">{fp.label}</td>
            <td className="px-5 py-2.5 text-right tabular-nums text-xs text-emerald-700">
              {fp.ingresos > 0 ? fmtARS(fp.ingresos) : <span className="text-slate-300">—</span>}
            </td>
            <td className="px-5 py-2.5 text-right tabular-nums text-xs text-red-700">
              {fp.egresos > 0 ? fmtARS(fp.egresos) : <span className="text-slate-300">—</span>}
            </td>
            <td className={`px-5 py-2.5 text-right tabular-nums text-xs font-medium ${neg ? 'text-red-700' : 'text-emerald-700'}`}>
              {fmtARS(fp.margen)}
            </td>
            <td className="px-5 py-2.5">
              <span className={`text-xs font-semibold ${fp.pct === null ? 'text-slate-300' : neg ? 'text-red-600' : 'text-emerald-600'}`}>
                {fp.pct !== null ? fmtPct(fp.pct) : '—'}
              </span>
            </td>
          </tr>
        )
      })}
    </>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function CardResumen({ label, valor, color, subLabel }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
      <p className="text-xs font-semibold text-slate-400 mb-1">{label}</p>
      <p className={`text-xl font-extrabold tabular-nums ${color}`}>{valor}</p>
      {subLabel && <p className="text-xs text-slate-400 mt-1">{subLabel}</p>}
    </div>
  )
}

function Th({ children, align = 'left' }) {
  return (
    <th className={`px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

const lbCls = 'block text-xs font-semibold text-slate-500 mb-1.5'
const selCls = `w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:border-transparent`
