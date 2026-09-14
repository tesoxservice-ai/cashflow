// pages/finanzas/PresupuestoVsReal.jsx
// Módulo de análisis Presupuesto vs. Real para el rol 'finanzas'.
// Ruta: /finanzas/presupuesto
//
// Muestra para una obra y período seleccionados:
//   - Cards de resumen (presupuestado / gastado / diferencia)
//   - Tabla agrupada por rubro con subtotales y semáforo visual
//   - Barra de progreso por rubro y total general
//   - Sección de movimientos con rubro pero sin presupuesto cargado
//
// Lógica de cálculo: toda en el cliente a partir de dos queries
// (presupuestos y movimientos del período), sin RPCs en Supabase.

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

// Genera opciones de período: 24 meses atrás + 12 adelante
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

// Período actual como "YYYY-MM-01"
function periodoActual() {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`
}

// ─────────────────────────────────────────────────────────────
// Semáforo: devuelve color Tailwind según % ejecutado
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

// ── Barra de progreso visual ───────────────────────────────────
function BarraProgreso({ pct, sinPresupuesto }) {
  if (sinPresupuesto) {
    return <span className="text-slate-300 text-xs">—</span>
  }
  // Limitamos el ancho al 100% visualmente; el color indica overflow
  const anchoVisible = Math.min(pct, 100)
  const color        = colorSemaforo(pct, false)

  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${anchoVisible}%` }}
        />
      </div>
      <span className={`text-xs font-medium tabular-nums w-12 text-right
                        ${textSemaforo(pct, false)}`}>
        {fmtPct(pct)}
      </span>
    </div>
  )
}

