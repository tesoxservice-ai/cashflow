// pages/operaciones/PresupuestoVsReal.jsx
// Rediseño visual coherente con el sistema de diseño PSDATA.
// Lógica sin cambios — solo estilos actualizados.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'

const fmtARS = n => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(n ?? 0)
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

function periodoActual() {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`
}

function labelPeriodo(fechaStr) {
  if (!fechaStr) return '—'
  const d = new Date(fechaStr + 'T00:00:00')
  const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function colorSemaforo(pct, sinPresupuesto) {
  if (sinPresupuesto) return 'bg-slate-300'
  if (pct > 100) return 'bg-red-500'
  if (pct >= 80) return 'bg-yellow-400'
  return 'bg-emerald-500'
}

function textSemaforo(pct, sinPresupuesto) {
  if (sinPresupuesto) return 'text-slate-400'
  if (pct > 100) return 'text-red-700'
  if (pct >= 80) return 'text-yellow-700'
  return 'text-emerald-700'
}

function BarraProgreso({ pct, sinPresupuesto }) {
  if (sinPresupuesto) return <span className="text-slate-300 text-xs">—</span>
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${colorSemaforo(pct, false)}`}
          style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`text-xs font-medium tabular-nums w-12 text-right ${textSemaforo(pct, false)}`}>
        {fmtPct(pct)}
      </span>
    </div>
  )
}

