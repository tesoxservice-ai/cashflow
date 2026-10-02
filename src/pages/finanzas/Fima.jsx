// pages/finanzas/Fima.jsx
// Módulo FIMA / fondos de inversión. Ruta: /finanzas/fima
//
// Lleva el saldo de cada fondo de inversión (FIMA Premium hoy; el diseño ya
// soporta más fondos, cada uno con su saldo y movimientos) por separado del
// saldo bancario. La plata nunca se duplica: cada movimiento categoria='fima'
// ya impacta el banco (Galicia) como ingreso/egreso normal -- acá simplemente
// se espeja ese mismo movimiento contra un saldo propio del fondo, que
// arranca de un "saldo inicial" (tabla fima_saldo_inicial) y se va ajustando
// con los rendimientos que carga Finanzas (tabla fima_rendimientos).
//
// Suscripción (inversión) = banco -$ / fondo +$ (tipo 'egreso' en movimientos)
// Rescate                 = banco +$ / fondo -$ (tipo 'ingreso' en movimientos)
//
// Los movimientos se cargan desde Cash Flow → Nuevo movimiento.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { construirLedgerFima, saldoFimaEn, normalizarFondos, perteneceAlFondo, saldoInicialDe } from '../../lib/fimaLedger'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtARS = n => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 2,
}).format(n ?? 0)

function fmtFecha(str) {
  if (!str) return '—'
  return new Date(str + 'T00:00:00').toLocaleDateString('es-AR')
}