// ── Punto de semáforo ─────────────────────────────────────────
function PuntoSemaforo({ pct, sinPresupuesto }) {
  const color = colorSemaforo(pct, sinPresupuesto)
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${color} shrink-0`}
          title={sinPresupuesto ? 'Sin presupuesto' : fmtPct(pct)} />
  )
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function PresupuestoVsReal() {
  const navigate = useNavigate()

  // ── Datos maestros ─────────────────────────────────────────
  const [obras,   setObras]   = useState([])
  const [rubros,  setRubros]  = useState([]) // mapa id→nombre

  // ── Selección ─────────────────────────────────────────────
  const [obraId,  setObraId]  = useState('')
  const [periodo, setPeriodo] = useState(periodoActual())

  // ── Datos del análisis ─────────────────────────────────────
  const [presupuestos, setPresupuestos] = useState([])
  const [movimientos,  setMovimientos]  = useState([])
  const [cargando,     setCargando]     = useState(false)
  const [error,        setError]        = useState('')

  // ── Carga de obras y rubros al montar ─────────────────────
  useEffect(() => {
    async function cargarMaestros() {
      const [{ data: dataObras }, { data: dataRubros }] = await Promise.all([
        supabase.from('obras')
          .select('id, codigo, nombre, cliente')
          .eq('activa', true)
          .order('codigo'),
        supabase.from('rubros')
          .select('id, nombre, tipo')
          .order('nombre'),
      ])
      setObras(dataObras   ?? [])
      setRubros(dataRubros  ?? [])
    }
    cargarMaestros()
  }, [])

  // ── Carga de análisis al cambiar obra o período ───────────
  const cargarAnalisis = useCallback(async () => {
    if (!obraId || !periodo) { setPresupuestos([]); setMovimientos([]); return }

    setCargando(true)
    setError('')

    const [{ data: dataPres, error: errPres }, { data: dataMov, error: errMov }] =
      await Promise.all([
        // Presupuestos de esa obra en ese período
        supabase.from('presupuestos')
          .select('id, rubro_id, concepto, monto')
          .eq('obra_id', obraId)
          .eq('periodo', periodo),

        // Facturas de esa obra en ese período (solo monto_bruto)
        supabase.from('movimientos')
          .select('id, rubro_id, concepto, proveedor_cliente, monto_bruto')
          .eq('obra_id',   obraId)
          .eq('periodo',   periodo)
          .eq('categoria', 'factura')
          .eq('tipo',      'egreso'),
      ])

    if (errPres || errMov) {
      setError('No se pudo cargar el análisis. Intentá de nuevo.')
      setCargando(false)
      return
    }

    setPresupuestos(dataPres ?? [])
    setMovimientos(dataMov  ?? [])
    setCargando(false)
  }, [obraId, periodo])

  useEffect(() => { cargarAnalisis() }, [cargarAnalisis])

  // ─────────────────────────────────────────────────────────
  // CÁLCULO PRINCIPAL — se hace en JS sobre los datos cargados
  // ─────────────────────────────────────────────────────────
  const analisis = useMemo(() => {
    if (!obraId) return null

    // ── 1. Mapa de rubros por id para resolución de nombre ──
    const rubroNombre = id => rubros.find(r => r.id === id)?.nombre ?? 'Sin rubro'

    // ── 2. Acumular presupuesto por rubro+concepto ──────────
    // Estructura: { [rubroId]: { [concepto]: presupuestado } }
    const presPorRubroConcepto = {}
    presupuestos.forEach(p => {
      const concepto = p.concepto ?? ''
      if (!presPorRubroConcepto[p.rubro_id]) presPorRubroConcepto[p.rubro_id] = {}
      presPorRubroConcepto[p.rubro_id][concepto] =
        (presPorRubroConcepto[p.rubro_id][concepto] ?? 0) + Number(p.monto)
    })

    // ── 3. Acumular gasto real por rubro+concepto ───────────
    // Usamos proveedor_cliente como "concepto de gasto" cuando
    // no hay concepto en el movimiento, para identificar la línea
    const gastoPorRubroConcepto = {}
    const movSinPresupuesto = [] // para la sección inferior

    movimientos.forEach(m => {
      if (!m.rubro_id) return // sin rubro → no clasificable

      const conceptoMov = m.concepto ?? m.proveedor_cliente ?? ''
      if (!gastoPorRubroConcepto[m.rubro_id]) gastoPorRubroConcepto[m.rubro_id] = {}
      gastoPorRubroConcepto[m.rubro_id][conceptoMov] =
        (gastoPorRubroConcepto[m.rubro_id][conceptoMov] ?? 0) + Number(m.monto_bruto)
    })

    // ── 4. Construir el conjunto de rubros involucrados ─────
    const rubrosInvolucrados = new Set([
      ...Object.keys(presPorRubroConcepto),
      ...Object.keys(gastoPorRubroConcepto),
    ])

    // ── 5. Construir grupos por rubro ───────────────────────
    const grupos = []

    rubrosInvolucrados.forEach(rubroId => {
      const conceptosPres  = Object.keys(presPorRubroConcepto[rubroId]  ?? {})
      const conceptosGasto = Object.keys(gastoPorRubroConcepto[rubroId] ?? {})
      const conceptos = [...new Set([...conceptosPres, ...conceptosGasto])]

      const filas = conceptos.map(concepto => {
        const presupuestado = presPorRubroConcepto[rubroId]?.[concepto]  ?? 0
        const gastado       = gastoPorRubroConcepto[rubroId]?.[concepto] ?? 0
        const diferencia    = presupuestado - gastado
        const pct           = presupuestado > 0 ? (gastado / presupuestado) * 100 : 0
        const sinPresupuesto = presupuestado === 0

        // Movimientos sin presupuesto: tienen gasto pero presupuesto = 0
        if (sinPresupuesto && gastado > 0) {
          // Buscamos los movimientos individuales para la sección inferior
          movimientos
            .filter(m => m.rubro_id === rubroId &&
                         (m.concepto ?? m.proveedor_cliente ?? '') === concepto)
            .forEach(m => movSinPresupuesto.push({
              ...m,
              rubroNombre: rubroNombre(rubroId),
            }))
        }

        return { concepto, presupuestado, gastado, diferencia, pct, sinPresupuesto }
      })

      const subtotalPres = filas.reduce((s, f) => s + f.presupuestado, 0)
      const subtotalGast = filas.reduce((s, f) => s + f.gastado,       0)
      const subtotalDif  = subtotalPres - subtotalGast
      const subtotalPct  = subtotalPres > 0 ? (subtotalGast / subtotalPres) * 100 : 0

      grupos.push({
        rubroId,
        rubroNombre: rubroNombre(rubroId),
        filas,
        subtotalPres,
        subtotalGast,
        subtotalDif,
        subtotalPct,
        sinPresupuesto: subtotalPres === 0,
      })
    })

    // Ordenar grupos alfabéticamente por nombre de rubro
    grupos.sort((a, b) => a.rubroNombre.localeCompare(b.rubroNombre, 'es'))

    // ── 6. Totales generales ────────────────────────────────
    const totalPres = grupos.reduce((s, g) => s + g.subtotalPres, 0)
    const totalGast = grupos.reduce((s, g) => s + g.subtotalGast, 0)
    const totalDif  = totalPres - totalGast
    const totalPct  = totalPres > 0 ? (totalGast / totalPres) * 100 : 0

    return { grupos, totalPres, totalGast, totalDif, totalPct, movSinPresupuesto }
  }, [presupuestos, movimientos, obraId, rubros])

  // ── Obra seleccionada (para mostrar nombre en encabezado) ─
  const obraActual = obras.find(o => o.id === obraId)
  const periodoLabel = PERIODOS.find(p => p.value === periodo)?.label ?? periodo

  const hayDatos = analisis && (analisis.grupos.length > 0)

  // ── RENDER ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      <Navbar titulo="Cash Flow" accentColor="text-blue-400" />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">

        {/* ── Encabezado ─────────────────────────────────────── */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/finanzas')}
            className="text-blue-600 text-sm hover:text-blue-800 transition-colors
                       flex items-center gap-1.5 mb-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                 strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Panel de Finanzas
          </button>
          <h1 className="text-slate-900 text-2xl font-semibold tracking-tight">
            Presupuesto vs. Real
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Comparativa entre lo presupuestado y lo ejecutado por obra y período
          </p>
        </div>

        {/* ── Selectores obra + período ──────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Obra */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Obra
              </label>
              <select
                value={obraId}
                onChange={e => setObraId(e.target.value)}
                className={selCls}
              >
                <option value="">— Seleccioná una obra —</option>
                {obras.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.codigo} · {o.nombre} ({o.cliente})
                  </option>
                ))}
              </select>
            </div>
            {/* Período */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Período
              </label>
              <select
                value={periodo}
                onChange={e => setPeriodo(e.target.value)}
                className={selCls}
              >
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
            <button onClick={() => setError('')}
              className="text-red-400 hover:text-red-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* ── Estado: sin obra elegida ───────────────────────── */}
        {!obraId && (
          <EstadoVacio
            titulo="Seleccioná una obra"
            descripcion="Elegí una obra y un período para ver el análisis presupuestario."
          />
        )}

        {/* ── Estado: cargando ───────────────────────────────── */}
        {obraId && cargando && (
          <div className="flex items-center justify-center py-24 gap-3 text-slate-500">
            <span className="w-5 h-5 border-2 border-slate-300 border-t-blue-500
                             rounded-full animate-spin" />
            <span className="text-sm">Calculando análisis…</span>
          </div>
        )}

        {/* ── Estado: sin datos ──────────────────────────────── */}
        {obraId && !cargando && !hayDatos && (
          <EstadoVacio
            titulo="Sin datos para esta combinación"
            descripcion={`No hay presupuestos ni facturas cargadas para ${obraActual?.nombre ?? 'esta obra'} en ${periodoLabel}.`}
          />
        )}

        {/* ── Análisis principal ─────────────────────────────── */}
        {obraId && !cargando && hayDatos && (
          <>
            {/* Título del análisis */}
            <div className="mb-4">
              <p className="text-slate-600 text-sm">
                <span className="font-semibold text-slate-800">{obraActual?.codigo} · {obraActual?.nombre}</span>
                <span className="text-slate-400 mx-2">·</span>
                {periodoLabel}
              </p>
            </div>

            {/* ── Cards de resumen ────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <CardResumen
                label="Total presupuestado"
                valor={fmtARS(analisis.totalPres)}
                color="text-slate-900"
              />
              <CardResumen
                label="Total gastado"
                valor={fmtARS(analisis.totalGast)}
                color="text-slate-900"
              />
              <CardResumen
                label="Diferencia disponible"
                valor={fmtARS(analisis.totalDif)}
                color={analisis.totalDif >= 0 ? 'text-emerald-600' : 'text-red-600'}
                subLabel={analisis.totalPres > 0 ? `${fmtPct(analisis.totalPct)} ejecutado` : undefined}
              />
            </div>

            {/* ── Tabla principal ─────────────────────────────── */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <Th>Rubro</Th>
                      <Th>Concepto</Th>
                      <Th align="right">Presupuestado</Th>
                      <Th align="right">Gastado real</Th>
                      <Th align="right">Diferencia</Th>
                      <Th>% Ejecutado</Th>
                    </tr>
                  </thead>

                  <tbody>
                    {analisis.grupos.map(grupo => (
                      <GrupoRubro key={grupo.rubroId} grupo={grupo} />
                    ))}
                  </tbody>

                  {/* ── Total general ────────────────────────── */}
                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-slate-300">
                      <td colSpan={2}
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
                        {analisis.totalPres > 0 ? (
                          <BarraProgreso pct={analisis.totalPct} sinPresupuesto={false} />
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* ── Movimientos sin presupuesto ─────────────────── */}
            {analisis.movSinPresupuesto.length > 0 && (
              <SeccionSinPresupuesto movimientos={analisis.movSinPresupuesto} />
            )}
          </>
        )}

      </main>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// SUBCOMPONENTE: GrupoRubro
// Renderiza las filas de un rubro + su fila de subtotal
// ══════════════════════════════════════════════════════════════
function GrupoRubro({ grupo }) {
  const superado = grupo.subtotalPct > 100 && grupo.subtotalPres > 0

  return (
    <>
      {/* Filas de conceptos */}
      {grupo.filas.map((fila, i) => {
        const filaSuperada = fila.pct > 100 && !fila.sinPresupuesto
        return (
          <tr
            key={`${grupo.rubroId}-${fila.concepto}-${i}`}
            className={`border-b border-slate-100 transition-colors
                        ${filaSuperada ? 'bg-red-50' : 'hover:bg-slate-50/60'}`}
          >
            {/* Rubro (solo en la primera fila del grupo) */}
            <td className="px-5 py-3 text-slate-700 text-xs align-top">
              {i === 0 ? (
                <span className="font-medium text-slate-800">{grupo.rubroNombre}</span>
              ) : null}
            </td>

            {/* Concepto */}
            <td className="px-5 py-3 text-slate-600 text-xs">
              <div className="flex items-center gap-2">
                <PuntoSemaforo pct={fila.pct} sinPresupuesto={fila.sinPresupuesto} />
                <span>{fila.concepto || <span className="text-slate-400 italic">Sin concepto</span>}</span>
              </div>
            </td>

            {/* Presupuestado */}
            <td className="px-5 py-3 text-right tabular-nums text-slate-700 text-xs">
              {fila.presupuestado > 0 ? fmtARS(fila.presupuestado) : (
                <span className="text-slate-300">—</span>
              )}
            </td>

            {/* Gastado real */}
            <td className={`px-5 py-3 text-right tabular-nums text-xs font-medium
                            ${filaSuperada ? 'text-red-700' : 'text-slate-700'}`}>
              {fila.gastado > 0 ? fmtARS(fila.gastado) : (
                <span className="text-slate-300">—</span>
              )}
            </td>

            {/* Diferencia */}
            <td className={`px-5 py-3 text-right tabular-nums text-xs
                            ${fila.sinPresupuesto
                              ? 'text-slate-400'
                              : fila.diferencia >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {fila.sinPresupuesto ? '—' : fmtARS(fila.diferencia)}
            </td>

            {/* % Ejecutado */}
            <td className="px-5 py-3">
              <BarraProgreso pct={fila.pct} sinPresupuesto={fila.sinPresupuesto} />
            </td>
          </tr>
        )
      })}

      {/* Fila de subtotal por rubro */}
      <tr className={`border-b border-slate-200
                      ${superado ? 'bg-red-50' : 'bg-slate-50'}`}>
        <td className="px-5 py-3 text-xs font-semibold text-slate-700" colSpan={2}>
          Subtotal {grupo.rubroNombre}
        </td>
        <td className="px-5 py-3 text-right tabular-nums text-xs font-semibold text-slate-700">
          {grupo.subtotalPres > 0 ? fmtARS(grupo.subtotalPres) : (
            <span className="text-slate-400 font-normal">—</span>
          )}
        </td>
        <td className={`px-5 py-3 text-right tabular-nums text-xs font-semibold
                        ${superado ? 'text-red-700' : 'text-slate-700'}`}>
          {grupo.subtotalGast > 0 ? fmtARS(grupo.subtotalGast) : (
            <span className="text-slate-400 font-normal">—</span>
          )}
        </td>
        <td className={`px-5 py-3 text-right tabular-nums text-xs font-semibold
                        ${grupo.sinPresupuesto
                          ? 'text-slate-400'
                          : grupo.subtotalDif >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
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
// SUBCOMPONENTE: SeccionSinPresupuesto
// Facturas con rubro asignado pero sin presupuesto para el período
// ══════════════════════════════════════════════════════════════
function SeccionSinPresupuesto({ movimientos }) {
  const total = movimientos.reduce((s, m) => s + Number(m.monto_bruto), 0)

  return (
    <div className="bg-white border border-orange-200 rounded-xl overflow-hidden">
      {/* Cabecera */}
      <div className="px-5 py-4 border-b border-orange-100 bg-orange-50 flex items-center gap-3">
        <svg className="w-4 h-4 text-orange-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673
               1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485
               2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110
               5zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd" />
        </svg>
        <div>
          <p className="text-orange-800 font-semibold text-sm">
            Facturas sin presupuesto asignado
          </p>
          <p className="text-orange-600 text-xs mt-0.5">
            Estas facturas tienen rubro pero no hay presupuesto cargado para ese rubro en este período.
          </p>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <Th>Proveedor</Th>
              <Th>Rubro</Th>
              <Th>Concepto</Th>
              <Th align="right">Monto</Th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m, i) => (
              <tr key={m.id ?? i}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-5 py-3 text-slate-700 text-xs">
                  {m.proveedor_cliente ?? '—'}
                </td>
                <td className="px-5 py-3 text-xs">
                  <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full
                                   text-xs font-medium border border-orange-100">
                    {m.rubroNombre}
                  </span>
                </td>
                <td className="px-5 py-3 text-slate-500 text-xs">
                  {m.concepto ?? '—'}
                </td>
                <td className="px-5 py-3 text-right tabular-nums font-medium text-red-600 text-xs">
                  {fmtARS(m.monto_bruto)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50">
              <td colSpan={3}
                  className="px-5 py-3 text-xs font-semibold text-slate-700">
                Total sin presupuesto
              </td>
              <td className="px-5 py-3 text-right tabular-nums font-bold text-red-700 text-xs">
                {fmtARS(total)}
              </td>
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
      {subLabel && (
        <p className="text-xs text-slate-400 mt-1">{subLabel}</p>
      )}
    </div>
  )
}

function EstadoVacio({ titulo, descripcion }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full
                      flex items-center justify-center mb-4">
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24"
             strokeWidth={1.5} stroke="currentColor">
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
      </div>
      <p className="text-slate-700 font-medium text-sm">{titulo}</p>
      <p className="text-slate-400 text-xs mt-1 max-w-sm">{descripcion}</p>
    </div>
  )
}

function Th({ children, align = 'left' }) {
  return (
    <th className={`px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide
                    whitespace-nowrap
                    ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

const selCls = `w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200
  text-slate-900 bg-white focus:outline-none focus:ring-2
  focus:ring-blue-500 focus:border-transparent`