function PuntoSemaforo({ pct, sinPresupuesto }) {
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colorSemaforo(pct, sinPresupuesto)} shrink-0`} title={sinPresupuesto ? 'Sin presupuesto' : fmtPct(pct)} />
}

// ─── Íconos ───────────────────────────────────────────────────────────────────
const IconBell = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
  </svg>
)
const IconChevronDown = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
)
const IconLogout = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
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
        <button className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"><IconBell /></button>
        <div className="w-px h-6 bg-slate-200" />
        <div className="relative">
          <button onClick={() => setMenuAbierto(v => !v)} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: '#0e7490' }}>{iniciales}</div>
            <div className="text-left hidden sm:block">
              <p className="text-slate-800 text-sm font-semibold leading-none">{perfil ? `${perfil.nombre} ${perfil.apellido}` : 'Usuario'}</p>
              <p className="text-slate-400 text-xs mt-0.5 leading-none capitalize">{perfil?.rol ?? 'Operaciones'}</p>
            </div>
            <span className={`transition-transform duration-200 ${menuAbierto ? 'rotate-180' : ''}`}><IconChevronDown /></span>
          </button>
          {menuAbierto && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuAbierto(false)} />
              <div className="absolute right-0 mt-3 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-1.5 z-20">
                <div className="px-4 py-2.5 border-b border-slate-100">
                  <p className="text-slate-800 text-sm font-semibold truncate">{perfil ? `${perfil.nombre} ${perfil.apellido}` : 'Usuario'}</p>
                  <p className="text-slate-400 text-xs capitalize mt-0.5">{perfil?.rol ?? 'Operaciones'}</p>
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
export default function PresupuestoVsRealOperaciones() {
  const navigate = useNavigate()
  const { perfil } = useAuth()

  const [obras,        setObras]        = useState([])
  const [rubros,       setRubros]       = useState([])
  const [obraId,       setObraId]       = useState('')
  const [periodo,      setPeriodo]      = useState('todos')
  const [presupuestos, setPresupuestos] = useState([])
  const [movimientos,  setMovimientos]  = useState([])
  const [cargando,     setCargando]     = useState(false)
  const [error,        setError]        = useState('')
  const [expandidos,   setExpandidos]   = useState(new Set())

  const modoTodos = periodo === 'todos'

  useEffect(() => {
    async function cargarMaestros() {
      const [{ data: dataObras }, { data: dataRubros }] = await Promise.all([
        supabase.from('obras').select('id, codigo, nombre, cliente').eq('activa', true).order('codigo'),
        supabase.from('rubros').select('id, nombre, tipo').order('nombre'),
      ])
      setObras(dataObras ?? []); setRubros(dataRubros ?? [])
    }
    cargarMaestros()
  }, [])

  const cargarAnalisis = useCallback(async () => {
    if (!obraId) { setPresupuestos([]); setMovimientos([]); return }
    setCargando(true); setError(''); setExpandidos(new Set())

    let qPres = supabase.from('presupuestos').select('id, rubro_id, concepto, monto, periodo').eq('obra_id', obraId)
    let qMov  = supabase.from('movimientos').select('id, rubro_id, concepto, proveedor_cliente, monto_bruto, periodo')
      .eq('obra_id', obraId).eq('categoria', 'factura').eq('tipo', 'egreso')

    if (!modoTodos) { qPres = qPres.eq('periodo', periodo); qMov = qMov.eq('periodo', periodo) }

    const [{ data: dataPres, error: errPres }, { data: dataMov, error: errMov }] = await Promise.all([qPres, qMov])
    if (errPres || errMov) { setError('No se pudo cargar el análisis. Intentá de nuevo.'); setCargando(false); return }

    setPresupuestos(dataPres ?? []); setMovimientos(dataMov ?? []); setCargando(false)
  }, [obraId, periodo, modoTodos])

  useEffect(() => { cargarAnalisis() }, [cargarAnalisis])

  const analisisPeriodo = useMemo(() => {
    if (!obraId || modoTodos) return null
    const rubroNombre = id => rubros.find(r => r.id === id)?.nombre ?? 'Sin rubro'
    const presPorRubroConcepto = {}
    presupuestos.forEach(p => {
      const c = p.concepto ?? ''
      if (!presPorRubroConcepto[p.rubro_id]) presPorRubroConcepto[p.rubro_id] = {}
      presPorRubroConcepto[p.rubro_id][c] = (presPorRubroConcepto[p.rubro_id][c] ?? 0) + Number(p.monto)
    })
    const gastoPorRubroConcepto = {}; const movSinPresupuesto = []
    movimientos.forEach(m => {
      if (!m.rubro_id) return
      const c = m.concepto ?? m.proveedor_cliente ?? ''
      if (!gastoPorRubroConcepto[m.rubro_id]) gastoPorRubroConcepto[m.rubro_id] = {}
      gastoPorRubroConcepto[m.rubro_id][c] = (gastoPorRubroConcepto[m.rubro_id][c] ?? 0) + Number(m.monto_bruto)
    })
    const rubrosInv = new Set([...Object.keys(presPorRubroConcepto), ...Object.keys(gastoPorRubroConcepto)])
    const grupos = []
    rubrosInv.forEach(rubroId => {
      const conceptos = [...new Set([...Object.keys(presPorRubroConcepto[rubroId] ?? {}), ...Object.keys(gastoPorRubroConcepto[rubroId] ?? {})])]
      const filas = conceptos.map(concepto => {
        const presupuestado = presPorRubroConcepto[rubroId]?.[concepto] ?? 0
        const gastado       = gastoPorRubroConcepto[rubroId]?.[concepto] ?? 0
        const diferencia    = presupuestado - gastado
        const pct           = presupuestado > 0 ? (gastado / presupuestado) * 100 : 0
        const sinPresupuesto = presupuestado === 0
        if (sinPresupuesto && gastado > 0)
          movimientos.filter(m => m.rubro_id === rubroId && (m.concepto ?? m.proveedor_cliente ?? '') === concepto)
            .forEach(m => movSinPresupuesto.push({ ...m, rubroNombre: rubroNombre(rubroId) }))
        return { concepto, presupuestado, gastado, diferencia, pct, sinPresupuesto }
      })
      const subtotalPres = filas.reduce((s, f) => s + f.presupuestado, 0)
      const subtotalGast = filas.reduce((s, f) => s + f.gastado, 0)
      const subtotalDif  = subtotalPres - subtotalGast
      const subtotalPct  = subtotalPres > 0 ? (subtotalGast / subtotalPres) * 100 : 0
      grupos.push({ rubroId, rubroNombre: rubroNombre(rubroId), filas, subtotalPres, subtotalGast, subtotalDif, subtotalPct, sinPresupuesto: subtotalPres === 0 })
    })
    grupos.sort((a, b) => a.rubroNombre.localeCompare(b.rubroNombre, 'es'))
    const totalPres = grupos.reduce((s, g) => s + g.subtotalPres, 0)
    const totalGast = grupos.reduce((s, g) => s + g.subtotalGast, 0)
    return { grupos, totalPres, totalGast, totalDif: totalPres - totalGast, totalPct: totalPres > 0 ? (totalGast / totalPres) * 100 : 0, movSinPresupuesto }
  }, [presupuestos, movimientos, obraId, rubros, modoTodos])

  const analisisTodos = useMemo(() => {
    if (!obraId || !modoTodos) return null
    const rubroNombre = id => rubros.find(r => r.id === id)?.nombre ?? 'Sin rubro'
    const mapa = {}
    const asegurar = (rubroId, per) => { if (!mapa[rubroId]) mapa[rubroId] = {}; if (!mapa[rubroId][per]) mapa[rubroId][per] = { pres: 0, gasto: 0 } }
    presupuestos.forEach(p => { asegurar(p.rubro_id, p.periodo); mapa[p.rubro_id][p.periodo].pres += Number(p.monto) })
    movimientos.forEach(m => { if (!m.rubro_id) return; asegurar(m.rubro_id, m.periodo); mapa[m.rubro_id][m.periodo].gasto += Number(m.monto_bruto) })
    const grupos = Object.entries(mapa).map(([rubroId, periodosMapa]) => {
      const periodos = Object.keys(periodosMapa).sort()
      const filasPeriodo = periodos.map(per => {
        const { pres, gasto } = periodosMapa[per]
        const diferencia = pres - gasto; const pct = pres > 0 ? (gasto / pres) * 100 : 0
        return { periodo: per, label: labelPeriodo(per), pres, gasto, diferencia, pct, sinPresupuesto: pres === 0 }
      })
      const subtotalPres = filasPeriodo.reduce((s, f) => s + f.pres, 0)
      const subtotalGast = filasPeriodo.reduce((s, f) => s + f.gasto, 0)
      const subtotalDif  = subtotalPres - subtotalGast
      const subtotalPct  = subtotalPres > 0 ? (subtotalGast / subtotalPres) * 100 : 0
      return { rubroId, rubroNombre: rubroNombre(rubroId), filasPeriodo, subtotalPres, subtotalGast, subtotalDif, subtotalPct, sinPresupuesto: subtotalPres === 0 }
    })
    grupos.sort((a, b) => a.rubroNombre.localeCompare(b.rubroNombre, 'es'))
    const totalPres = grupos.reduce((s, g) => s + g.subtotalPres, 0)
    const totalGast = grupos.reduce((s, g) => s + g.subtotalGast, 0)
    return { grupos, totalPres, totalGast, totalDif: totalPres - totalGast, totalPct: totalPres > 0 ? (totalGast / totalPres) * 100 : 0 }
  }, [presupuestos, movimientos, obraId, rubros, modoTodos])

  const obraActual   = obras.find(o => o.id === obraId)
  const periodoLabel = modoTodos ? 'Todos los períodos' : PERIODOS.find(p => p.value === periodo)?.label ?? periodo
  const analisis     = modoTodos ? analisisTodos : analisisPeriodo
  const hayDatos     = analisis && analisis.grupos.length > 0

  function toggleExpandido(rubroId) {
    setExpandidos(prev => { const next = new Set(prev); next.has(rubroId) ? next.delete(rubroId) : next.add(rubroId); return next })
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f0f7fa' }}>
      <TopNav perfil={perfil} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">

        {/* Encabezado */}
        <div className="mb-8">
          <button onClick={() => navigate('/operaciones')}
            className="text-sm font-medium flex items-center gap-1.5 mb-2 transition-colors"
            style={{ color: '#0e7490' }}
            onMouseEnter={e => e.currentTarget.style.color = '#164e63'}
            onMouseLeave={e => e.currentTarget.style.color = '#0e7490'}>
            <IconBack />Panel de Operaciones
          </button>
          <h1 className="text-slate-900 text-2xl font-extrabold tracking-tight">Presupuesto vs. Real</h1>
          <p className="text-slate-400 text-sm mt-0.5">Seguimiento del gasto real contra el presupuesto por obra y período</p>
        </div>

        {/* Selectores */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 mb-6 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lbCls}>Obra</label>
              <select value={obraId} onChange={e => setObraId(e.target.value)} className={selCls}>
                <option value="">— Seleccioná una obra —</option>
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

        {!obraId && <EstadoVacio titulo="Seleccioná una obra" descripcion="Elegí una obra y un período para ver el análisis presupuestario." />}

        {obraId && cargando && (
          <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
            <span className="w-5 h-5 border-2 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
            <span className="text-sm">Calculando análisis…</span>
          </div>
        )}

        {obraId && !cargando && !hayDatos && (
          <EstadoVacio titulo="Sin datos para esta combinación"
            descripcion={`No hay presupuestos ni facturas para ${obraActual?.nombre ?? 'esta obra'}${modoTodos ? '' : ` en ${periodoLabel}`}.`} />
        )}

        {obraId && !cargando && hayDatos && (
          <>
            <div className="mb-4 flex items-center gap-3 flex-wrap">
              <p className="text-slate-600 text-sm">
                <span className="font-semibold text-slate-800">{obraActual?.codigo} · {obraActual?.nombre}</span>
                <span className="text-slate-300 mx-2">·</span>
                {periodoLabel}
              </p>
              {modoTodos && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full border"
                  style={{ backgroundColor: '#e0f2fe', color: '#0e7490', borderColor: '#a5f3fc' }}>
                  Hacé clic en un rubro para ver el desglose por mes
                </span>
              )}
            </div>

            {/* Cards resumen */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <CardResumen label="Total presupuestado" valor={fmtARS(analisis.totalPres)} color="text-slate-900" />
              <CardResumen label="Total gastado" valor={fmtARS(analisis.totalGast)} color="text-slate-900" />
              <CardResumen label="Diferencia disponible" valor={fmtARS(analisis.totalDif)}
                color={analisis.totalDif >= 0 ? 'text-emerald-600' : 'text-red-600'}
                subLabel={analisis.totalPres > 0 ? `${fmtPct(analisis.totalPct)} ejecutado` : undefined} />
            </div>

            {/* Tabla */}
            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm mb-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80">
                      {modoTodos && <Th>{/* chevron */}</Th>}
                      <Th>Rubro</Th>
                      {!modoTodos && <Th>Concepto</Th>}
                      <Th align="right">Presupuestado</Th>
                      <Th align="right">Gastado real</Th>
                      <Th align="right">Diferencia</Th>
                      <Th>% Ejecutado</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {modoTodos
                      ? analisis.grupos.map(grupo => (
                          <GrupoRubroTodos key={grupo.rubroId} grupo={grupo}
                            expandido={expandidos.has(grupo.rubroId)} onToggle={() => toggleExpandido(grupo.rubroId)} />
                        ))
                      : analisis.grupos.map(grupo => (
                          <GrupoRubroPeriodo key={grupo.rubroId} grupo={grupo} />
                        ))
                    }
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: '#e0f2fe' }} className="border-t-2 border-cyan-100">
                      {modoTodos && <td />}
                      <td colSpan={modoTodos ? 1 : 2} className="px-5 py-3.5 text-sm font-bold" style={{ color: '#0e7490' }}>Total general</td>
                      <td className="px-5 py-3.5 text-right font-bold tabular-nums" style={{ color: '#0e7490' }}>{fmtARS(analisis.totalPres)}</td>
                      <td className={`px-5 py-3.5 text-right font-bold tabular-nums ${analisis.totalPct > 100 ? 'text-red-700' : ''}`}
                        style={analisis.totalPct <= 100 ? { color: '#0e7490' } : {}}>{fmtARS(analisis.totalGast)}</td>
                      <td className={`px-5 py-3.5 text-right font-bold tabular-nums ${analisis.totalDif >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {fmtARS(analisis.totalDif)}</td>
                      <td className="px-5 py-3.5">
                        {analisis.totalPres > 0 ? <BarraProgreso pct={analisis.totalPct} sinPresupuesto={false} /> : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {!modoTodos && analisis.movSinPresupuesto?.length > 0 && (
              <SeccionSinPresupuesto movimientos={analisis.movSinPresupuesto} />
            )}
          </>
        )}
      </main>
    </div>
  )
}

