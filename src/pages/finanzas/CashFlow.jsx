// pages/finanzas/CashFlow.jsx
// Vista principal del Cash Flow Predictivo.
// Ruta: /finanzas/cashflow
//
// Muestra:
//   1. Panel de saldos iniciales por cuenta (SaldosIniciales)
//   2. Cards de resumen: saldo disponible, proyecciones, posición futura
//   3. Tabla de movimientos con saldo acumulado progresivo,
//      separadores de mes y alertas de liquidez negativa
//
// El saldo acumulado es el corazón del módulo:
//   - Parte de la suma de los saldos iniciales de todas las cuentas
//   - Suma/resta cada movimiento en orden de fecha_pago ascendente
//   - Los filtros de período/cuenta/estado NO alteran el cálculo
//     del saldo acumulado histórico; solo afectan qué filas son visibles

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar'
import SaldosIniciales from './components/SaldosIniciales'

// ─────────────────────────────────────────────────────────────
// Utilitarios
// ─────────────────────────────────────────────────────────────

const fmtARS = n => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 2,
}).format(n ?? 0)

function fmtFecha(str) {
  if (!str) return '—'
  return new Date(str + 'T00:00:00').toLocaleDateString('es-AR')
}

// Primer día del mes de una fecha ISO → "YYYY-MM-01"
function periodoDeStr(fechaStr) {
  if (!fechaStr) return null
  const d = new Date(fechaStr + 'T00:00:00')
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// Label legible del período: "Octubre 2026"
function labelPeriodo(periodoISO) {
  if (!periodoISO) return ''
  const d = new Date(periodoISO + 'T00:00:00')
  const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// Genera opciones de período: 12 meses atrás + 24 adelante
function generarPeriodos() {
  const lista = []
  const hoy = new Date()
  for (let i = -12; i < 24; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    lista.push({ value, label: labelPeriodo(value) })
  }
  return lista
}
const OPCIONES_PERIODO = generarPeriodos()

// Hoy como "YYYY-MM-DD"
function hoyISO() {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`
}

// ── Badges de categoría ────────────────────────────────────────
const BADGE_CAT = {
  factura:           'bg-orange-50 text-orange-700',
  ingreso_cliente:   'bg-green-50 text-green-700',
  sueldo:            'bg-purple-50 text-purple-700',
  impuesto:          'bg-red-50 text-red-700',
  debito_automatico: 'bg-yellow-50 text-yellow-700',
  fima:              'bg-blue-50 text-blue-700',
  otro:              'bg-slate-100 text-slate-600',
}
const LABEL_CAT = {
  factura:           'Factura',
  ingreso_cliente:   'Ingreso cliente',
  sueldo:            'Sueldo',
  impuesto:          'Impuesto',
  debito_automatico: 'Débito aut.',
  fima:              'FIMA',
  otro:              'Otro',
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function CashFlow() {
  const navigate = useNavigate()
  const { user } = useAuth()

  // ── Datos ──────────────────────────────────────────────────
  const [cuentas,      setCuentas]      = useState([])
  const [movimientos,  setMovimientos]  = useState([])  // todos, con notas incorporadas
  const [saldosBase,   setSaldosBase]   = useState([])  // últimos saldos por cuenta
  const [cargando,     setCargando]     = useState(true)
  const [error,        setError]        = useState('')

  // ── Filtros ────────────────────────────────────────────────
  const periodoActual = (() => {
    const h = new Date()
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`
  })()

  const [filtroPeriodo, setFiltroPeriodo] = useState(periodoActual)
  const [filtroCuenta,  setFiltroCuenta]  = useState('')
  const [filtroEstado,  setFiltroEstado]  = useState('') // '' | 'proyectado' | 'ejecutado'

  // ── Carga de cuentas ───────────────────────────────────────
  useEffect(() => {
    supabase
      .from('cuentas')
      .select('id, nombre, tipo, activa')
      .eq('activa', true)
      .order('nombre')
      .then(({ data }) => setCuentas(data ?? []))
  }, [])

  // ── Carga del último saldo inicial por cuenta ──────────────
  const cargarSaldosBase = useCallback(async () => {
    const { data } = await supabase
      .from('saldos_iniciales')
      .select('id, cuenta_id, monto, fecha, created_at')
      .order('fecha',      { ascending: false })
      .order('created_at', { ascending: false })

    // Un saldo por cuenta: el más reciente
    const mapa = {}
    ;(data ?? []).forEach(s => {
      if (!mapa[s.cuenta_id]) mapa[s.cuenta_id] = s
    })
    setSaldosBase(Object.values(mapa))
  }, [])

  useEffect(() => { cargarSaldosBase() }, [cargarSaldosBase])

  // ── Carga de movimientos (todos, con notas) ────────────────
  const cargarMovimientos = useCallback(async () => {
    setCargando(true)
    setError('')

    const { data: movData, error: movErr } = await supabase
      .from('movimientos')
      .select(`
        id, tipo, categoria, proveedor_cliente, numero_factura,
        monto_bruto, monto_neto, concepto,
        periodo, fecha_pago, estado, cuenta_id,
        obras   ( id, codigo, nombre ),
        rubros  ( id, nombre ),
        cuentas ( id, nombre )
      `)
      // Ordenamos por fecha_pago ascendente para el cálculo acumulado.
      // NULL fecha_pago al final.
      .order('fecha_pago', { ascending: true,  nullsFirst: false })
      .order('created_at', { ascending: true })

    if (movErr) {
      setError('No se pudieron cargar los movimientos.')
      setCargando(false)
      return
    }

    // Cargamos todas las notas de una sola vez para evitar N queries
    const movIds = (movData ?? []).map(m => m.id)
    let notasPorMov = {}
    if (movIds.length > 0) {
      const { data: notasData } = await supabase
        .from('notas')
        .select('movimiento_id, tipo_nota, monto')
        .in('movimiento_id', movIds)

      ;(notasData ?? []).forEach(n => {
        if (!notasPorMov[n.movimiento_id]) notasPorMov[n.movimiento_id] = []
        notasPorMov[n.movimiento_id].push(n)
      })
    }

    // Enriquecemos cada movimiento con su monto_efectivo
    // (ya considerando notas de crédito/débito)
    const enriquecidos = (movData ?? []).map(m => {
      const base = m.estado === 'ejecutado'
        ? Number(m.monto_neto  ?? m.monto_bruto ?? 0)
        : Number(m.monto_bruto ?? 0)

      const notas = notasPorMov[m.id] ?? []
      const totalDebitos  = notas.filter(n => n.tipo_nota === 'debito').reduce((s, n) => s + Number(n.monto), 0)
      const totalCreditos = notas.filter(n => n.tipo_nota === 'credito').reduce((s, n) => s + Number(n.monto), 0)

      // Solo las facturas tienen notas; para el resto monto_efectivo = base
      const montoEfectivo = m.categoria === 'factura'
        ? base + totalDebitos - totalCreditos
        : base

      return { ...m, montoEfectivo }
    })

    setMovimientos(enriquecidos)
    setCargando(false)
  }, [])

  useEffect(() => { cargarMovimientos() }, [cargarMovimientos])

  // ─────────────────────────────────────────────────────────
  // CÁLCULO DEL SALDO ACUMULADO
  // Se hace sobre TODOS los movimientos en orden de fecha_pago,
  // sin importar los filtros de la UI. Los filtros solo
  // determinan qué filas se MUESTRAN, no el cálculo del saldo.
  // ─────────────────────────────────────────────────────────
  const { movimientosConSaldo, saldoInicial } = useMemo(() => {
    // Suma de todos los saldos iniciales de todas las cuentas
    const sumaSaldosBase = saldosBase.reduce((acc, s) => acc + Number(s.monto ?? 0), 0)

    let saldoActual = sumaSaldosBase
    const resultado = movimientos.map(m => {
      if (m.tipo === 'ingreso') saldoActual += m.montoEfectivo
      else                      saldoActual -= m.montoEfectivo

      return { ...m, saldoAcumulado: saldoActual }
    })

    return { movimientosConSaldo: resultado, saldoInicial: sumaSaldosBase }
  }, [movimientos, saldosBase])

  // ─────────────────────────────────────────────────────────
  // CARDS DE RESUMEN
  // ─────────────────────────────────────────────────────────
  const resumen = useMemo(() => {
    const hoy = hoyISO()

    // Saldo disponible = saldo inicial + todos los movimientos ejecutados hasta hoy
    let saldoDisponible = saldosBase.reduce((acc, s) => acc + Number(s.monto ?? 0), 0)
    movimientos.forEach(m => {
      if (m.estado !== 'ejecutado') return
      if (m.fecha_pago && m.fecha_pago > hoy) return // solo hasta hoy
      if (m.tipo === 'ingreso') saldoDisponible += m.montoEfectivo
      else                      saldoDisponible -= m.montoEfectivo
    })

    // Proyecciones futuras (solo movimientos proyectados desde hoy en adelante)
    let ingresosProyectados = 0
    let egresosProyectados  = 0
    movimientos.forEach(m => {
      if (m.estado !== 'proyectado') return
      const fecha = m.fecha_pago ?? m.periodo
      if (!fecha || fecha < hoy) return // solo desde hoy
      if (m.tipo === 'ingreso') ingresosProyectados += m.montoEfectivo
      else                      egresosProyectados  += m.montoEfectivo
    })

    return {
      saldoDisponible,
      ingresosProyectados,
      egresosProyectados,
      posicionFutura: saldoDisponible + ingresosProyectados - egresosProyectados,
    }
  }, [movimientos, saldosBase])

  // ─────────────────────────────────────────────────────────
  // FILAS VISIBLES (aplicando filtros de UI)
  // ─────────────────────────────────────────────────────────
  const filasFiltradas = useMemo(() => {
    return movimientosConSaldo.filter(m => {
      // Filtro por período: comparamos el período del movimiento
      if (filtroPeriodo && m.periodo !== filtroPeriodo) return false
      // Filtro por cuenta
      if (filtroCuenta  && m.cuenta_id !== filtroCuenta) return false
      // Filtro por estado
      if (filtroEstado  && m.estado    !== filtroEstado) return false
      return true
    })
  }, [movimientosConSaldo, filtroPeriodo, filtroCuenta, filtroEstado])

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
          <h1 className="text-slate-900 text-2xl font-semibold tracking-tight">Cash Flow</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Posición financiera proyectada y ejecutada
          </p>
        </div>

        {/* Error global */}
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 text-sm
                          rounded-lg px-4 py-3 mb-6 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')}
              className="text-red-400 hover:text-red-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* ── Saldos iniciales ───────────────────────────────── */}
        <SaldosIniciales
          cuentas={cuentas}
          userId={user.id}
          onActualizado={cargarSaldosBase}
        />

        {/* ── Cards de resumen ────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <CardResumen
            label="Saldo disponible"
            valor={fmtARS(resumen.saldoDisponible)}
            subLabel="Saldos iniciales + ejecutados a hoy"
            colorValor="text-slate-900 text-2xl font-bold"
          />
          <CardResumen
            label="Ingresos proyectados"
            valor={fmtARS(resumen.ingresosProyectados)}
            subLabel="Desde hoy en adelante"
            colorValor="text-emerald-600 text-xl font-bold"
          />
          <CardResumen
            label="Egresos proyectados"
            valor={fmtARS(resumen.egresosProyectados)}
            subLabel="Desde hoy en adelante"
            colorValor="text-red-600 text-xl font-bold"
          />
          <CardResumen
            label="Posición futura estimada"
            valor={fmtARS(resumen.posicionFutura)}
            subLabel="Saldo + ingresos − egresos"
            colorValor={`text-xl font-bold ${resumen.posicionFutura >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
          />
        </div>

        {/* ── Filtros ─────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Período */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Período</label>
              <select
                value={filtroPeriodo}
                onChange={e => setFiltroPeriodo(e.target.value)}
                className={selCls}
              >
                <option value="">Todos los períodos</option>
                {OPCIONES_PERIODO.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            {/* Cuenta */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Cuenta</label>
              <select
                value={filtroCuenta}
                onChange={e => setFiltroCuenta(e.target.value)}
                className={selCls}
              >
                <option value="">Todas las cuentas</option>
                {cuentas.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            {/* Estado */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Estado</label>
              <select
                value={filtroEstado}
                onChange={e => setFiltroEstado(e.target.value)}
                className={selCls}
              >
                <option value="">Todos</option>
                <option value="proyectado">Solo proyectados</option>
                <option value="ejecutado">Solo ejecutados</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Tabla del Cash Flow ─────────────────────────────── */}
        {cargando ? (
          <div className="flex items-center justify-center py-24 gap-3 text-slate-500">
            <span className="w-5 h-5 border-2 border-slate-300 border-t-blue-500
                             rounded-full animate-spin" />
            <span className="text-sm">Calculando cash flow…</span>
          </div>
        ) : filasFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-full
                            flex items-center justify-center mb-3">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0
                     0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
              </svg>
            </div>
            <p className="text-slate-600 text-sm font-medium">Sin movimientos para los filtros seleccionados</p>
            <p className="text-slate-400 text-xs mt-1">
              Nota: el saldo acumulado siempre refleja todos los movimientos, sin importar los filtros.
            </p>
          </div>
        ) : (
          <TablaCashFlow
            filas={filasFiltradas}
            saldoInicial={saldoInicial}
          />
        )}

      </main>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// SUBCOMPONENTE: TablaCashFlow
// Renderiza las filas con separadores de mes y alertas de liquidez
// ══════════════════════════════════════════════════════════════
function TablaCashFlow({ filas, saldoInicial }) {
  // Construimos el array de filas renderizables:
  // intercalamos separadores de mes cuando cambia el período
  const filasRender = useMemo(() => {
    const resultado = []
    let ultimoPeriodo = null

    filas.forEach((m, i) => {
      const periodoMov = m.fecha_pago
        ? periodoDeStr(m.fecha_pago)
        : m.periodo

      // Insertar separador cuando cambia el mes
      if (periodoMov !== ultimoPeriodo) {
        // El saldo al inicio del mes = saldo acumulado del movimiento ANTERIOR
        // (si es el primero, es el saldo inicial)
        const saldoAlInicioDelMes = i === 0
          ? saldoInicial
          : filas[i - 1].saldoAcumulado

        resultado.push({
          tipo: 'separador',
          key:  `sep-${periodoMov ?? i}`,
          label: periodoMov ? labelPeriodo(periodoMov) : 'Sin fecha',
          saldoInicio: saldoAlInicioDelMes,
        })
        ultimoPeriodo = periodoMov
      }

      resultado.push({ tipo: 'movimiento', key: m.id, mov: m })
    })

    return resultado
  }, [filas, saldoInicial])

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <Th>Fecha pago</Th>
              <Th>Estado</Th>
              <Th>Categoría</Th>
              <Th>Proveedor / Cliente</Th>
              <Th>Obra</Th>
              <Th align="right">Ingreso</Th>
              <Th align="right">Egreso</Th>
              <Th align="right">Saldo acumulado</Th>
            </tr>
          </thead>
          <tbody>
            {filasRender.map(fila => {
              if (fila.tipo === 'separador') {
                return (
                  <FilaSeparador
                    key={fila.key}
                    label={fila.label}
                    saldoInicio={fila.saldoInicio}
                  />
                )
              }

              const { mov: m } = fila
              const saldoNeg   = m.saldoAcumulado < 0

              return (
                <tr
                  key={fila.key}
                  className={`border-b border-slate-100 last:border-0 transition-colors
                              ${saldoNeg ? 'bg-red-50' : 'hover:bg-slate-50/60'}`}
                >
                  {/* Fecha pago */}
                  <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">
                    {fmtFecha(m.fecha_pago)}
                  </td>

                  {/* Estado */}
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                      ${m.estado === 'ejecutado'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'}`}>
                      {m.estado === 'ejecutado' ? 'Ejecutado' : 'Proyectado'}
                    </span>
                  </td>

                  {/* Categoría */}
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                                      ${BADGE_CAT[m.categoria] ?? 'bg-slate-100 text-slate-600'}`}>
                      {LABEL_CAT[m.categoria] ?? m.categoria}
                    </span>
                  </td>

                  {/* Proveedor / Cliente */}
                  <td className="px-4 py-3 text-slate-700 max-w-[180px]">
                    <span className="truncate block" title={m.proveedor_cliente ?? m.concepto ?? ''}>
                      {m.proveedor_cliente ?? m.concepto ?? '—'}
                    </span>
                    {m.numero_factura && (
                      <span className="text-xs text-slate-400 block">Nº {m.numero_factura}</span>
                    )}
                  </td>

                  {/* Obra */}
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {m.obras?.codigo ?? '—'}
                  </td>

                  {/* Ingreso */}
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    {m.tipo === 'ingreso' ? (
                      <span className="text-emerald-600 font-medium">
                        {fmtARS(m.montoEfectivo)}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>

                  {/* Egreso */}
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    {m.tipo === 'egreso' ? (
                      <span className="text-red-600 font-medium">
                        {fmtARS(m.montoEfectivo)}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>

                  {/* Saldo acumulado — columna más importante */}
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    <span className={`font-semibold text-sm
                      ${saldoNeg ? 'text-red-700 font-bold' : 'text-slate-900'}`}>
                      {fmtARS(m.saldoAcumulado)}
                    </span>
                    {/* Alerta visual de liquidez negativa */}
                    {saldoNeg && (
                      <span className="block text-red-500 text-[10px] font-medium leading-tight">
                        ⚠ Saldo negativo
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Fila separadora de mes ─────────────────────────────────────
function FilaSeparador({ label, saldoInicio }) {
  return (
    <tr className="bg-slate-100 border-b border-slate-200">
      <td colSpan={5} className="px-4 py-2">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          {label}
        </span>
      </td>
      <td colSpan={2} className="px-4 py-2 text-right">
        <span className="text-xs text-slate-500">Saldo al inicio del mes</span>
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        <span className={`text-xs font-semibold
          ${saldoInicio < 0 ? 'text-red-600' : 'text-slate-700'}`}>
          {fmtARS(saldoInicio)}
        </span>
      </td>
    </tr>
  )
}

// ── Subcomponentes auxiliares ──────────────────────────────────

function CardResumen({ label, valor, subLabel, colorValor }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <p className={colorValor}>{valor}</p>
      {subLabel && (
        <p className="text-xs text-slate-400 mt-1">{subLabel}</p>
      )}
    </div>
  )
}

function Th({ children, align = 'left' }) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide
                    ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}


const selCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-200
  text-slate-900 bg-white focus:outline-none focus:ring-2
  focus:ring-blue-500 focus:border-transparent`