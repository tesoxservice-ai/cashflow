// pages/finanzas/CashFlow.jsx
// Vista principal del Cash Flow Predictivo.
// Ruta: /finanzas/cashflow
//
// Muestra la posición financiera de la empresa desde hoy
// hasta 90 días adelante en una sola tabla continua.
//
// Cards superiores: Saldo hoy + Posición a 30, 60 y 90 días.
// La tabla no filtra por período — muestra todo el horizonte
// de forma continua con separadores de mes como referencia visual.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar'
import SaldosIniciales from './components/SaldosIniciales'

const fmtARS = n => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 2,
}).format(n ?? 0)

function fmtFecha(str) {
  if (!str) return '—'
  return new Date(str + 'T00:00:00').toLocaleDateString('es-AR')
}

function periodoDeStr(fechaStr) {
  if (!fechaStr) return null
  const d = new Date(fechaStr + 'T00:00:00')
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function labelPeriodo(periodoISO) {
  if (!periodoISO) return ''
  const d = new Date(periodoISO + 'T00:00:00')
  const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function hoyISO() {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`
}

function fechaFutura(dias) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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

const selCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-200
  text-slate-900 bg-white focus:outline-none focus:ring-2
  focus:ring-blue-500 focus:border-transparent`

export default function CashFlow() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [cuentas,     setCuentas]     = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [saldosBase,  setSaldosBase]  = useState([])
  const [cargando,    setCargando]    = useState(true)
  const [error,       setError]       = useState('')

  const [filtroCuenta, setFiltroCuenta] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [horizonte,    setHorizonte]    = useState(90)

  useEffect(() => {
    supabase
      .from('cuentas')
      .select('id, nombre, tipo, activa')
      .eq('activa', true)
      .order('nombre')
      .then(({ data }) => setCuentas(data ?? []))
  }, [])

  const cargarSaldosBase = useCallback(async () => {
    const { data } = await supabase
      .from('saldos_iniciales')
      .select('id, cuenta_id, monto, fecha, created_at')
      .order('fecha',      { ascending: false })
      .order('created_at', { ascending: false })
    const mapa = {}
    ;(data ?? []).forEach(s => { if (!mapa[s.cuenta_id]) mapa[s.cuenta_id] = s })
    setSaldosBase(Object.values(mapa))
  }, [])

  useEffect(() => { cargarSaldosBase() }, [cargarSaldosBase])

  const cargarMovimientos = useCallback(async () => {
    setCargando(true)
    setError('')

    const { data: movData, error: movErr } = await supabase
      .from('movimientos')
      .select(`
        id, tipo, categoria, proveedor_cliente, numero_factura,
        monto_bruto, monto_neto, concepto,
        periodo, fecha_pago, estado, cuenta_id, created_at,
        obras   ( id, codigo, nombre ),
        rubros  ( id, nombre ),
        cuentas ( id, nombre )
      `)
      .order('fecha_pago', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    if (movErr) { setError('No se pudieron cargar los movimientos.'); setCargando(false); return }

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

    const enriquecidos = (movData ?? []).map(m => {
      const base = m.estado === 'ejecutado'
        ? Number(m.monto_neto ?? m.monto_bruto ?? 0)
        : Number(m.monto_bruto ?? 0)
      const notas         = notasPorMov[m.id] ?? []
      const totalDebitos  = notas.filter(n => n.tipo_nota === 'debito').reduce((s, n) => s + Number(n.monto), 0)
      const totalCreditos = notas.filter(n => n.tipo_nota === 'credito').reduce((s, n) => s + Number(n.monto), 0)
      const montoEfectivo = m.categoria === 'factura' ? base + totalDebitos - totalCreditos : base
      return { ...m, montoEfectivo }
    })

    setMovimientos(enriquecidos)
    setCargando(false)
  }, [])

  useEffect(() => { cargarMovimientos() }, [cargarMovimientos])

  const { movimientosConSaldo, saldoInicial } = useMemo(() => {
    const sumaSaldosBase = saldosBase.reduce((acc, s) => acc + Number(s.monto ?? 0), 0)
    let saldoActual = sumaSaldosBase
    const resultado = movimientos.map(m => {
      if (m.tipo === 'ingreso') saldoActual += m.montoEfectivo
      else                      saldoActual -= m.montoEfectivo
      return { ...m, saldoAcumulado: saldoActual }
    })
    return { movimientosConSaldo: resultado, saldoInicial: sumaSaldosBase }
  }, [movimientos, saldosBase])

  const cards = useMemo(() => {
    const hoy = hoyISO()
    const d30 = fechaFutura(30)
    const d60 = fechaFutura(60)
    const d90 = fechaFutura(90)

    const sumaSaldosBase = saldosBase.reduce((acc, s) => acc + Number(s.monto ?? 0), 0)

    // Saldo hoy = saldo inicial + todos los movimientos (ejecutados y proyectados)
    // con fecha_pago hasta hoy inclusive
    let saldoHoy = sumaSaldosBase
    movimientos.forEach(m => {
      const fecha = m.fecha_pago ?? m.periodo
      if (!fecha || fecha > hoy) return
      if (m.tipo === 'ingreso') saldoHoy += m.montoEfectivo
      else                      saldoHoy -= m.montoEfectivo
    })

    // Posición en fecha X = saldo acumulado del último movimiento
    // cuya fecha_pago <= fechaLimite, usando movimientosConSaldo
    // que ya tiene el saldo calculado fila por fila
    function posicionEn(fechaLimite) {
      let ultimo = sumaSaldosBase
      for (const m of movimientosConSaldo) {
        const fecha = m.fecha_pago ?? m.periodo
        if (!fecha || fecha > fechaLimite) break
        ultimo = m.saldoAcumulado
      }
      return ultimo
    }

    return { saldoHoy, pos30: posicionEn(d30), pos60: posicionEn(d60), pos90: posicionEn(d90) }
  }, [movimientos, movimientosConSaldo, saldosBase])

  const filasFiltradas = useMemo(() => {
    const fechaLimite = fechaFutura(horizonte)
    return movimientosConSaldo.filter(m => {
      const fecha = m.fecha_pago ?? m.periodo
      if (fecha && fecha > fechaLimite) return false
      if (filtroCuenta && m.cuenta_id !== filtroCuenta) return false
      if (filtroEstado && m.estado    !== filtroEstado) return false
      return true
    })
  }, [movimientosConSaldo, horizonte, filtroCuenta, filtroEstado])

  const totales = useMemo(() => {
    let ingresos = 0, egresos = 0
    filasFiltradas.forEach(m => {
      if (m.tipo === 'ingreso') ingresos += m.montoEfectivo
      else                      egresos  += m.montoEfectivo
    })
    return { ingresos, egresos, diferencia: ingresos - egresos }
  }, [filasFiltradas])

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar titulo="Cash Flow" accentColor="text-blue-400" />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">

        <div className="mb-8">
          <button onClick={() => navigate('/finanzas')}
            className="text-blue-600 text-sm hover:text-blue-800 transition-colors flex items-center gap-1.5 mb-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Panel de Finanzas
          </button>
          <h1 className="text-slate-900 text-2xl font-semibold tracking-tight">Cash Flow</h1>
          <p className="text-slate-500 text-sm mt-0.5">Posición financiera de la empresa — próximos {horizonte} días</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-lg px-4 py-3 mb-6 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <SaldosIniciales cuentas={cuentas} userId={user.id} onActualizado={cargarSaldosBase} />

        {/* Cards: Saldo hoy + Posición a 30/60/90 días */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <CardResumen
            label="Saldo disponible hoy"
            valor={fmtARS(cards.saldoHoy)}
            subLabel="Todas las cuentas al día de hoy"
            colorValor={`text-2xl font-bold ${cards.saldoHoy >= 0 ? 'text-slate-900' : 'text-red-600'}`}
          />
          <CardResumen
            label="Posición a 30 días"
            valor={fmtARS(cards.pos30)}
            subLabel={`Al ${fmtFecha(fechaFutura(30))}`}
            colorValor={`text-xl font-bold ${cards.pos30 >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
          />
          <CardResumen
            label="Posición a 60 días"
            valor={fmtARS(cards.pos60)}
            subLabel={`Al ${fmtFecha(fechaFutura(60))}`}
            colorValor={`text-xl font-bold ${cards.pos60 >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
          />
          <CardResumen
            label="Posición a 90 días"
            valor={fmtARS(cards.pos90)}
            subLabel={`Al ${fmtFecha(fechaFutura(90))}`}
            colorValor={`text-xl font-bold ${cards.pos90 >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
          />
        </div>

        {/* Filtros */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Horizonte</label>
              <select value={horizonte} onChange={e => setHorizonte(Number(e.target.value))} className={selCls}>
                <option value={30}>Próximos 30 días</option>
                <option value={60}>Próximos 60 días</option>
                <option value={90}>Próximos 90 días</option>
                <option value={180}>Próximos 6 meses</option>
                <option value={365}>Próximo año</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Cuenta</label>
              <select value={filtroCuenta} onChange={e => setFiltroCuenta(e.target.value)} className={selCls}>
                <option value="">Todas las cuentas</option>
                {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Estado</label>
              <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className={selCls}>
                <option value="">Todos</option>
                <option value="proyectado">Solo proyectados</option>
                <option value="ejecutado">Solo ejecutados</option>
              </select>
            </div>
          </div>
        </div>

        {cargando ? (
          <div className="flex items-center justify-center py-24 gap-3 text-slate-500">
            <span className="w-5 h-5 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-sm">Calculando cash flow…</span>
          </div>
        ) : filasFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-slate-600 text-sm font-medium">Sin movimientos para los filtros seleccionados</p>
            <p className="text-slate-400 text-xs mt-1">Probá ampliando el horizonte o cambiando los filtros.</p>
          </div>
        ) : (
          <>
            <TablaCashFlow filas={filasFiltradas} saldoInicial={saldoInicial} />
            <div className="mt-3 bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-end gap-8 text-sm">
              <div className="text-right">
                <p className="text-xs text-slate-400 mb-0.5">Total ingresos</p>
                <p className="font-semibold text-emerald-600">{fmtARS(totales.ingresos)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400 mb-0.5">Total egresos</p>
                <p className="font-semibold text-red-600">{fmtARS(totales.egresos)}</p>
              </div>
              <div className="text-right border-l border-slate-200 pl-8">
                <p className="text-xs text-slate-400 mb-0.5">Diferencia</p>
                <p className={`font-bold text-base ${totales.diferencia >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {fmtARS(totales.diferencia)}
                </p>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function TablaCashFlow({ filas, saldoInicial }) {
  const filasRender = useMemo(() => {
    const resultado   = []
    let ultimoPeriodo = null
    filas.forEach((m, i) => {
      const periodoMov = m.fecha_pago ? periodoDeStr(m.fecha_pago) : m.periodo
      if (periodoMov !== ultimoPeriodo) {
        resultado.push({
          tipo:        'separador',
          key:         `sep-${periodoMov ?? i}`,
          label:       periodoMov ? labelPeriodo(periodoMov) : 'Sin fecha',
          saldoInicio: i === 0 ? saldoInicial : filas[i - 1].saldoAcumulado,
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
                return <FilaSeparador key={fila.key} label={fila.label} saldoInicio={fila.saldoInicio} />
              }
              const { mov: m } = fila
              const saldoNeg   = m.saldoAcumulado < 0
              return (
                <tr key={fila.key}
                  className={`border-b border-slate-100 last:border-0 transition-colors
                    ${saldoNeg ? 'bg-red-50' : 'hover:bg-slate-50/60'}`}>
                  <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">{fmtFecha(m.fecha_pago)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                      ${m.estado === 'ejecutado' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {m.estado === 'ejecutado' ? 'Ejecutado' : 'Proyectado'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                      ${BADGE_CAT[m.categoria] ?? 'bg-slate-100 text-slate-600'}`}>
                      {LABEL_CAT[m.categoria] ?? m.categoria}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 max-w-[180px]">
                    <span className="truncate block" title={m.proveedor_cliente ?? m.concepto ?? ''}>
                      {m.proveedor_cliente ?? m.concepto ?? '—'}
                    </span>
                    {m.numero_factura && <span className="text-xs text-slate-400 block">Nº {m.numero_factura}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{m.obras?.codigo ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    {m.tipo === 'ingreso'
                      ? <span className="text-emerald-600 font-medium">{fmtARS(m.montoEfectivo)}</span>
                      : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    {m.tipo === 'egreso'
                      ? <span className="text-red-600 font-medium">{fmtARS(m.montoEfectivo)}</span>
                      : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    <span className={`font-semibold text-sm ${saldoNeg ? 'text-red-700 font-bold' : 'text-slate-900'}`}>
                      {fmtARS(m.saldoAcumulado)}
                    </span>
                    {saldoNeg && <span className="block text-red-500 text-[10px] font-medium leading-tight">⚠ Saldo negativo</span>}
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

function FilaSeparador({ label, saldoInicio }) {
  return (
    <tr className="bg-slate-100 border-b border-slate-200">
      <td colSpan={5} className="px-4 py-2">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</span>
      </td>
      <td colSpan={2} className="px-4 py-2 text-right">
        <span className="text-xs text-slate-500">Saldo al inicio del mes</span>
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        <span className={`text-xs font-semibold ${saldoInicio < 0 ? 'text-red-600' : 'text-slate-700'}`}>
          {fmtARS(saldoInicio)}
        </span>
      </td>
    </tr>
  )
}

function CardResumen({ label, valor, subLabel, colorValor }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <p className={colorValor}>{valor}</p>
      {subLabel && <p className="text-xs text-slate-400 mt-1">{subLabel}</p>}
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