function hoyISO() {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`
}

function inicioMesDe(fechaStr) {
  return fechaStr.slice(0, 7) + '-01'
}

function sumarMeses(periodoISO, n) {
  const [y, m] = periodoISO.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function labelPeriodo(periodoISO) {
  const d = new Date(periodoISO + 'T00:00:00')
  const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const COLOR_POS = '#059669'
const COLOR_NEG = '#dc2626'
const COLOR_FIMA = '#7c3aed' // violeta — para diferenciar del banco (cyan)

// ─── Íconos ───────────────────────────────────────────────────────────────────

const IconBack = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
  </svg>
)

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
            <span className={`transition-transform duration-200 ${menuAbierto ? 'rotate-180' : ''}`}><IconChevronDown /></span>
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

export default function Fima() {
  const navigate = useNavigate()
  const { user, perfil } = useAuth()

  const [fondos,           setFondos]           = useState([])
  const [fondoSel,         setFondoSel]         = useState(null) // id del fondo elegido (null = el primero)
  const [movimientosTodos, setMovimientosTodos] = useState([])
  const [saldosIniciales,  setSaldosIniciales]  = useState([])
  const [rendimientos,     setRendimientos]     = useState([])
  const [cargando,         setCargando]         = useState(true)
  const [error,            setError]            = useState('')
  const [modalRend,        setModalRend]        = useState(false)
  const [borrandoRend,     setBorrandoRend]     = useState(null)

  const cargarTodo = useCallback(async () => {
    setCargando(true)
    setError('')

    // select('*'): las tablas/columnas de fondos (fondos_inversion, fondo_id) son
    // nuevas -- si todavía no existen en la base, no se corta la pantalla por eso.
    const [
      { data: dataFondos, error: e1 },
      { data: dataMovs, error: e2 },
      { data: dataSaldos, error: e3 },
      { data: dataRend, error: e4 },
    ] = await Promise.all([
      supabase.from('fondos_inversion').select('*').order('created_at', { ascending: true }),
      supabase.from('movimientos').select('*')
        .eq('categoria', 'fima')
        .order('fecha_pago', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }),
      supabase.from('fima_saldo_inicial').select('*')
        .order('fecha', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('fima_rendimientos').select('*')
        .order('fecha', { ascending: true }).order('created_at', { ascending: true }),
    ])

    if (e2) { setError('No se pudieron cargar los datos.'); setCargando(false); return }
    setFondos(e1 ? [] : (dataFondos ?? []))
    setSaldosIniciales(e3 ? [] : (dataSaldos ?? []))
    setRendimientos(e4 ? [] : (dataRend ?? []))
    setMovimientosTodos(dataMovs ?? [])
    setCargando(false)
  }, [])

  useEffect(() => { cargarTodo() }, [cargarTodo])

  const hoy = hoyISO()

  // ── Fondo elegido: cada fondo tiene su propio saldo inicial, rendimientos y
  // movimientos (ver src/lib/fimaLedger.js) ──
  const fondosLista = useMemo(() => normalizarFondos(fondos), [fondos])
  const fondoActivo = fondosLista.find(f => f.id === fondoSel) ?? fondosLista[0]

  const fimaSaldoInicial = useMemo(
    () => saldoInicialDe(saldosIniciales, fondoActivo, fondosLista),
    [saldosIniciales, fondoActivo, fondosLista]
  )
  const rendimientosFondo = useMemo(
    () => rendimientos.filter(r => perteneceAlFondo(r, fondoActivo, fondosLista)),
    [rendimientos, fondoActivo, fondosLista]
  )

  // ── Movimientos del fondo, ordenados cronológicamente ──
  const movimientosFima = useMemo(
    () => movimientosTodos
      .filter(m => perteneceAlFondo(m, fondoActivo, fondosLista))
      .map(m => ({
        ...m,
        montoEfectivo: m.estado === 'ejecutado' ? Number(m.monto_neto ?? m.monto_bruto ?? 0) : Number(m.monto_bruto ?? 0),
        subtipo: m.tipo === 'ingreso' ? 'rescate' : 'suscripcion',
      })),
    [movimientosTodos, fondoActivo, fondosLista]
  )

  const saldoInicialMonto = Number(fimaSaldoInicial?.monto ?? 0)
  const saldoInicialFecha = fimaSaldoInicial?.fecha ?? null

  // ── Libro del fondo: movimientos FIMA + rendimientos, con el saldo del fondo
  // después de cada uno. Ver src/lib/fimaLedger.js (mismo cálculo que Directorio).
  const ledgerFima = useMemo(
    () => construirLedgerFima({ movimientos: movimientosFima, rendimientos: rendimientosFondo, saldoInicialMonto, saldoInicialFecha }),
    [movimientosFima, rendimientosFondo, saldoInicialMonto, saldoInicialFecha]
  )

  // ── Saldo FIMA a hoy ──
  const saldoFimaHoy = useMemo(
    () => saldoFimaEn(ledgerFima, saldoInicialMonto, hoy),
    [ledgerFima, saldoInicialMonto, hoy]
  )

  // ── Totales históricos vs. proyectados ──
  const totales = useMemo(() => {
    let invertidoHist = 0, rescatadoHist = 0
    const inversionesProy = [], rescatesProy = []
    movimientosFima.forEach(m => {
      if (m.estado_proyeccion === 'no_cumple') return
      const esFuturo = m.fecha_pago && m.fecha_pago > hoy
      if (m.tipo === 'egreso') {
        if (esFuturo) inversionesProy.push(m); else invertidoHist += m.montoEfectivo
      } else {
        if (esFuturo) rescatesProy.push(m); else rescatadoHist += m.montoEfectivo
      }
    })
    const sumaInversionesProy = inversionesProy.reduce((s, m) => s + m.montoEfectivo, 0)
    const sumaRescatesProy = rescatesProy.reduce((s, m) => s + m.montoEfectivo, 0)
    const rendimientoAcum = rendimientosFondo.filter(r => r.fecha <= hoy).reduce((s, r) => s + Number(r.monto), 0)
    return { invertidoHist, rescatadoHist, inversionesProy, rescatesProy, sumaInversionesProy, sumaRescatesProy, rendimientoAcum }
  }, [movimientosFima, rendimientosFondo, hoy])

  // ── Evolución mensual del saldo FIMA (histórico + 12 meses proyectados) ──
  const evolucionMensual = useMemo(() => {
    // Arranca en lo que sea más viejo: la fecha de corte del saldo inicial o
    // el primer ítem del libro (pueden no coincidir -- ver fimaLedger).
    const fechasPiso = [saldoInicialFecha, ledgerFima[0]?.fecha_pago].filter(Boolean)
    const inicioSerie = fechasPiso.length
      ? inicioMesDe(fechasPiso.reduce((a, b) => (a < b ? a : b)))
      : inicioMesDe(hoy)

    let finSerie = sumarMeses(inicioMesDe(hoy), 12)
    const ultimaFecha = [...ledgerFima].reverse().find(m => m.fecha_pago)?.fecha_pago
    if (ultimaFecha && inicioMesDe(ultimaFecha) > finSerie) finSerie = inicioMesDe(ultimaFecha)

    const periodos = []
    for (let p = inicioSerie; p <= finSerie; p = sumarMeses(p, 1)) periodos.push(p)

    let saldoCorriendo = saldoInicialMonto
    let idx = 0
    return periodos.map(periodo => {
      const finMes = sumarMeses(periodo, 1) // primer día del mes siguiente, exclusivo
      let invertido = 0, rescatado = 0, rendimiento = 0
      while (idx < ledgerFima.length && ledgerFima[idx].fecha_pago < finMes) {
        const m = ledgerFima[idx]
        if (m.estado_proyeccion !== 'no_cumple') {
          if (m.tipo === 'egreso') invertido += m.montoEfectivo
          else if (m.tipo === 'ingreso') rescatado += m.montoEfectivo
          else if (m.tipo === 'rendimiento') rendimiento += m.montoEfectivo
        }
        saldoCorriendo = m.saldoFima
        idx++
      }
      return { periodo, invertido, rescatado, rendimiento, saldoFin: saldoCorriendo, esFuturo: periodo > inicioMesDe(hoy) }
    })
  }, [ledgerFima, saldoInicialFecha, saldoInicialMonto, hoy])

  const puntosGrafico = useMemo(
    () => evolucionMensual.map(e => ({ fecha: sumarMeses(e.periodo, 1), saldo: e.saldoFin })),
    [evolucionMensual]
  )

  async function handleBorrarRendimiento(id) {
    if (!window.confirm('¿Borrar este rendimiento? El saldo FIMA vuelve a ser el de antes de cargarlo.')) return
    setBorrandoRend(id)
    const { error: err } = await supabase.from('fima_rendimientos').delete().eq('id', id)
    setBorrandoRend(null)
    if (err) { setError('No se pudo borrar el rendimiento.'); return }
    await cargarTodo()
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f0f7fa' }}>
      <TopNav perfil={perfil} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">

        {/* Encabezado */}
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <button onClick={() => navigate('/finanzas')}
              className="text-sm font-medium flex items-center gap-1.5 mb-2 transition-colors"
              style={{ color: '#0e7490' }}
              onMouseEnter={e => e.currentTarget.style.color = '#164e63'}
              onMouseLeave={e => e.currentTarget.style.color = '#0e7490'}>
              <IconBack />
              Panel de Finanzas
            </button>
            <h1 className="text-slate-900 text-2xl font-extrabold tracking-tight">FIMA</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Saldo de cada fondo de inversión, separado del saldo bancario. Los movimientos se cargan desde Cash Flow → Nuevo movimiento.
            </p>
          </div>
          <button onClick={() => setModalRend(true)}
            className="text-sm font-semibold px-4 py-2.5 rounded-xl border transition-colors"
            style={{ borderColor: '#fcd34d', color: '#b45309', backgroundColor: '#fffbeb' }}>
            Actualizar saldo
          </button>
        </div>

        {/* Fondos: uno por solapa. Con un solo fondo queda su nombre bien visible. */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {fondosLista.map(f => {
            const activo = f.id === fondoActivo.id
            return (
              <button key={f.id ?? 'por-defecto'} onClick={() => setFondoSel(f.id)}
                disabled={fondosLista.length === 1}
                className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors disabled:cursor-default
                  ${activo ? 'text-white border-transparent' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                style={activo ? { backgroundColor: '#7c3aed' } : {}}>
                {f.nombre}
              </button>
            )
          })}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3 mb-6">
            {error}
          </div>
        )}

        {!fimaSaldoInicial && !cargando && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800
                          text-sm rounded-xl px-4 py-3 mb-6">
            <svg className="w-5 h-5 mt-0.5 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="font-medium">{fondoActivo.nombre} todavía no tiene saldo inicial cargado.</p>
              <p className="text-xs mt-1 text-amber-700">
                El saldo de acá abajo arranca en $0 y solo refleja los movimientos y rendimientos registrados,
                sin el punto de partida real del fondo.
              </p>
            </div>
          </div>
        )}

        {cargando ? (
          <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
            <span className="w-5 h-5 border-2 border-slate-200 border-t-violet-600 rounded-full animate-spin" />
            <span className="text-sm">Calculando FIMA…</span>
          </div>
        ) : (
          <>
            {/* Card: saldo del fondo. El saldo bancario se mira en el Cash Flow
                (acá no se duplica ese cálculo para que no haya dos
                números distintos del mismo dato). */}
            <div className="bg-white border border-violet-100 rounded-2xl p-5 shadow-sm mb-6 max-w-sm">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#7c3aed' }}>Saldo {fondoActivo.nombre}</p>
              <p className="text-slate-900 text-2xl font-extrabold tabular-nums mt-1.5">{fmtARS(saldoFimaHoy)}</p>
              <p className="text-slate-400 text-xs mt-1">Plata invertida en el fondo hoy — no es dinero disponible en el banco</p>
            </div>

            {/* Cards: totales */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <CardMini label="Total invertido" sub="histórico" valor={fmtARS(totales.invertidoHist)} color="#7c3aed" />
              <CardMini label="Total rescatado" sub="histórico" valor={fmtARS(totales.rescatadoHist)} color="#0e7490" />
              <CardMini label="Rendimientos acumulados" sub="cargados hasta hoy" valor={fmtARS(totales.rendimientoAcum)} color={totales.rendimientoAcum >= 0 ? '#b45309' : '#dc2626'} />
              <CardMini label="Inversiones proyectadas" sub={`${totales.inversionesProy.length} movimiento(s) a futuro`} valor={fmtARS(totales.sumaInversionesProy)} color="#7c3aed" />
              <CardMini label="Rescates proyectados" sub={`${totales.rescatesProy.length} movimiento(s) a futuro`} valor={fmtARS(totales.sumaRescatesProy)} color="#0e7490" />
            </div>

            {/* Gráfico de evolución */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 mb-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-slate-800 font-bold text-sm">Evolución del saldo — {fondoActivo.nombre}</h2>
                  <p className="text-slate-400 text-xs mt-0.5">Fin de cada mes — histórico y proyectado a 12 meses</p>
                </div>
              </div>
              <GraficoSaldo puntos={puntosGrafico} />
            </div>

            {/* Tabla evolución mensual */}
            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm mb-6">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-slate-800 font-bold text-sm">Saldo proyectado mes a mes</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/80">
                      <Th>Período</Th>
                      <Th align="right">Inversiones del mes</Th>
                      <Th align="right">Rescates del mes</Th>
                      <Th align="right">Rendimientos del mes</Th>
                      <Th align="right">Saldo FIMA al cierre</Th>
                      <Th align="center">Estado</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {evolucionMensual.map(e => (
                      <tr key={e.periodo} className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 text-slate-700 font-semibold">{labelPeriodo(e.periodo)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-violet-600">{e.invertido > 0 ? fmtARS(e.invertido) : '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-cyan-700">{e.rescatado > 0 ? fmtARS(e.rescatado) : '—'}</td>
                        <td className={`px-4 py-3 text-right tabular-nums ${e.rendimiento < 0 ? 'text-red-600' : 'text-amber-700'}`}>{e.rendimiento !== 0 ? fmtARS(e.rendimiento) : '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-900">{fmtARS(e.saldoFin)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full
                            ${e.esFuturo ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                            {e.esFuturo ? 'Proyectado' : 'Real'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Detalle de movimientos */}
            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-slate-800 font-bold text-sm">Detalle de movimientos — {fondoActivo.nombre}</h2>
                <p className="text-slate-400 text-xs mt-0.5">
                  {fimaSaldoInicial
                    ? `Saldo inicial: ${fmtARS(saldoInicialMonto)} al ${fmtFecha(saldoInicialFecha)}`
                    : 'Sin saldo inicial cargado — el saldo acumulado de abajo arranca en $0'}
                </p>
              </div>
              {ledgerFima.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <p className="text-slate-600 font-bold text-sm">Sin movimientos todavía</p>
                  <p className="text-slate-400 text-xs mt-1">Los movimientos del fondo se cargan desde Cash Flow → Nuevo movimiento.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50/80">
                        <Th>Fecha</Th>
                        <Th>Operación</Th>
                        <Th>Estado</Th>
                        <Th>Detalle</Th>
                        <Th align="right">Monto</Th>
                        <Th align="right">Saldo FIMA</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerFima.map(m => (
                        <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmtFecha(m.fecha_pago)}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full
                              ${m.subtipo === 'suscripcion' ? 'bg-violet-50 text-violet-700 border border-violet-100'
                                : m.subtipo === 'rendimiento' ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                : 'bg-cyan-50 text-cyan-700 border border-cyan-100'}`}>
                              {m.subtipo === 'suscripcion' ? 'Suscripción (inversión)' : m.subtipo === 'rendimiento' ? 'Rendimiento' : 'Rescate'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                              ${m.estado === 'ejecutado' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-500'}`}>
                              {m.estado === 'ejecutado' ? 'Ejecutado' : 'Proyectado'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">
                            {m.subtipo === 'rendimiento'
                              ? (m.proveedor_cliente ?? 'Ajuste por rendimiento')
                              : (m.proveedor_cliente ?? m.concepto ?? '—')}
                            {m.subtipo === 'rendimiento' && (
                              <button onClick={() => handleBorrarRendimiento(m._rendimientoId)}
                                disabled={borrandoRend === m._rendimientoId}
                                className="ml-2 text-red-500 hover:text-red-700 font-semibold disabled:opacity-50">
                                {borrandoRend === m._rendimientoId ? 'Borrando…' : 'Borrar'}
                              </button>
                            )}
                          </td>
                          <td className={`px-4 py-3 text-right tabular-nums font-semibold
                            ${m.subtipo === 'suscripcion' ? 'text-violet-600'
                              : m.subtipo === 'rendimiento' ? (m.montoEfectivo < 0 ? 'text-red-600' : 'text-amber-700')
                              : 'text-cyan-700'}`}>
                            {m.subtipo === 'rendimiento'
                              ? (m.montoEfectivo < 0 ? '−' : '+')
                              : (m.subtipo === 'suscripcion' ? '+' : '−')}{fmtARS(Math.abs(m.montoEfectivo))}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-900">{fmtARS(m.saldoFima)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {modalRend && (
        <ModalRendimiento
          fondo={fondoActivo}
          saldoEsperadoEn={fecha => saldoFimaEn(ledgerFima, saldoInicialMonto, fecha)}
          hayIniciales={!!fimaSaldoInicial}
          userId={user.id}
          onCerrar={() => setModalRend(false)}
          onGuardado={async () => { setModalRend(false); await cargarTodo() }}
        />
      )}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function CardMini({ label, sub, valor, color }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="text-lg font-extrabold tabular-nums mt-1" style={{ color }}>{valor}</p>
      <p className="text-slate-300 text-[11px] mt-0.5">{sub}</p>
    </div>
  )
}