// ─── GrupoRubroPeriodo ────────────────────────────────────────────────────────
function GrupoRubroPeriodo({ grupo }) {
  const superado = grupo.subtotalPct > 100 && grupo.subtotalPres > 0
  return (
    <>
      {grupo.filas.map((fila, i) => {
        const filaSuperada = fila.pct > 100 && !fila.sinPresupuesto
        return (
          <tr key={`${grupo.rubroId}-${fila.concepto}-${i}`}
            className={`border-b border-slate-100 transition-colors ${filaSuperada ? 'bg-red-50' : 'hover:bg-slate-50/60'}`}>
            <td className="px-5 py-3 text-slate-700 text-xs align-top">
              {i === 0 ? <span className="font-semibold text-slate-800">{grupo.rubroNombre}</span> : null}
            </td>
            <td className="px-5 py-3 text-slate-600 text-xs">
              <div className="flex items-center gap-2">
                <PuntoSemaforo pct={fila.pct} sinPresupuesto={fila.sinPresupuesto} />
                <span>{fila.concepto || <span className="text-slate-400 italic">Sin concepto</span>}</span>
              </div>
            </td>
            <td className="px-5 py-3 text-right tabular-nums text-slate-600 text-xs">
              {fila.presupuestado > 0 ? fmtARS(fila.presupuestado) : <span className="text-slate-300">—</span>}
            </td>
            <td className={`px-5 py-3 text-right tabular-nums text-xs font-medium ${filaSuperada ? 'text-red-700' : 'text-slate-600'}`}>
              {fila.gastado > 0 ? fmtARS(fila.gastado) : <span className="text-slate-300">—</span>}
            </td>
            <td className={`px-5 py-3 text-right tabular-nums text-xs ${fila.sinPresupuesto ? 'text-slate-400' : fila.diferencia >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {fila.sinPresupuesto ? '—' : fmtARS(fila.diferencia)}
            </td>
            <td className="px-5 py-3"><BarraProgreso pct={fila.pct} sinPresupuesto={fila.sinPresupuesto} /></td>
          </tr>
        )
      })}
      <tr style={{ backgroundColor: superado ? undefined : '#f0f9ff' }} className={`border-b border-slate-200 ${superado ? 'bg-red-50' : ''}`}>
        <td className="px-5 py-2.5 text-xs font-bold" colSpan={2} style={{ color: '#0e7490' }}>Subtotal {grupo.rubroNombre}</td>
        <td className="px-5 py-2.5 text-right tabular-nums text-xs font-bold" style={{ color: '#0e7490' }}>
          {grupo.subtotalPres > 0 ? fmtARS(grupo.subtotalPres) : <span className="text-slate-400 font-normal">—</span>}
        </td>
        <td className={`px-5 py-2.5 text-right tabular-nums text-xs font-bold ${superado ? 'text-red-700' : ''}`}
          style={!superado ? { color: '#0e7490' } : {}}>
          {grupo.subtotalGast > 0 ? fmtARS(grupo.subtotalGast) : <span className="text-slate-400 font-normal">—</span>}
        </td>
        <td className={`px-5 py-2.5 text-right tabular-nums text-xs font-bold ${grupo.sinPresupuesto ? 'text-slate-400' : grupo.subtotalDif >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
          {grupo.sinPresupuesto ? '—' : fmtARS(grupo.subtotalDif)}
        </td>
        <td className="px-5 py-2.5"><BarraProgreso pct={grupo.subtotalPct} sinPresupuesto={grupo.sinPresupuesto} /></td>
      </tr>
    </>
  )
}

// ─── GrupoRubroTodos ──────────────────────────────────────────────────────────
function GrupoRubroTodos({ grupo, expandido, onToggle }) {
  const superado = grupo.subtotalPct > 100 && grupo.subtotalPres > 0
  return (
    <>
      <tr onClick={onToggle}
        className={`border-b border-slate-200 cursor-pointer select-none transition-colors ${superado ? 'bg-red-50 hover:bg-red-100' : 'bg-slate-50 hover:bg-slate-100'}`}>
        <td className="pl-4 pr-2 py-3.5 w-8">
          <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${expandido ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </td>
        <td className="px-3 py-3.5 text-sm font-bold text-slate-800">
          <div className="flex items-center gap-2">
            <PuntoSemaforo pct={grupo.subtotalPct} sinPresupuesto={grupo.sinPresupuesto} />
            {grupo.rubroNombre}
          </div>
        </td>
        <td className="px-5 py-3.5 text-right tabular-nums text-sm font-semibold text-slate-700">
          {grupo.subtotalPres > 0 ? fmtARS(grupo.subtotalPres) : <span className="text-slate-400 font-normal">—</span>}
        </td>
        <td className={`px-5 py-3.5 text-right tabular-nums text-sm font-semibold ${superado ? 'text-red-700' : 'text-slate-700'}`}>
          {grupo.subtotalGast > 0 ? fmtARS(grupo.subtotalGast) : <span className="text-slate-400 font-normal">—</span>}
        </td>
        <td className={`px-5 py-3.5 text-right tabular-nums text-sm font-semibold ${grupo.sinPresupuesto ? 'text-slate-400' : grupo.subtotalDif >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
          {grupo.sinPresupuesto ? '—' : fmtARS(grupo.subtotalDif)}
        </td>
        <td className="px-5 py-3.5"><BarraProgreso pct={grupo.subtotalPct} sinPresupuesto={grupo.sinPresupuesto} /></td>
      </tr>
      {expandido && grupo.filasPeriodo.map(fila => {
        const filaSuperada = fila.pct > 100 && !fila.sinPresupuesto
        return (
          <tr key={fila.periodo} className={`border-b border-slate-100 transition-colors ${filaSuperada ? 'bg-red-50' : 'bg-white hover:bg-slate-50/60'}`}>
            <td className="pl-4 pr-2 py-2.5"><div className="w-4 border-l-2 border-slate-200 h-4 ml-1" /></td>
            <td className="px-3 py-2.5 text-xs text-slate-600 pl-6">
              <div className="flex items-center gap-2">
                <PuntoSemaforo pct={fila.pct} sinPresupuesto={fila.sinPresupuesto} />
                {fila.label}
              </div>
            </td>
            <td className="px-5 py-2.5 text-right tabular-nums text-xs text-slate-600">
              {fila.pres > 0 ? fmtARS(fila.pres) : <span className="text-slate-300">—</span>}
            </td>
            <td className={`px-5 py-2.5 text-right tabular-nums text-xs ${filaSuperada ? 'text-red-700 font-medium' : 'text-slate-600'}`}>
              {fila.gasto > 0 ? fmtARS(fila.gasto) : <span className="text-slate-300">—</span>}
            </td>
            <td className={`px-5 py-2.5 text-right tabular-nums text-xs ${fila.sinPresupuesto ? 'text-slate-400' : fila.diferencia >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {fila.sinPresupuesto ? '—' : fmtARS(fila.diferencia)}
            </td>
            <td className="px-5 py-2.5"><BarraProgreso pct={fila.pct} sinPresupuesto={fila.sinPresupuesto} /></td>
          </tr>
        )
      })}
    </>
  )
}

// ─── SeccionSinPresupuesto ────────────────────────────────────────────────────
function SeccionSinPresupuesto({ movimientos }) {
  const total = movimientos.reduce((s, m) => s + Number(m.monto_bruto), 0)
  return (
    <div className="bg-white border border-orange-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-orange-100 bg-orange-50 flex items-center gap-3">
        <svg className="w-4 h-4 text-orange-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        <div>
          <p className="text-orange-800 font-bold text-sm">Facturas sin presupuesto asignado</p>
          <p className="text-orange-600 text-xs mt-0.5">Estas facturas tienen rubro pero no hay presupuesto cargado para ese rubro en este período.</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80">
              <Th>Proveedor</Th><Th>Rubro</Th><Th>Concepto</Th><Th align="right">Monto</Th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m, i) => (
              <tr key={m.id ?? i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-5 py-3 text-slate-700 text-xs">{m.proveedor_cliente ?? '—'}</td>
                <td className="px-5 py-3 text-xs"><span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full text-xs font-semibold border border-orange-100">{m.rubroNombre}</span></td>
                <td className="px-5 py-3 text-slate-500 text-xs">{m.concepto ?? '—'}</td>
                <td className="px-5 py-3 text-right tabular-nums font-semibold text-red-600 text-xs">{fmtARS(m.monto_bruto)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-100 bg-slate-50/80">
              <td colSpan={3} className="px-5 py-3 text-xs font-bold text-slate-700">Total sin presupuesto</td>
              <td className="px-5 py-3 text-right tabular-nums font-bold text-red-700 text-xs">{fmtARS(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
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

function EstadoVacio({ titulo, descripcion }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-slate-100 shadow-sm">
      <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: '#e0f2fe', color: '#0e7490' }}>
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
        </svg>
      </div>
      <p className="text-slate-700 font-bold text-sm">{titulo}</p>
      <p className="text-slate-400 text-xs mt-1 max-w-sm">{descripcion}</p>
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