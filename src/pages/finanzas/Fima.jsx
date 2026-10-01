// pages/finanzas/Fima.jsx
// Módulo FIMA — PROTOTIPO, todavía no enlazado a rutas ni pusheado.
// Ruta: /finanzas/fima
//
// Lleva el saldo del fondo de inversión FIMA (Galicia) por separado del
// saldo bancario. La plata nunca se duplica: cada movimiento categoria='fima'
// ya impacta el banco (Galicia) como ingreso/egreso normal -- acá simplemente
// se espeja ese mismo movimiento contra un saldo propio del fondo, que
// arranca de un "saldo inicial" cargado a mano (tabla fima_saldo_inicial,
// análoga a saldos_iniciales pero separada para no mezclarse con el banco).
//
// Suscripción (inversión) = banco -$ / FIMA +$ (tipo 'egreso' en movimientos)
// Rescate                 = banco +$ / FIMA -$ (tipo 'ingreso' en movimientos)

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import FormularioMovimiento from './components/FormularioMovimiento'

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

  const [cuentas,          setCuentas]          = useState([])
  const [movimientosTodos, setMovimientosTodos] = useState([])
  const [fimaSaldoInicial, setFimaSaldoInicial] = useState(null)
  const [cargando,         setCargando]         = useState(true)
  const [error,            setError]            = useState('')
  const [mostrarForm,      setMostrarForm]      = useState(false)
  const [modalSaldo,       setModalSaldo]       = useState(false)

  const cargarTodo = useCallback(async () => {
    setCargando(true)
    setError('')

    const [
      { data: dataCuentas, error: e1 },
      { data: dataMovs, error: e3 },
      { data: dataFima, error: e4 },
    ] = await Promise.all([
      supabase.from('cuentas').select('id, nombre, tipo, activa').eq('activa', true).order('nombre'),
      supabase.from('movimientos')
        .select('id, tipo, categoria, proveedor_cliente, concepto, monto_bruto, monto_neto, periodo, fecha_pago, estado, estado_proyeccion')
        .eq('categoria', 'fima')
        .order('fecha_pago', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }),
      supabase.from('fima_saldo_inicial').select('id, monto, fecha, created_at')
        .order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(1),
    ])

    if (e1 || e3) { setError('No se pudieron cargar los datos.'); setCargando(false); return }
    // fima_saldo_inicial puede no existir todavía (tabla nueva) -- no cortar la pantalla por eso.
    if (e4) { setFimaSaldoInicial(null) } else { setFimaSaldoInicial(dataFima?.[0] ?? null) }

    setCuentas(dataCuentas ?? [])
    setMovimientosTodos(dataMovs ?? [])
    setCargando(false)
  }, [])

  useEffect(() => { cargarTodo() }, [cargarTodo])

  const hoy = hoyISO()

  // ── Movimientos FIMA, ordenados cronológicamente ──
  const movimientosFima = useMemo(
    () => movimientosTodos
      .filter(m => m.categoria === 'fima')
      .map(m => ({
        ...m,
        montoEfectivo: m.estado === 'ejecutado' ? Number(m.monto_neto ?? m.monto_bruto ?? 0) : Number(m.monto_bruto ?? 0),
        subtipo: m.tipo === 'ingreso' ? 'rescate' : 'suscripcion',
      })),
    [movimientosTodos]
  )

  const saldoInicialMonto = Number(fimaSaldoInicial?.monto ?? 0)
  const saldoInicialFecha = fimaSaldoInicial?.fecha ?? null

  // ── Saldo FIMA acumulado, movimiento por movimiento ──
  // La fecha de corte del saldo inicial puede caer en cualquier punto de la
  // línea de tiempo (antes, en medio o después de movimientos ya cargados).
  // Los movimientos ANTERIORES a esa fecha ya están "adentro" del saldo
  // inicial -- no hay que volver a sumarlos, sino reconstruir su saldo hacia
  // atrás a partir del punto conocido. Los posteriores (o sin fecha de corte
  // cargada) se suman hacia adelante como siempre.
  const movimientosFimaConSaldo = useMemo(() => {
    const corte = saldoInicialFecha
    const antes   = corte ? movimientosFima.filter(m => m.fecha_pago < corte) : []
    const despues = corte ? movimientosFima.filter(m => m.fecha_pago >= corte) : movimientosFima

    // "No se cumple" queda visible (para no perder el registro) pero no
    // mueve el saldo del fondo -- mismo criterio que usa el Cash Flow
    // bancario para ese mismo flag.
    const delta = m => m.estado_proyeccion === 'no_cumple' ? 0 : (m.tipo === 'egreso' ? m.montoEfectivo : -m.montoEfectivo)

    let cursorAdelante = saldoInicialMonto
    const despuesConSaldo = despues.map(m => {
      cursorAdelante += delta(m)
      return { ...m, saldoFima: cursorAdelante }
    })

    let cursorAtras = saldoInicialMonto
    const antesConSaldo = [...antes].reverse().map(m => {
      const saldoLuegoDeEste = cursorAtras
      cursorAtras -= delta(m)
      return { ...m, saldoFima: saldoLuegoDeEste }
    }).reverse()

    return [...antesConSaldo, ...despuesConSaldo]
  }, [movimientosFima, saldoInicialMonto, saldoInicialFecha])

  // ── Saldo FIMA a hoy ──
  const saldoFimaHoy = useMemo(() => {
    let ultimo = saldoInicialMonto
    for (const m of movimientosFimaConSaldo) {
      if (!m.fecha_pago || m.fecha_pago > hoy) break
      ultimo = m.saldoFima
    }
    return ultimo
  }, [movimientosFimaConSaldo, saldoInicialMonto, hoy])

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
    return { invertidoHist, rescatadoHist, inversionesProy, rescatesProy, sumaInversionesProy, sumaRescatesProy }
  }, [movimientosFima, hoy])

  // ── Evolución mensual del saldo FIMA (histórico + 12 meses proyectados) ──
  const evolucionMensual = useMemo(() => {
    // Arranca en lo que sea más viejo: la fecha de corte del saldo inicial o
    // el primer movimiento cargado (pueden no coincidir -- ver movimientosFimaConSaldo).
    const fechasPiso = [saldoInicialFecha, movimientosFima[0]?.fecha_pago].filter(Boolean)
    const inicioSerie = fechasPiso.length
      ? inicioMesDe(fechasPiso.reduce((a, b) => (a < b ? a : b)))
      : inicioMesDe(hoy)

    let finSerie = sumarMeses(inicioMesDe(hoy), 12)
    const ultimaFutura = [...movimientosFima].reverse().find(m => m.fecha_pago)?.fecha_pago
    if (ultimaFutura && inicioMesDe(ultimaFutura) > finSerie) finSerie = inicioMesDe(ultimaFutura)

    const periodos = []
    for (let p = inicioSerie; p <= finSerie; p = sumarMeses(p, 1)) periodos.push(p)

    let saldoCorriendo = saldoInicialMonto
    let idxMov = 0
    return periodos.map(periodo => {
      const finMes = sumarMeses(periodo, 1) // primer día del mes siguiente, exclusivo
      let invertido = 0, rescatado = 0
      while (idxMov < movimientosFimaConSaldo.length && movimientosFimaConSaldo[idxMov].fecha_pago < finMes) {
        const m = movimientosFimaConSaldo[idxMov]
        if (m.tipo === 'egreso') invertido += m.montoEfectivo
        else rescatado += m.montoEfectivo
        saldoCorriendo = m.saldoFima
        idxMov++
      }
      return { periodo, invertido, rescatado, saldoFin: saldoCorriendo, esFuturo: periodo > inicioMesDe(hoy) }
    })
  }, [movimientosFima, movimientosFimaConSaldo, saldoInicialFecha, saldoInicialMonto, hoy])

  const puntosGrafico = useMemo(
    () => evolucionMensual.map(e => ({ fecha: sumarMeses(e.periodo, 1), saldo: e.saldoFin })),
    [evolucionMensual]
  )

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
              Saldo del fondo de inversión, separado del saldo bancario — PROTOTIPO en prueba, todavía no pusheado.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setModalSaldo(true)}
              className="text-sm font-semibold px-4 py-2.5 rounded-xl border transition-colors"
              style={{ borderColor: '#c4b5fd', color: '#7c3aed', backgroundColor: '#f5f3ff' }}>
              {fimaSaldoInicial ? 'Actualizar saldo inicial' : 'Cargar saldo inicial'}
            </button>
            <button onClick={() => setMostrarForm(v => !v)}
              className="inline-flex items-center gap-2 text-white text-sm font-semibold
                         px-4 py-2.5 rounded-xl transition-colors shadow-sm"
              style={{ backgroundColor: '#7c3aed' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#6d28d9'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#7c3aed'}>
              {mostrarForm ? 'Cancelar' : '+ Nuevo movimiento FIMA'}
            </button>
          </div>
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
              <p className="font-medium">Todavía no cargaste un saldo inicial del FIMA.</p>
              <p className="text-xs mt-1 text-amber-700">
                Hasta que lo cargues, el saldo de acá abajo solo refleja los movimientos FIMA registrados, sin el
                punto de partida real del fondo. Usá "Cargar saldo inicial" con el monto y la fecha de corte que
                tengas en el resumen de Galicia (antes del primer movimiento FIMA cargado).
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
            {/* Formulario nuevo movimiento FIMA */}
            {mostrarForm && (
              <div className="mb-6">
                <FormularioMovimiento
                  obras={[]} rubros={[]} cuentas={cuentas} debitos={[]}
                  userId={user.id}
                  categoriaInicial="fima"
                  onGuardado={async () => { setMostrarForm(false); await cargarTodo() }}
                  onCancelar={() => setMostrarForm(false)}
                />
              </div>
            )}

            {/* Card: saldo FIMA. El saldo bancario se mira en el Cash Flow
                (acá no se duplica ese cálculo para que no haya dos
                números distintos del mismo dato). */}
            <div className="bg-white border border-violet-100 rounded-2xl p-5 shadow-sm mb-6 max-w-sm">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#7c3aed' }}>Saldo FIMA</p>
              <p className="text-slate-900 text-2xl font-extrabold tabular-nums mt-1.5">{fmtARS(saldoFimaHoy)}</p>
              <p className="text-slate-400 text-xs mt-1">Plata invertida en el fondo hoy — no es dinero disponible en el banco</p>
            </div>

            {/* Cards: totales */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <CardMini label="Total invertido" sub="histórico" valor={fmtARS(totales.invertidoHist)} color="#7c3aed" />
              <CardMini label="Total rescatado" sub="histórico" valor={fmtARS(totales.rescatadoHist)} color="#0e7490" />
              <CardMini label="Inversiones proyectadas" sub={`${totales.inversionesProy.length} movimiento(s) a futuro`} valor={fmtARS(totales.sumaInversionesProy)} color="#7c3aed" />
              <CardMini label="Rescates proyectados" sub={`${totales.rescatesProy.length} movimiento(s) a futuro`} valor={fmtARS(totales.sumaRescatesProy)} color="#0e7490" />
            </div>

            {/* Gráfico de evolución */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 mb-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-slate-800 font-bold text-sm">Evolución del saldo FIMA</h2>
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
                <h2 className="text-slate-800 font-bold text-sm">Detalle de movimientos FIMA</h2>
                <p className="text-slate-400 text-xs mt-0.5">
                  {fimaSaldoInicial
                    ? `Saldo inicial: ${fmtARS(saldoInicialMonto)} al ${fmtFecha(saldoInicialFecha)}`
                    : 'Sin saldo inicial cargado — el saldo acumulado de abajo arranca en $0'}
                </p>
              </div>
              {movimientosFimaConSaldo.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <p className="text-slate-600 font-bold text-sm">Sin movimientos FIMA todavía</p>
                  <p className="text-slate-400 text-xs mt-1">Usá "+ Nuevo movimiento FIMA" para cargar el primero.</p>
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
                      {movimientosFimaConSaldo.map(m => (
                        <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmtFecha(m.fecha_pago)}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full
                              ${m.subtipo === 'suscripcion' ? 'bg-violet-50 text-violet-700 border border-violet-100' : 'bg-cyan-50 text-cyan-700 border border-cyan-100'}`}>
                              {m.subtipo === 'suscripcion' ? 'Suscripción (inversión)' : 'Rescate'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                              ${m.estado === 'ejecutado' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-500'}`}>
                              {m.estado === 'ejecutado' ? 'Ejecutado' : 'Proyectado'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{m.proveedor_cliente ?? m.concepto ?? '—'}</td>
                          <td className={`px-4 py-3 text-right tabular-nums font-semibold ${m.subtipo === 'suscripcion' ? 'text-violet-600' : 'text-cyan-700'}`}>
                            {m.subtipo === 'suscripcion' ? '+' : '−'}{fmtARS(m.montoEfectivo)}
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

      {modalSaldo && (
        <ModalSaldoFima
          saldoActual={fimaSaldoInicial}
          userId={user.id}
          onCerrar={() => setModalSaldo(false)}
          onGuardado={async () => { setModalSaldo(false); await cargarTodo() }}
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

// ─── Modal saldo inicial FIMA ──────────────────────────────────────────────────

function ModalSaldoFima({ saldoActual, userId, onCerrar, onGuardado }) {
  const [monto,     setMonto]     = useState(saldoActual ? String(saldoActual.monto) : '')
  const [fecha,     setFecha]     = useState(saldoActual?.fecha ?? new Date().toISOString().split('T')[0])
  const [guardando, setGuardando] = useState(false)
  const [error,     setError]     = useState('')

  async function handleGuardar(e) {
    e.preventDefault(); setError('')
    if (!monto || isNaN(Number(monto))) { setError('Ingresá un monto válido.'); return }
    if (!fecha) { setError('Ingresá una fecha de corte.'); return }
    setGuardando(true)
    const { error: err } = await supabase.from('fima_saldo_inicial').insert({
      monto: Number(monto), fecha, created_by: userId,
    })
    setGuardando(false)
    if (err) { setError('Error al guardar. Revisá que la tabla fima_saldo_inicial ya exista en Supabase.'); return }
    onGuardado()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-slate-900 font-extrabold text-base">
              {saldoActual ? 'Actualizar saldo inicial FIMA' : 'Cargar saldo inicial FIMA'}
            </h3>
            <p className="text-slate-400 text-sm mt-0.5">Punto de partida del fondo, desde el que se suman/restan los movimientos FIMA.</p>
          </div>
          <button onClick={onCerrar} className="text-slate-300 hover:text-slate-500 transition-colors mt-0.5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleGuardar} noValidate className="space-y-4">
          <div>
            <label className={lbCls}>
              Monto {saldoActual && <span className="text-slate-300 font-normal ml-1">(anterior: {fmtARS(saldoActual.monto)})</span>}
            </label>
            <input type="number" step="0.01" placeholder="0,00"
              value={monto} onChange={e => setMonto(e.target.value)} className={inCls} autoFocus />
          </div>
          <div>
            <label className={lbCls}>Fecha de corte</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inCls} />
            <p className="text-slate-400 text-[11px] mt-1">
              Lo ideal es que sea anterior al primer movimiento FIMA cargado, así no queda ningún movimiento sin cuenta.
            </p>
          </div>

          {error && <p className="text-red-600 text-xs">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={guardando}
              className="flex-1 text-white text-sm font-semibold py-2.5 rounded-xl
                         transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2 shadow-sm"
              style={{ backgroundColor: '#7c3aed' }}
              onMouseEnter={e => !guardando && (e.currentTarget.style.backgroundColor = '#6d28d9')}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#7c3aed'}>
              {guardando && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" onClick={onCerrar} disabled={guardando}
              className="flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-50
                         text-slate-700 text-sm font-semibold py-2.5 rounded-xl transition-colors">
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