function Th({ children, align = 'left' }) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide
                    ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}>
      {children}
    </th>
  )
}

// ─── Modal actualizar saldo del fondo ──────────────────────────────────────────
// Finanzas ingresa el saldo real que muestra Galicia; la diferencia con lo que
// calcula el sistema se registra como rendimiento. El rendimiento sube (o baja)
// el saldo del fondo sin mover plata en el banco.

function ModalRendimiento({ fondo, hayIniciales, saldoEsperadoEn, userId, onCerrar, onGuardado }) {
  const [valor,     setValor]     = useState('')
  const [fecha,     setFecha]     = useState(hoyISO())
  const [nota,      setNota]      = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error,     setError]     = useState('')

  const esperado = saldoEsperadoEn(fecha)
  const numero = valor === '' ? null : Number(valor)
  const valido = numero !== null && !isNaN(numero)
  const rendimiento = valido ? Math.round((numero - esperado) * 100) / 100 : null

  async function handleGuardar(e) {
    e.preventDefault(); setError('')
    if (!fecha) { setError('Ingresá la fecha.'); return }
    if (!valido) { setError('Ingresá el saldo real del fondo.'); return }
    if (rendimiento === 0) { setError('No hay diferencia: el saldo que ingresaste ya coincide con el del sistema.'); return }
    setGuardando(true)
    const fila = { fecha, monto: rendimiento, nota: nota.trim() || null, created_by: userId }
    if (fondo.id) fila.fondo_id = fondo.id
    const { error: err } = await supabase.from('fima_rendimientos').insert(fila)
    setGuardando(false)
    if (err) { setError('No se pudo guardar. Revisá que la tabla fima_rendimientos ya exista en Supabase.'); return }
    onGuardado()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-slate-900 font-extrabold text-base">Actualizar saldo — {fondo.nombre}</h3>
            <p className="text-slate-400 text-sm mt-0.5">
              Ingresá el saldo real que muestra Galicia. La diferencia se registra como rendimiento y no mueve plata en el banco.
            </p>
          </div>
          <button onClick={onCerrar} className="text-slate-300 hover:text-slate-500 transition-colors mt-0.5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!hayIniciales && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            Este fondo todavía no tiene saldo inicial: el saldo que calcula el sistema arranca en $0.
          </p>
        )}

        <form onSubmit={handleGuardar} noValidate className="space-y-4">
          <div>
            <label className={lbCls}>Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inCls} />
          </div>
          <div>
            <label className={lbCls}>Saldo real del fondo (según Galicia)</label>
            <input type="number" step="0.01" placeholder="0,00" value={valor}
              onChange={e => setValor(e.target.value)} className={inCls} autoFocus />
            <p className="text-slate-400 text-[11px] mt-1">El sistema calcula al {fmtFecha(fecha)}: {fmtARS(esperado)}</p>
          </div>
          <div>
            <label className={lbCls}>Nota <span className="font-normal text-slate-300">(opcional)</span></label>
            <input type="text" placeholder="Ej: rendimiento al 02/10" value={nota}
              onChange={e => setNota(e.target.value)} className={inCls} />
          </div>

          {rendimiento !== null && (
            <div className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${rendimiento === 0 ? 'bg-slate-50 text-slate-500' : rendimiento > 0 ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700'}`}>
              Rendimiento a registrar: {rendimiento > 0 ? '+' : rendimiento < 0 ? '−' : ''}{fmtARS(Math.abs(rendimiento))}
              <span className="block text-[11px] font-normal mt-0.5">
                Saldo al {fmtFecha(fecha)} quedaría en {fmtARS(esperado + rendimiento)}
              </span>
            </div>
          )}

          {error && <p className="text-red-600 text-xs">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={guardando}
              className="flex-1 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2 shadow-sm"
              style={{ backgroundColor: '#b45309' }}>
              {guardando && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" onClick={onCerrar} disabled={guardando}
              className="flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-sm font-semibold py-2.5 rounded-xl transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const lbCls = 'block text-xs font-semibold text-slate-500 mb-1.5'
const inCls = `w-full px-3 py-2 text-sm rounded-xl border border-slate-200
  text-slate-900 placeholder:text-slate-300 bg-white
  focus:outline-none focus:ring-2 focus:border-transparent`

// ─── Gráfico de evolución (línea, SVG inline — mismo patrón que Directorio) ────

function GraficoSaldo({ puntos }) {
  const [hoverIdx, setHoverIdx] = useState(null)

  if (!puntos || puntos.length < 2) {
    return <div className="flex items-center justify-center h-48 text-slate-400 text-sm">No hay datos suficientes para graficar.</div>
  }

  const W = 760, H = 220
  const padL = 8, padR = 8, padT = 16, padB = 24

  const fechasMs = puntos.map(p => new Date(p.fecha + 'T00:00:00').getTime())
  const t0 = fechasMs[0], t1 = fechasMs[fechasMs.length - 1]
  const spanMs = Math.max(t1 - t0, 1)

  const valores = puntos.map(p => p.saldo)
  const vMin = Math.min(0, ...valores)
  const vMax = Math.max(0, ...valores)
  const spanV = Math.max(vMax - vMin, 1)

  const xOf = ms => padL + ((ms - t0) / spanMs) * (W - padL - padR)
  const yOf = v  => padT + (1 - (v - vMin) / spanV) * (H - padT - padB)

  const coords = puntos.map((p, i) => ({ x: xOf(fechasMs[i]), y: yOf(p.saldo), ...p }))
  const yZero = yOf(0)

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ')
  const areaPath = `M ${coords[0].x.toFixed(1)} ${yZero.toFixed(1)} ` +
    coords.map(c => `L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ') +
    ` L ${coords[coords.length - 1].x.toFixed(1)} ${yZero.toFixed(1)} Z`

  const hovered = hoverIdx !== null ? coords[hoverIdx] : null

  function handleMove(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * W
    let nearest = 0, mejorDist = Infinity
    coords.forEach((c, i) => {
      const dist = Math.abs(c.x - relX)
      if (dist < mejorDist) { mejorDist = dist; nearest = i }
    })
    setHoverIdx(nearest)
  }

  const uid = 'fima'

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-56" preserveAspectRatio="none"
        onMouseMove={handleMove} onMouseLeave={() => setHoverIdx(null)}>
        <defs>
          <clipPath id={`${uid}-arriba`}><rect x="0" y="0" width={W} height={yZero} /></clipPath>
          <clipPath id={`${uid}-abajo`}><rect x="0" y={yZero} width={W} height={H - yZero} /></clipPath>
        </defs>

        <line x1={padL} y1={yZero} x2={W - padR} y2={yZero} stroke="#e2e8f0" strokeWidth="1" />

        <path d={areaPath} fill={COLOR_FIMA} opacity="0.12" clipPath={`url(#${uid}-arriba)`} />
        <path d={areaPath} fill={COLOR_NEG} opacity="0.12" clipPath={`url(#${uid}-abajo)`} />

        <path d={linePath} fill="none" stroke={COLOR_FIMA} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${uid}-arriba)`} />
        <path d={linePath} fill="none" stroke={COLOR_NEG} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${uid}-abajo)`} />

        {(() => {
          const last = coords[coords.length - 1]
          const color = last.saldo >= 0 ? COLOR_FIMA : COLOR_NEG
          return <circle cx={last.x} cy={last.y} r="5" fill={color} stroke="#fcfcfb" strokeWidth="2" />
        })()}

        {hovered && (
          <g>
            <line x1={hovered.x} y1={padT} x2={hovered.x} y2={H - padB} stroke="#c3c2b7" strokeWidth="1" strokeDasharray="3,3" />
            <circle cx={hovered.x} cy={hovered.y} r="5" fill={hovered.saldo >= 0 ? COLOR_FIMA : COLOR_NEG} stroke="#fcfcfb" strokeWidth="2" />
          </g>
        )}
      </svg>

      {hovered && (
        <div className="absolute top-1 pointer-events-none bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap"
          style={{ left: `${Math.min(Math.max((hovered.x / W) * 100, 8), 92)}%`, transform: 'translateX(-50%)' }}>
          <div className="font-semibold">{fmtFecha(hovered.fecha)}</div>
          <div className={hovered.saldo >= 0 ? 'text-violet-300' : 'text-red-300'}>{fmtARS(hovered.saldo)}</div>
        </div>
      )}

      {!hovered && (
        <div className={`absolute top-1 right-1 text-xs font-semibold px-2 py-1 rounded-lg
          ${coords[coords.length - 1].saldo >= 0 ? 'text-violet-700 bg-violet-50' : 'text-red-700 bg-red-50'}`}>
          {fmtARS(coords[coords.length - 1].saldo)} al {fmtFecha(coords[coords.length - 1].fecha)}
        </div>
      )}
    </div>
  )
}
