// pages/operaciones/PresupuestoVsReal.jsx
// Módulo de análisis Presupuesto vs. Real para el rol 'operaciones'.
// Ruta: /operaciones/presupuesto
//
// Modos:
//   - Por período: filtra un mes específico (comportamiento original)
//   - Todos los períodos: acumula toda la obra, con desglose por mes
//     expandible por rubro al hacer clic en la fila.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import Navbar from '../../components/Navbar'

// ─────────────────────────────────────────────────────────────
// Utilitarios
// ─────────────────────────────────────────────────────────────

const fmtARS = n => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 2,
}).format(n ?? 0)

const fmtPct = pct => `${pct.toFixed(1)}%`

function generarPeriodos() {
  const lista = []
  const hoy   = new Date()
  for (let i = -24; i <= 12; i++) {
    const d     = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1)
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

// ─────────────────────────────────────────────────────────────
// Semáforo
// ─────────────────────────────────────────────────────────────
function colorSemaforo(pct, sinPresupuesto) {
  if (sinPresupuesto) return 'bg-slate-300'
  if (pct > 100)      return 'bg-red-500'
  if (pct >= 80)      return 'bg-yellow-400'
  return 'bg-emerald-500'
}

function textSemaforo(pct, sinPresupuesto) {
  if (sinPresupuesto) return 'text-slate-400'
  if (pct > 100)      return 'text-red-700'
  if (pct >= 80)      return 'text-yellow-700'
  return 'text-emerald-700'
}

function BarraProgreso({ pct, sinPresupuesto }) {
  if (sinPresupuesto) return <span className="text-slate-300 text-xs">—</span>
  const anchoVisible = Math.min(pct, 100)
  const color = colorSemaforo(pct, false)
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${anchoVisible}%` }}
        />
      </div>
      <span className={`text-xs font-medium tabular-nums w-12 text-right ${textSemaforo(pct, false)}`}>
        {fmtPct(pct)}
      </span>
    </div>
  )
}

function PuntoSemaforo({ pct, sinPresupuesto }) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${colorSemaforo(pct, sinPresupuesto)} shrink-0`}
      title={sinPresupuesto ? 'Sin presupuesto' : fmtPct(pct)}
    />
  )
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function PresupuestoVsRealOperaciones() {
  const navigate = useNavigate()

  const [obras,  setObras]  = useState([])
  const [rubros, setRubros] = useState([])

  const [obraId,  setObraId]  = useState('')
  const [periodo, setPeriodo] = useState(periodoActual())

  const [presupuestos, setPresupuestos] = useState([])
  const [movimientos,  setMovimientos]  = useState([])
  const [cargando,     setCargando]     = useState(false)
  const [error,        setError]        = useState('')

  // rubros expandidos en modo "todos los períodos"
  const [expandidos, setExpandidos] = useState(new Set())

  const modoTodos = periodo === 'todos'

  useEffect(() => {
    async function cargarMaestros() {
      const [{ data: dataObras }, { data: dataRubros }] = await Promise.all([
        supabase.from('obras').select('id, codigo, nombre, cliente').eq('activa', true).order('codigo'),
        supabase.from('rubros').select('id, nombre, tipo').order('nombre'),
      ])
      setObras(dataObras   ?? [])
      setRubros(dataRubros ?? [])
    }
    cargarMaestros()
  }, [])

  const cargarAnalisis = useCallback(async () => {
    if (!obraId) { setPresupuestos([]); setMovimientos([]); return }

    setCargando(true)
    setError('')
    setExpandidos(new Set())

    // Query base — si es "todos" no filtramos por período
    let qPres = supabase.from('presupuestos')
      .select('id, rubro_id, concepto, monto, periodo')
      .eq('obra_id', obraId)

    let qMov = supabase.from('movimientos')
      .select('id, rubro_id, concepto, proveedor_cliente, monto_bruto, periodo')
      .eq('obra_id',   obraId)
      .eq('categoria', 'factura')
      .eq('tipo',      'egreso')

    if (!modoTodos) {
      qPres = qPres.eq('periodo', periodo)
      qMov  = qMov.eq('periodo',  periodo)
    }

    const [{ data: dataPres, error: errPres }, { data: dataMov, error: errMov }] =
      await Promise.all([qPres, qMov])

    if (errPres || errMov) {
      setError('No se pudo cargar el análisis. Intentá de nuevo.')
      setCargando(false)
      return
    }

    setPresupuestos(dataPres ?? [])
    setMovimientos(dataMov  ?? [])
    setCargando(false)
  }, [obraId, periodo, modoTodos])

  useEffect(() => { cargarAnalisis() }, [cargarAnalisis])

  // ─────────────────────────────────────────────────────────
  // CÁLCULO — modo período único (igual que antes)
  // ─────────────────────────────────────────────────────────
  const analisisPeriodo = useMemo(() => {
    if (!obraId || modoTodos) return null

    const rubroNombre = id => rubros.find(r => r.id === id)?.nombre ?? 'Sin rubro'

    const presPorRubroConcepto = {}
    presupuestos.forEach(p => {
      const concepto = p.concepto ?? ''
      if (!presPorRubroConcepto[p.rubro_id]) presPorRubroConcepto[p.rubro_id] = {}
      presPorRubroConcepto[p.rubro_id][concepto] =
        (presPorRubroConcepto[p.rubro_id][concepto] ?? 0) + Number(p.monto)
    })

    const gastoPorRubroConcepto = {}
    const movSinPresupuesto = []

    movimientos.forEach(m => {
      if (!m.rubro_id) return
      const conceptoMov = m.concepto ?? m.proveedor_cliente ?? ''
      if (!gastoPorRubroConcepto[m.rubro_id]) gastoPorRubroConcepto[m.rubro_id] = {}
      gastoPorRubroConcepto[m.rubro_id][conceptoMov] =
        (gastoPorRubroConcepto[m.rubro_id][conceptoMov] ?? 0) + Number(m.monto_bruto)
    })

    const rubrosInvolucrados = new Set([
      ...Object.keys(presPorRubroConcepto),
      ...Object.keys(gastoPorRubroConcepto),
    ])

    const grupos = []
    rubrosInvolucrados.forEach(rubroId => {
      const conceptosPres  = Object.keys(presPorRubroConcepto[rubroId] ?? {})
      const conceptosGasto = Object.keys(gastoPorRubroConcepto[rubroId] ?? {})
      const conceptos = [...new Set([...conceptosPres, ...conceptosGasto])]

      const filas = conceptos.map(concepto => {
        const presupuestado  = presPorRubroConcepto[rubroId]?.[concepto] ?? 0
        const gastado        = gastoPorRubroConcepto[rubroId]?.[concepto] ?? 0
        const diferencia     = presupuestado - gastado
        const pct            = presupuestado > 0 ? (gastado / presupuestado) * 100 : 0
        const sinPresupuesto = presupuestado === 0

        if (sinPresupuesto && gastado > 0) {
          movimientos
            .filter(m => m.rubro_id === rubroId &&
                         (m.concepto ?? m.proveedor_cliente ?? '') === concepto)
            .forEach(m => movSinPresupuesto.push({ ...m, rubroNombre: rubroNombre(rubroId) }))
        }

        return { concepto, presupuestado, gastado, diferencia, pct, sinPresupuesto }
      })

      const subtotalPres = filas.reduce((s, f) => s + f.presupuestado, 0)
      const subtotalGast = filas.reduce((s, f) => s + f.gastado, 0)
      const subtotalDif  = subtotalPres - subtotalGast
      const subtotalPct  = subtotalPres > 0 ? (subtotalGast / subtotalPres) * 100 : 0

      grupos.push({
        rubroId, rubroNombre: rubroNombre(rubroId),
        filas, subtotalPres, subtotalGast, subtotalDif, subtotalPct,
        sinPresupuesto: subtotalPres === 0,
      })
    })

    grupos.sort((a, b) => a.rubroNombre.localeCompare(b.rubroNombre, 'es'))

    const totalPres = grupos.reduce((s, g) => s + g.subtotalPres, 0)
    const totalGast = grupos.reduce((s, g) => s + g.subtotalGast, 0)
    const totalDif  = totalPres - totalGast
    const totalPct  = totalPres > 0 ? (totalGast / totalPres) * 100 : 0

    return { grupos, totalPres, totalGast, totalDif, totalPct, movSinPresupuesto }
  }, [presupuestos, movimientos, obraId, rubros, modoTodos])

  // ─────────────────────────────────────────────────────────
  // CÁLCULO — modo todos los períodos
  // Estructura: por rubro → por período → { pres, gasto }
  // ─────────────────────────────────────────────────────────
  const analisisTodos = useMemo(() => {
    if (!obraId || !modoTodos) return null

    const rubroNombre = id => rubros.find(r => r.id === id)?.nombre ?? 'Sin rubro'

    // { rubroId: { periodo: { pres, gasto } } }
    const mapa = {}

    const asegurar = (rubroId, per) => {
      if (!mapa[rubroId]) mapa[rubroId] = {}
      if (!mapa[rubroId][per]) mapa[rubroId][per] = { pres: 0, gasto: 0 }
    }

    presupuestos.forEach(p => {
      asegurar(p.rubro_id, p.periodo)
      mapa[p.rubro_id][p.periodo].pres += Number(p.monto)
    })

    movimientos.forEach(m => {
      if (!m.rubro_id) return
      asegurar(m.rubro_id, m.periodo)
      mapa[m.rubro_id][m.periodo].gasto += Number(m.monto_bruto)
    })

    const grupos = Object.entries(mapa).map(([rubroId, periodosMapa]) => {
      // Períodos ordenados cronológicamente
      const periodos = Object.keys(periodosMapa).sort()

      const filasPeriodo = periodos.map(per => {
        const { pres, gasto } = periodosMapa[per]
        const diferencia     = pres - gasto
        const pct            = pres > 0 ? (gasto / pres) * 100 : 0
        const sinPresupuesto = pres === 0
        return { periodo: per, label: labelPeriodo(per), pres, gasto, diferencia, pct, sinPresupuesto }
      })

      const subtotalPres = filasPeriodo.reduce((s, f) => s + f.pres, 0)
      const subtotalGast = filasPeriodo.reduce((s, f) => s + f.gasto, 0)
      const subtotalDif  = subtotalPres - subtotalGast
      const subtotalPct  = subtotalPres > 0 ? (subtotalGast / subtotalPres) * 100 : 0

      return {
        rubroId,
        rubroNombre: rubroNombre(rubroId),
        filasPeriodo,
        subtotalPres, subtotalGast, subtotalDif, subtotalPct,
        sinPresupuesto: subtotalPres === 0,
      }
    })

    grupos.sort((a, b) => a.rubroNombre.localeCompare(b.rubroNombre, 'es'))

    const totalPres = grupos.reduce((s, g) => s + g.subtotalPres, 0)
    const totalGast = grupos.reduce((s, g) => s + g.subtotalGast, 0)
    const totalDif  = totalPres - totalGast
    const totalPct  = totalPres > 0 ? (totalGast / totalPres) * 100 : 0

    return { grupos, totalPres, totalGast, totalDif, totalPct }
  }, [presupuestos, movimientos, obraId, rubros, modoTodos])

  const obraActual   = obras.find(o => o.id === obraId)
  const periodoLabel = modoTodos
    ? 'Todos los períodos'
    : PERIODOS.find(p => p.value === periodo)?.label ?? periodo

  const analisis = modoTodos ? analisisTodos : analisisPeriodo
  const hayDatos = analisis && analisis.grupos.length > 0

  function toggleExpandido(rubroId) {
    setExpandidos(prev => {
      const next = new Set(prev)
      next.has(rubroId) ? next.delete(rubroId) : next.add(rubroId)
      return next
    })
  }

  // ── RENDER ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar titulo="Operaciones" accentColor="text-emerald-400" />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">

        {/* Encabezado */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/operaciones')}
            className="text-emerald-600 text-sm hover:text-emerald-800 transition-colors
                       flex items-center gap-1.5 mb-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Panel de Operaciones
          </button>
          <h1 className="text-slate-900 text-2xl font-semibold tracking-tight">
            Presupuesto vs. Real
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Comparativa entre lo presupuestado y lo ejecutado por obra y período
          </p>
        </div>

        {/* Selectores */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Obra</label>
              <select value={obraId} onChange={e => setObraId(e.target.value)} className={selCls}>
                <option value="">— Seleccioná una obra —</option>
                {obras.map(o => (
                  <option key={o.id} value={o.id}>{o.codigo} · {o.nombre} ({o.cliente})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Período</label>
              <select value={periodo} onChange={e => setPeriodo(e.target.value)} className={selCls}>
                <option value="todos">— Todos los períodos —</option>
                {PERIODOS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 text-sm
                          rounded-lg px-4 py-3 mb-5 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {!obraId && (
          <EstadoVacio titulo="Seleccioná una obra" descripcion="Elegí una obra y un período para ver el análisis presupuestario." />
        )}

        {obraId && cargando && (
          <div className="flex items-center justify-center py-24 gap-3 text-slate-500">
            <span className="w-5 h-5 border-2 border-slate-300 border-t-emerald-500 rounded-full animate-spin" />
            <span className="text-sm">Calculando análisis…</span>
          </div>
        )}

        {obraId && !cargando && !hayDatos && (
          <EstadoVacio
            titulo="Sin datos para esta combinación"
            descripcion={`No hay presupuestos ni facturas cargadas para ${obraActual?.nombre ?? 'esta obra'}${modoTodos ? '' : ` en ${periodoLabel}`}.`}
          />
        )}

        {obraId && !cargando && hayDatos && (
          <>
            <div className="mb-4 flex items-center gap-3">
              <p className="text-slate-600 text-sm">
                <span className="font-semibold text-slate-800">{obraActual?.codigo} · {obraActual?.nombre}</span>
                <span className="text-slate-400 mx-2">·</span>
                {periodoLabel}
              </p>
              {modoTodos && (
                <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100
                                 px-2 py-0.5 rounded-full font-medium">
                  Hacé clic en un rubro para ver el desglose por mes
                </span>
              )}
            </div>

            {/* Cards resumen */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <CardResumen label="Total presupuestado" valor={fmtARS(analisis.totalPres)} color="text-slate-900" />
              <CardResumen label="Total gastado" valor={fmtARS(analisis.totalGast)} color="text-slate-900" />
              <CardResumen
                label="Diferencia disponible"
                valor={fmtARS(analisis.totalDif)}
                color={analisis.totalDif >= 0 ? 'text-emerald-600' : 'text-red-600'}
                subLabel={analisis.totalPres > 0 ? `${fmtPct(analisis.totalPct)} ejecutado` : undefined}
              />
            </div>

            {/* Tabla */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
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
                          <GrupoRubroTodos
                            key={grupo.rubroId}
                            grupo={grupo}
                            expandido={expandidos.has(grupo.rubroId)}
                            onToggle={() => toggleExpandido(grupo.rubroId)}
                          />
                        ))
                      : analisis.grupos.map(grupo => (
                          <GrupoRubroPeriodo key={grupo.rubroId} grupo={grupo} />
                        ))
                    }
                  </tbody>

                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-slate-300">
                      {modoTodos && <td />}
                      <td colSpan={modoTodos ? 1 : 2}
                          className="px-5 py-3.5 text-sm font-bold text-slate-800">
                        Total general
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold tabular-nums text-slate-800">
                        {fmtARS(analisis.totalPres)}
                      </td>
                      <td className={`px-5 py-3.5 text-right font-bold tabular-nums
                        ${analisis.totalPct > 100 ? 'text-red-700' : 'text-slate-800'}`}>
                        {fmtARS(analisis.totalGast)}
                      </td>
                      <td className={`px-5 py-3.5 text-right font-bold tabular-nums
                        ${analisis.totalDif >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {fmtARS(analisis.totalDif)}
                      </td>
                      <td className="px-5 py-3.5">
                        {analisis.totalPres > 0
                          ? <BarraProgreso pct={analisis.totalPct} sinPresupuesto={false} />
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Movimientos sin presupuesto — solo en modo período */}
            {!modoTodos && analisis.movSinPresupuesto?.length > 0 && (
              <SeccionSinPresupuesto movimientos={analisis.movSinPresupuesto} />
            )}
          </>
        )}
      </main>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// GrupoRubroPeriodo — modo período único (comportamiento original)
// ══════════════════════════════════════════════════════════════
function GrupoRubroPeriodo({ grupo }) {
  const superado = grupo.subtotalPct > 100 && grupo.subtotalPres > 0

  return (
    <>
      {grupo.filas.map((fila, i) => {
        const filaSuperada = fila.pct > 100 && !fila.sinPresupuesto
        return (
          <tr key={`${grupo.rubroId}-${fila.concepto}-${i}`}
              className={`border-b border-slate-100 transition-colors
                          ${filaSuperada ? 'bg-red-50' : 'hover:bg-slate-50/60'}`}>
            <td className="px-5 py-3 text-slate-700 text-xs align-top">
              {i === 0 ? <span className="font-medium text-slate-800">{grupo.rubroNombre}</span> : null}
            </td>
            <td className="px-5 py-3 text-slate-600 text-xs">
              <div className="flex items-center gap-2">
                <PuntoSemaforo pct={fila.pct} sinPresupuesto={fila.sinPresupuesto} />
                <span>{fila.concepto || <span className="text-slate-400 italic">Sin concepto</span>}</span>
              </div>
            </td>
            <td className="px-5 py-3 text-right tabular-nums text-slate-700 text-xs">
              {fila.presupuestado > 0 ? fmtARS(fila.presupuestado) : <span className="text-slate-300">—</span>}
            </td>
            <td className={`px-5 py-3 text-right tabular-nums text-xs font-medium
                            ${filaSuperada ? 'text-red-700' : 'text-slate-700'}`}>
              {fila.gastado > 0 ? fmtARS(fila.gastado) : <span className="text-slate-300">—</span>}
            </td>
            <td className={`px-5 py-3 text-right tabular-nums text-xs
                            ${fila.sinPresupuesto ? 'text-slate-400' : fila.diferencia >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {fila.sinPresupuesto ? '—' : fmtARS(fila.diferencia)}
            </td>
            <td className="px-5 py-3">
              <BarraProgreso pct={fila.pct} sinPresupuesto={fila.sinPresupuesto} />
            </td>
          </tr>
        )
      })}

      <tr className={`border-b border-slate-200 ${superado ? 'bg-red-50' : 'bg-slate-50'}`}>
        <td className="px-5 py-3 text-xs font-semibold text-slate-700" colSpan={2}>
          Subtotal {grupo.rubroNombre}
        </td>
        <td className="px-5 py-3 text-right tabular-nums text-xs font-semibold text-slate-700">
          {grupo.subtotalPres > 0 ? fmtARS(grupo.subtotalPres) : <span className="text-slate-400 font-normal">—</span>}
        </td>
        <td className={`px-5 py-3 text-right tabular-nums text-xs font-semibold ${superado ? 'text-red-700' : 'text-slate-700'}`}>
          {grupo.subtotalGast > 0 ? fmtARS(grupo.subtotalGast) : <span className="text-slate-400 font-normal">—</span>}
        </td>
        <td className={`px-5 py-3 text-right tabular-nums text-xs font-semibold
                        ${grupo.sinPresupuesto ? 'text-slate-400' : grupo.subtotalDif >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
          {grupo.sinPresupuesto ? '—' : fmtARS(grupo.subtotalDif)}
        </td>
        <td className="px-5 py-3">
          <BarraProgreso pct={grupo.subtotalPct} sinPresupuesto={grupo.sinPresupuesto} />
        </td>
      </tr>
    </>
  )
}

// ══════════════════════════════════════════════════════════════
// GrupoRubroTodos — modo todos los períodos, con acordeón
// ══════════════════════════════════════════════════════════════
function GrupoRubroTodos({ grupo, expandido, onToggle }) {
  const superado = grupo.subtotalPct > 100 && grupo.subtotalPres > 0

  return (
    <>
      {/* Fila principal del rubro — clickeable */}
      <tr
        onClick={onToggle}
        className={`border-b border-slate-200 cursor-pointer select-none transition-colors
                    ${superado ? 'bg-red-50 hover:bg-red-100' : 'bg-slate-50 hover:bg-slate-100'}`}
      >
        {/* Chevron */}
        <td className="pl-4 pr-2 py-3.5 w-8">
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform duration-200
                        ${expandido ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </td>

        {/* Nombre del rubro */}
        <td className="px-3 py-3.5 text-sm font-semibold text-slate-800">
          <div className="flex items-center gap-2">
            <PuntoSemaforo pct={grupo.subtotalPct} sinPresupuesto={grupo.sinPresupuesto} />
            {grupo.rubroNombre}
          </div>
        </td>

        <td className="px-5 py-3.5 text-right tabular-nums text-sm font-semibold text-slate-700">
          {grupo.subtotalPres > 0 ? fmtARS(grupo.subtotalPres) : <span className="text-slate-400 font-normal">—</span>}
        </td>
        <td className={`px-5 py-3.5 text-right tabular-nums text-sm font-semibold
                        ${superado ? 'text-red-700' : 'text-slate-700'}`}>
          {grupo.subtotalGast > 0 ? fmtARS(grupo.subtotalGast) : <span className="text-slate-400 font-normal">—</span>}
        </td>
        <td className={`px-5 py-3.5 text-right tabular-nums text-sm font-semibold
                        ${grupo.sinPresupuesto ? 'text-slate-400' : grupo.subtotalDif >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
          {grupo.sinPresupuesto ? '—' : fmtARS(grupo.subtotalDif)}
        </td>
        <td className="px-5 py-3.5">
          <BarraProgreso pct={grupo.subtotalPct} sinPresupuesto={grupo.sinPresupuesto} />
        </td>
      </tr>

      {/* Filas de períodos — visibles solo si está expandido */}
      {expandido && grupo.filasPeriodo.map(fila => {
        const filaSuperada = fila.pct > 100 && !fila.sinPresupuesto
        return (
          <tr
            key={fila.periodo}
            className={`border-b border-slate-100 transition-colors
                        ${filaSuperada ? 'bg-red-50' : 'bg-white hover:bg-slate-50/60'}`}
          >
            {/* Indent visual */}
            <td className="pl-4 pr-2 py-2.5">
              <div className="w-4 border-l-2 border-slate-200 h-4 ml-1" />
            </td>
            <td className="px-3 py-2.5 text-xs text-slate-600 pl-6">
              <div className="flex items-center gap-2">
                <PuntoSemaforo pct={fila.pct} sinPresupuesto={fila.sinPresupuesto} />
                {fila.label}
              </div>
            </td>
            <td className="px-5 py-2.5 text-right tabular-nums text-xs text-slate-600">
              {fila.pres > 0 ? fmtARS(fila.pres) : <span className="text-slate-300">—</span>}
            </td>
            <td className={`px-5 py-2.5 text-right tabular-nums text-xs
                            ${filaSuperada ? 'text-red-700 font-medium' : 'text-slate-600'}`}>
              {fila.gasto > 0 ? fmtARS(fila.gasto) : <span className="text-slate-300">—</span>}
            </td>
            <td className={`px-5 py-2.5 text-right tabular-nums text-xs
                            ${fila.sinPresupuesto ? 'text-slate-400' : fila.diferencia >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {fila.sinPresupuesto ? '—' : fmtARS(fila.diferencia)}
            </td>
            <td className="px-5 py-2.5">
              <BarraProgreso pct={fila.pct} sinPresupuesto={fila.sinPresupuesto} />
            </td>
          </tr>
        )
      })}
    </>
  )
}

// ══════════════════════════════════════════════════════════════
// SeccionSinPresupuesto
// ══════════════════════════════════════════════════════════════
function SeccionSinPresupuesto({ movimientos }) {
  const total = movimientos.reduce((s, m) => s + Number(m.monto_bruto), 0)
  return (
    <div className="bg-white border border-orange-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-orange-100 bg-orange-50 flex items-center gap-3">
        <svg className="w-4 h-4 text-orange-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673
               1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485
               2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110
               5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        <div>
          <p className="text-orange-800 font-semibold text-sm">Facturas sin presupuesto asignado</p>
          <p className="text-orange-600 text-xs mt-0.5">
            Estas facturas tienen rubro pero no hay presupuesto cargado para ese rubro en este período.
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <Th>Proveedor</Th><Th>Rubro</Th><Th>Concepto</Th><Th align="right">Monto</Th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m, i) => (
              <tr key={m.id ?? i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-5 py-3 text-slate-700 text-xs">{m.proveedor_cliente ?? '—'}</td>
                <td className="px-5 py-3 text-xs">
                  <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full text-xs font-medium border border-orange-100">
                    {m.rubroNombre}
                  </span>
                </td>
                <td className="px-5 py-3 text-slate-500 text-xs">{m.concepto ?? '—'}</td>
                <td className="px-5 py-3 text-right tabular-nums font-medium text-red-600 text-xs">
                  {fmtARS(m.monto_bruto)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50">
              <td colSpan={3} className="px-5 py-3 text-xs font-semibold text-slate-700">Total sin presupuesto</td>
              <td className="px-5 py-3 text-right tabular-nums font-bold text-red-700 text-xs">{fmtARS(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ── Subcomponentes menores ─────────────────────────────────────

function CardResumen({ label, valor, color, subLabel }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${color}`}>{valor}</p>
      {subLabel && <p className="text-xs text-slate-400 mt-1">{subLabel}</p>}
    </div>
  )
}

function EstadoVacio({ titulo, descripcion }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4">
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75
               4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3
               .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988
               5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203
               1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352
               5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
        </svg>
      </div>
      <p className="text-slate-700 font-medium text-sm">{titulo}</p>
      <p className="text-slate-400 text-xs mt-1 max-w-sm">{descripcion}</p>
    </div>
  )
}

function Th({ children, align = 'left' }) {
  return (
    <th className={`px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide
                    whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

const selCls = `w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200
  text-slate-900 bg-white focus:outline-none focus:ring-2
  focus:ring-emerald-500 focus:border-transparent`