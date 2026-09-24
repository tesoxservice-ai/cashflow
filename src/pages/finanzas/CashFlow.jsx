// pages/finanzas/CashFlow.jsx
// Vista principal del Cash Flow Predictivo.
// Ruta: /finanzas/cashflow

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import SaldosIniciales from './components/SaldosIniciales'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  ingreso_cliente:   'bg-emerald-50 text-emerald-700',
  sueldo:            'bg-purple-50 text-purple-700',
  impuesto:          'bg-red-50 text-red-700',
  debito_automatico: 'bg-yellow-50 text-yellow-700',
  fima:              'bg-cyan-50 text-cyan-700',
  otro:              'bg-slate-100 text-slate-600',
}
const LABEL_CAT = {
  factura:           'Factura',
  ingreso_cliente:   'Ventas',
  sueldo:            'Sueldo',
  impuesto:          'Impuesto',
  debito_automatico: 'Débito aut.',
  fima:              'FIMA',
  otro:              'Otro',
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

  const iniciales = perfil
    ? `${perfil.nombre?.[0] ?? ''}${perfil.apellido?.[0] ?? ''}`
    : 'U'

  const handleCerrarSesion = async () => {
    setMenuAbierto(false)
    await logout()
  }

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
          <button
            onClick={() => setMenuAbierto(v => !v)}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: '#0e7490' }}>
              {iniciales}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-slate-800 text-sm font-semibold leading-none">
                {perfil ? `${perfil.nombre} ${perfil.apellido}` : 'Usuario'}
              </p>
              <p className="text-slate-400 text-xs mt-0.5 leading-none capitalize">
                {perfil?.rol ?? 'Finanzas'}
              </p>
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
                <button onClick={handleCerrarSesion}
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

export default function CashFlow() {
  const navigate = useNavigate()
  const { user, perfil } = useAuth()

  const [cuentas,     setCuentas]     = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [saldosBase,  setSaldosBase]  = useState([])
  const [cargando,    setCargando]    = useState(true)
  const [error,       setError]       = useState('')

  const [filtroCuenta, setFiltroCuenta] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [horizonte,    setHorizonte]    = useState(90)
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('')
  const [filtroCategoria,  setFiltroCategoria]  = useState('')
  const [filtroBusqueda,   setFiltroBusqueda]   = useState('')

  const [filaEditando,   setFilaEditando]   = useState(null)
  const [valoresEdicion, setValoresEdicion] = useState({})
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [errorEdicion,     setErrorEdicion]     = useState('')

  const [filaAjustando,   setFilaAjustando]   = useState(null)
  const [valorAjuste,     setValorAjuste]     = useState('')
  const [guardandoAjuste, setGuardandoAjuste] = useState(false)
  const [errorAjuste,     setErrorAjuste]     = useState('')

  const [filaProyeccion,     setFilaProyeccion]     = useState(null)
  const [nuevaFechaProyeccion, setNuevaFechaProyeccion] = useState('')
  const [guardandoProyeccion, setGuardandoProyeccion] = useState(false)
  const [errorProyeccion,     setErrorProyeccion]     = useState('')

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
    setCargando(true); setError('')
    const { data: movData, error: movErr } = await supabase
      .from('movimientos')
      .select(`
        id, tipo, categoria, proveedor_cliente, numero_factura,
        monto_bruto, monto_neto, concepto,
        periodo, fecha_pago, estado, cuenta_id, created_at,
        estado_proyeccion, fecha_pago_original,
        obras   ( id, codigo, nombre ),
        rubros  ( id, nombre ),
        cuentas ( id, nombre )
      `)
      .order('fecha_pago', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .order('id',         { ascending: true })

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
      const base          = m.estado === 'ejecutado'
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
      // "No se cumple": el movimiento queda registrado pero no suma/resta
      // en el saldo acumulado (no se borra ni se pierde el dato).
      if (m.estado_proyeccion !== 'no_cumple') {
        if (m.tipo === 'ingreso') saldoActual += m.montoEfectivo
        else                      saldoActual -= m.montoEfectivo
      }
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

    let saldoHoy = sumaSaldosBase
    movimientos.forEach(m => {
      const fecha = m.fecha_pago ?? m.periodo
      if (!fecha || fecha > hoy) return
      if (m.estado_proyeccion === 'no_cumple') return
      if (m.tipo === 'ingreso') saldoHoy += m.montoEfectivo
      else                      saldoHoy -= m.montoEfectivo
    })

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
    const busqueda = filtroBusqueda.trim().toLowerCase()
    return movimientosConSaldo.filter(m => {
      const fecha = m.fecha_pago ?? m.periodo
      if (fecha && fecha > fechaLimite) return false
      if (filtroFechaDesde && fecha && fecha < filtroFechaDesde) return false
      if (filtroCuenta   && m.cuenta_id !== filtroCuenta) return false
      if (filtroEstado   && m.estado    !== filtroEstado) return false
      if (filtroCategoria && m.categoria !== filtroCategoria) return false
      if (busqueda) {
        const texto = [m.proveedor_cliente, m.numero_factura, m.concepto, m.obras?.codigo, m.obras?.nombre]
          .filter(Boolean).join(' ').toLowerCase()
        if (!texto.includes(busqueda)) return false
      }
      return true
    })
  }, [movimientosConSaldo, horizonte, filtroCuenta, filtroEstado, filtroFechaDesde, filtroCategoria, filtroBusqueda])

  const puntosExtremos = useMemo(() => {
    if (filasFiltradas.length === 0) return null
    let max = filasFiltradas[0], min = filasFiltradas[0]
    for (const m of filasFiltradas) {
      if (m.saldoAcumulado > max.saldoAcumulado) max = m
      if (m.saldoAcumulado < min.saldoAcumulado) min = m
    }
    return { max, min }
  }, [filasFiltradas])

  const totales = useMemo(() => {
    let ingresos = 0, egresos = 0
    filasFiltradas.forEach(m => {
      if (m.tipo === 'ingreso') ingresos += m.montoEfectivo
      else                      egresos  += m.montoEfectivo
    })
    return { ingresos, egresos, diferencia: ingresos - egresos }
  }, [filasFiltradas])

  function handleIniciarEdicion(m) {
    setFilaEditando(m.id)
    setErrorEdicion('')
    setValoresEdicion({
      fecha_pago: m.fecha_pago ?? '',
      monto_bruto: String(m.monto_bruto ?? ''),
      estado: m.estado,
    })
  }

  function handleCancelarEdicion() {
    setFilaEditando(null)
    setValoresEdicion({})
    setErrorEdicion('')
  }

  async function handleBorrarEdicion(id) {
    if (!window.confirm('¿Seguro que querés borrar este movimiento? No se puede deshacer.')) return
    setGuardandoEdicion(true)
    const { error: delError } = await supabase.from('movimientos').delete().eq('id', id)
    setGuardandoEdicion(false)
    if (delError) { setErrorEdicion('No se pudo borrar el movimiento.'); return }
    setFilaEditando(null)
    setValoresEdicion({})
    await cargarMovimientos()
  }

  async function handleGuardarEdicion(id) {
    setErrorEdicion('')
    if (!valoresEdicion.fecha_pago) { setErrorEdicion('Elegí una fecha.'); return }
    const monto = Number(valoresEdicion.monto_bruto)
    if (!valoresEdicion.monto_bruto || isNaN(monto) || monto <= 0) {
      setErrorEdicion('El monto tiene que ser un número mayor a 0.'); return
    }

    setGuardandoEdicion(true)
    const { error: updError } = await supabase
      .from('movimientos')
      .update({
        fecha_pago: valoresEdicion.fecha_pago,
        monto_bruto: monto,
        estado: valoresEdicion.estado,
        monto_neto: valoresEdicion.estado === 'ejecutado' ? monto : null,
      })
      .eq('id', id)
    setGuardandoEdicion(false)

    if (updError) { setErrorEdicion('No se pudo guardar el cambio.'); return }

    setFilaEditando(null)
    setValoresEdicion({})
    await cargarMovimientos()
  }

  function handleIniciarAjuste(m) {
    setFilaAjustando(m.id)
    setErrorAjuste('')
    setValorAjuste(String(m.saldoAcumulado.toFixed(2)))
  }

  function handleCancelarAjuste() {
    setFilaAjustando(null)
    setValorAjuste('')
    setErrorAjuste('')
  }

  async function handleGuardarAjuste(m) {
    setErrorAjuste('')
    const deseado = Number(valorAjuste)
    if (valorAjuste === '' || isNaN(deseado)) { setErrorAjuste('Ingresá un monto válido.'); return }

    const delta = deseado - m.saldoAcumulado
    if (Math.abs(delta) < 0.01) { handleCancelarAjuste(); return }

    const galicia = cuentas.find(c => c.nombre === 'Galicia')
    if (!galicia) { setErrorAjuste('No se encontró la cuenta Galicia.'); return }

    // El ajuste se fecha UN DIA ANTES que esta fila (no el mismo dia): asi el
    // orden (que primero mira fecha_pago) lo pone siempre antes de esta fila
    // de forma segura, sin depender del created_at -- varias filas cargadas
    // juntas en un mismo lote pueden compartir el mismo created_at, y ahi el
    // truco de "un segundo antes" fallaba (se colaba antes de sus hermanas
    // del mismo dia tambien).
    const fechaAjusteDate = new Date(m.fecha_pago + 'T00:00:00')
    fechaAjusteDate.setDate(fechaAjusteDate.getDate() - 1)
    const fechaAjuste = `${fechaAjusteDate.getFullYear()}-${String(fechaAjusteDate.getMonth() + 1).padStart(2, '0')}-${String(fechaAjusteDate.getDate()).padStart(2, '0')}`

    setGuardandoAjuste(true)
    const tipo = delta >= 0 ? 'ingreso' : 'egreso'
    const monto = Math.abs(delta)
    const { error: insError } = await supabase.from('movimientos').insert({
      tipo, categoria: 'otro',
      proveedor_cliente: 'Ajuste manual de saldo',
      numero_factura: null, forma_pago: null,
      monto_bruto: monto,
      monto_neto: m.estado === 'ejecutado' ? monto : null,
      estado: m.estado,
      periodo: periodoDeStr(fechaAjuste),
      fecha_pago: fechaAjuste,
      fecha_factura: null,
      concepto: `Ajuste manual: saldo del ${fmtFecha(m.fecha_pago)} (${m.proveedor_cliente ?? m.concepto ?? 'movimiento'}) pasa de ${fmtARS(m.saldoAcumulado)} a ${fmtARS(deseado)}`,
      obra_id: null, rubro_id: null,
      cuenta_id: galicia.id,
      created_by: user.id,
    })
    setGuardandoAjuste(false)

    if (insError) { setErrorAjuste('No se pudo guardar el ajuste.'); return }

    setFilaAjustando(null)
    setValorAjuste('')
    await cargarMovimientos()
  }

  function handleIniciarProyeccion(m) {
    setFilaProyeccion(m.id)
    setNuevaFechaProyeccion(m.fecha_pago ?? '')
    setErrorProyeccion('')
  }

  function handleCancelarProyeccion() {
    setFilaProyeccion(null)
    setNuevaFechaProyeccion('')
    setErrorProyeccion('')
  }

  async function handleGuardarProyeccion(m, accion) {
    setErrorProyeccion('')

    const payload = { estado_proyeccion: accion }

    if (accion === 'reprogramado') {
      if (!nuevaFechaProyeccion) { setErrorProyeccion('Elegí la nueva fecha estimada.'); return }
      if (nuevaFechaProyeccion === m.fecha_pago) { setErrorProyeccion('La fecha nueva tiene que ser distinta a la actual.'); return }
      // Guarda la fecha original solo la primera vez, para no perder el
      // historial si se reprograma más de una vez.
      payload.fecha_pago_original = m.fecha_pago_original ?? m.fecha_pago
      payload.fecha_pago = nuevaFechaProyeccion
      payload.periodo = periodoDeStr(nuevaFechaProyeccion)
    }

    setGuardandoProyeccion(true)
    const { error: updError } = await supabase.from('movimientos').update(payload).eq('id', m.id)
    setGuardandoProyeccion(false)

    if (updError) { setErrorProyeccion('No se pudo guardar el cambio.'); return }

    setFilaProyeccion(null)
    setNuevaFechaProyeccion('')
    await cargarMovimientos()
  }

  const selCls = `w-full px-3 py-2 text-sm rounded-xl border border-slate-200
    text-slate-900 bg-white focus:outline-none focus:ring-2 focus:border-transparent`

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f0f7fa' }}>
      <TopNav perfil={perfil} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">

        {/* Encabezado */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/finanzas')}
            className="text-sm font-medium flex items-center gap-1.5 mb-2 transition-colors"
            style={{ color: '#0e7490' }}
            onMouseEnter={e => e.currentTarget.style.color = '#164e63'}
            onMouseLeave={e => e.currentTarget.style.color = '#0e7490'}
          >
            <IconBack />
            Panel de Finanzas
          </button>
          <h1 className="text-slate-900 text-2xl font-extrabold tracking-tight">Cash Flow</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Posición financiera de la empresa — próximos {horizonte} días
          </p>
        </div>

        {/* Error global */}
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl
                          px-4 py-3 mb-6 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <SaldosIniciales cuentas={cuentas} userId={user.id} onActualizado={cargarSaldosBase} />

        {/* Cards resumen */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <CardResumen
            label="Saldo disponible hoy"
            valor={fmtARS(cards.saldoHoy)}
            subLabel="Todas las cuentas al día de hoy"
            positivo={cards.saldoHoy >= 0}
            grande
          />
          <CardResumen
            label="Posición a 30 días"
            valor={fmtARS(cards.pos30)}
            subLabel={`Al ${fmtFecha(fechaFutura(30))}`}
            positivo={cards.pos30 >= 0}
          />
          <CardResumen
            label="Posición a 60 días"
            valor={fmtARS(cards.pos60)}
            subLabel={`Al ${fmtFecha(fechaFutura(60))}`}
            positivo={cards.pos60 >= 0}
          />
          <CardResumen
            label="Posición a 90 días"
            valor={fmtARS(cards.pos90)}
            subLabel={`Al ${fmtFecha(fechaFutura(90))}`}
            positivo={cards.pos90 >= 0}
          />
        </div>

        {/* Cards de picos (maximo/minimo dentro de lo filtrado) */}
        {puntosExtremos && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <CardResumen
              label="Punto más alto (con más guita)"
              valor={fmtARS(puntosExtremos.max.saldoAcumulado)}
              subLabel={`El ${fmtFecha(puntosExtremos.max.fecha_pago)} — ${puntosExtremos.max.proveedor_cliente ?? puntosExtremos.max.concepto ?? ''}`}
              positivo={true}
            />
            <CardResumen
              label="Punto más bajo (con menos guita)"
              valor={fmtARS(puntosExtremos.min.saldoAcumulado)}
              subLabel={`El ${fmtFecha(puntosExtremos.min.fecha_pago)} — ${puntosExtremos.min.proveedor_cliente ?? puntosExtremos.min.concepto ?? ''}`}
              positivo={puntosExtremos.min.saldoAcumulado >= 0}
            />
          </div>
        )}

        {/* Filtros */}
        <div className="bg-white border border-slate-100 rounded-2xl p-4 mb-4 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Horizonte</label>
              <select value={horizonte} onChange={e => setHorizonte(Number(e.target.value))} className={selCls}>
                <option value={30}>Próximos 30 días</option>
                <option value={60}>Próximos 60 días</option>
                <option value={90}>Próximos 90 días</option>
                <option value={180}>Próximos 6 meses</option>
                <option value={365}>Próximo año</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Cuenta</label>
              <select value={filtroCuenta} onChange={e => setFiltroCuenta(e.target.value)} className={selCls}>
                <option value="">Todas las cuentas</option>
                {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Estado</label>
              <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className={selCls}>
                <option value="">Todos</option>
                <option value="proyectado">Solo proyectados</option>
                <option value="ejecutado">Solo ejecutados</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Categoría</label>
              <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} className={selCls}>
                <option value="">Todas</option>
                {Object.entries(LABEL_CAT).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Fecha desde</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={filtroFechaDesde}
                  onChange={e => setFiltroFechaDesde(e.target.value)}
                  className={selCls}
                />
                <button
                  type="button"
                  onClick={() => setFiltroFechaDesde(hoyISO())}
                  className="shrink-0 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200
                             text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  Desde hoy
                </button>
                {filtroFechaDesde && (
                  <button
                    type="button"
                    onClick={() => setFiltroFechaDesde('')}
                    className="shrink-0 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200
                               text-slate-400 hover:bg-slate-50 transition-colors"
                  >
                    Sacar
                  </button>
                )}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                Buscar (proveedor, factura, concepto, obra)
              </label>
              <input
                type="text"
                value={filtroBusqueda}
                onChange={e => setFiltroBusqueda(e.target.value)}
                placeholder="Ej: startech, 4-1596, obra 678…"
                className={selCls}
              />
            </div>
          </div>
        </div>

        {/* Contenido */}
        {cargando ? (
          <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
            <span className="w-5 h-5 border-2 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
            <span className="text-sm">Calculando cash flow…</span>
          </div>
        ) : filasFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center
                          bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: '#e0f2fe', color: '#0e7490' }}>
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0
                     0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
              </svg>
            </div>
            <p className="text-slate-700 font-bold text-sm">Sin movimientos para los filtros seleccionados</p>
            <p className="text-slate-400 text-xs mt-1">Probá ampliando el horizonte o cambiando los filtros.</p>
          </div>
        ) : (
          <>
            <TablaCashFlow
              filas={filasFiltradas}
              saldoInicial={saldoInicial}
              filaEditando={filaEditando}
              valoresEdicion={valoresEdicion}
              guardandoEdicion={guardandoEdicion}
              errorEdicion={errorEdicion}
              onIniciarEdicion={handleIniciarEdicion}
              onCambiarEdicion={cambios => setValoresEdicion(v => ({ ...v, ...cambios }))}
              onGuardarEdicion={handleGuardarEdicion}
              onCancelarEdicion={handleCancelarEdicion}
              onBorrarEdicion={handleBorrarEdicion}
              filaAjustando={filaAjustando}
              valorAjuste={valorAjuste}
              guardandoAjuste={guardandoAjuste}
              errorAjuste={errorAjuste}
              onIniciarAjuste={handleIniciarAjuste}
              onCambiarAjuste={setValorAjuste}
              onGuardarAjuste={handleGuardarAjuste}
              onCancelarAjuste={handleCancelarAjuste}
              filaProyeccion={filaProyeccion}
              nuevaFechaProyeccion={nuevaFechaProyeccion}
              guardandoProyeccion={guardandoProyeccion}
              errorProyeccion={errorProyeccion}
              onIniciarProyeccion={handleIniciarProyeccion}
              onCambiarNuevaFecha={setNuevaFechaProyeccion}
              onGuardarProyeccion={handleGuardarProyeccion}
              onCancelarProyeccion={handleCancelarProyeccion}
            />

            {/* Pie de totales */}
            <div className="mt-3 bg-white border border-slate-100 rounded-2xl p-4
                            flex items-center justify-end gap-8 text-sm shadow-sm">
              <div className="text-right">
                <p className="text-xs text-slate-400 mb-0.5">Total ingresos</p>
                <p className="font-semibold text-emerald-600">{fmtARS(totales.ingresos)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400 mb-0.5">Total egresos</p>
                <p className="font-semibold text-red-500">{fmtARS(totales.egresos)}</p>
              </div>
              <div className="text-right border-l border-slate-100 pl-8">
                <p className="text-xs text-slate-400 mb-0.5">Diferencia</p>
                <p className={`font-extrabold text-base ${totales.diferencia >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
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

// ─── Tabla ────────────────────────────────────────────────────────────────────

function TablaCashFlow({
  filas, saldoInicial,
  filaEditando, valoresEdicion, guardandoEdicion, errorEdicion,
  onIniciarEdicion, onCambiarEdicion, onGuardarEdicion, onCancelarEdicion, onBorrarEdicion,
  filaAjustando, valorAjuste, guardandoAjuste, errorAjuste,
  onIniciarAjuste, onCambiarAjuste, onGuardarAjuste, onCancelarAjuste,
  filaProyeccion, nuevaFechaProyeccion, guardandoProyeccion, errorProyeccion,
  onIniciarProyeccion, onCambiarNuevaFecha, onGuardarProyeccion, onCancelarProyeccion,
}) {
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
    <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80">
              <Th>Fecha pago</Th>
              <Th>Estado</Th>
              <Th>Categoría</Th>
              <Th>Proveedor / Cliente</Th>
              <Th>Obra</Th>
              <Th align="right">Ingreso</Th>
              <Th align="right">Egreso</Th>
              <Th align="right">Saldo acumulado</Th>
              <Th align="right">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {filasRender.map(fila => {
              if (fila.tipo === 'separador') {
                return <FilaSeparador key={fila.key} label={fila.label} saldoInicio={fila.saldoInicio} />
              }
              const { mov: m } = fila
              const saldoNeg   = m.saldoAcumulado < 0

              if (filaEditando === m.id) {
                return (
                  <FilaEdicionMovimiento
                    key={fila.key}
                    mov={m}
                    valores={valoresEdicion}
                    guardando={guardandoEdicion}
                    error={errorEdicion}
                    onChange={onCambiarEdicion}
                    onGuardar={() => onGuardarEdicion(m.id)}
                    onCancelar={onCancelarEdicion}
                    onBorrar={() => onBorrarEdicion(m.id)}
                  />
                )
              }

              if (filaAjustando === m.id) {
                return (
                  <FilaAjusteSaldo
                    key={fila.key}
                    mov={m}
                    valor={valorAjuste}
                    guardando={guardandoAjuste}
                    error={errorAjuste}
                    onChange={onCambiarAjuste}
                    onGuardar={() => onGuardarAjuste(m)}
                    onCancelar={onCancelarAjuste}
                  />
                )
              }

              if (filaProyeccion === m.id) {
                return (
                  <FilaProyeccion
                    key={fila.key}
                    mov={m}
                    nuevaFecha={nuevaFechaProyeccion}
                    guardando={guardandoProyeccion}
                    error={errorProyeccion}
                    onChangeFecha={onCambiarNuevaFecha}
                    onGuardar={accion => onGuardarProyeccion(m, accion)}
                    onCancelar={onCancelarProyeccion}
                  />
                )
              }

              return (
                <tr key={fila.key}
                  className={`border-b border-slate-100 last:border-0 transition-colors
                    ${saldoNeg ? 'bg-red-50/60' : 'hover:bg-slate-50/60'}`}>
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {fmtFecha(m.fecha_pago)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                      ${m.estado === 'ejecutado'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        : 'bg-slate-100 text-slate-500'}`}>
                      {m.estado === 'ejecutado' ? 'Ejecutado' : 'Proyectado'}
                    </span>
                    {m.estado_proyeccion === 'no_cumple' && (
                      <span className="block text-slate-400 text-[10px] font-semibold mt-1" title="No suma en el saldo acumulado">
                        No se cumple
                      </span>
                    )}
                    {m.estado_proyeccion === 'reprogramado' && (
                      <span className="block text-blue-500 text-[10px] font-semibold mt-1"
                        title={`Fecha original: ${fmtFecha(m.fecha_pago_original)}`}>
                        Reprogramado
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                      ${BADGE_CAT[m.categoria] ?? 'bg-slate-100 text-slate-600'}`}>
                      {LABEL_CAT[m.categoria] ?? m.categoria}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 max-w-[180px]">
                    <span className="truncate block" title={m.proveedor_cliente ?? m.concepto ?? ''}>
                      {m.proveedor_cliente ?? m.concepto ?? '—'}
                    </span>
                    {m.numero_factura && (
                      <span className="text-xs text-slate-400 block">Nº {m.numero_factura}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                    {m.obras?.codigo ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    {m.tipo === 'ingreso'
                      ? <span className={m.estado_proyeccion === 'no_cumple' ? 'text-slate-300 font-semibold line-through' : 'text-emerald-600 font-semibold'}>{fmtARS(m.montoEfectivo)}</span>
                      : <span className="text-slate-200 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    {m.tipo === 'egreso'
                      ? <span className={m.estado_proyeccion === 'no_cumple' ? 'text-slate-300 font-semibold line-through' : 'text-red-500 font-semibold'}>{fmtARS(m.montoEfectivo)}</span>
                      : <span className="text-slate-200 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    <span className={`font-bold text-sm ${saldoNeg ? 'text-red-600' : 'text-slate-900'}`}>
                      {fmtARS(m.saldoAcumulado)}
                    </span>
                    {saldoNeg && (
                      <span className="block text-red-400 text-[10px] font-semibold leading-tight mt-0.5">
                        ⚠ Saldo negativo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => onIniciarEdicion(m)}
                        disabled={filaEditando !== null || filaAjustando !== null || filaProyeccion !== null}
                        className="text-xs font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{ color: '#0e7490' }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => onIniciarAjuste(m)}
                        disabled={filaEditando !== null || filaAjustando !== null || filaProyeccion !== null}
                        className="text-xs font-semibold text-amber-600 hover:text-amber-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        Ajustar saldo
                      </button>
                      <button
                        onClick={() => onIniciarProyeccion(m)}
                        disabled={filaEditando !== null || filaAjustando !== null || filaProyeccion !== null}
                        className="text-xs font-semibold text-violet-600 hover:text-violet-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        Proyección
                      </button>
                    </div>
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

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function FilaSeparador({ label, saldoInicio }) {
  return (
    <tr style={{ backgroundColor: '#e0f2fe' }} className="border-b border-cyan-100">
      <td colSpan={5} className="px-4 py-2">
        <span className="text-xs font-bold tracking-wide" style={{ color: '#0e7490' }}>
          {label}
        </span>
      </td>
      <td colSpan={2} className="px-4 py-2 text-right">
        <span className="text-xs text-slate-400">Saldo al inicio del mes</span>
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        <span className={`text-xs font-bold ${saldoInicio < 0 ? 'text-red-600' : 'text-slate-700'}`}>
          {fmtARS(saldoInicio)}
        </span>
      </td>
      <td />
    </tr>
  )
}

function FilaAjusteSaldo({ mov, valor, guardando, error, onChange, onGuardar, onCancelar }) {
  const nuevo = Number(valor)
  const delta = !isNaN(nuevo) && valor !== '' ? nuevo - mov.saldoAcumulado : null

  return (
    <tr style={{ backgroundColor: '#fffbeb' }} className="border-b border-amber-100">
      <td className="px-4 py-3" colSpan={9}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Saldo acumulado actual</label>
            <p className="text-sm text-slate-700 px-3 py-2 font-semibold tabular-nums">{fmtARS(mov.saldoAcumulado)}</p>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-amber-700 mb-1">Saldo acumulado correcto</label>
            <input
              type="number"
              step="0.01"
              value={valor}
              onChange={e => onChange(e.target.value)}
              className="w-48 px-3 py-2 text-sm rounded-xl border border-amber-200 text-slate-900 bg-white
                        focus:outline-none focus:ring-2 focus:border-transparent"
              autoFocus
            />
          </div>
          {delta !== null && Math.abs(delta) >= 0.01 && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Se va a cargar</label>
              <p className={`text-sm font-semibold px-3 py-2 ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {delta >= 0 ? 'Ingreso' : 'Egreso'} de {fmtARS(Math.abs(delta))}
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {error && <span className="text-xs text-red-600 font-medium">{error}</span>}
            <button
              onClick={onCancelar}
              disabled={guardando}
              className="px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700
                        transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={onGuardar}
              disabled={guardando}
              className="px-4 py-2 text-sm font-semibold text-white rounded-xl transition-colors
                        disabled:opacity-50 disabled:cursor-not-allowed bg-amber-600 hover:bg-amber-700"
            >
              {guardando ? 'Guardando…' : 'Guardar ajuste'}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          Esto crea un movimiento nuevo de ajuste el día anterior a esta fila, para que esta fila y todo lo que
          sigue queden corregidos en cascada. El movimiento de ajuste queda visible y se puede editar o borrar
          como cualquier otro.
        </p>
      </td>
    </tr>
  )
}

function FilaProyeccion({ mov, nuevaFecha, guardando, error, onChangeFecha, onGuardar, onCancelar }) {
  const [modo, setModo] = useState(mov.estado_proyeccion === 'normal' ? '' : mov.estado_proyeccion)

  return (
    <tr style={{ backgroundColor: '#f5f3ff' }} className="border-b border-violet-100">
      <td className="px-4 py-3" colSpan={9}>
        <div className="flex flex-wrap items-start gap-4">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 mb-1">
              {mov.proveedor_cliente ?? mov.concepto ?? 'Movimiento'} — {fmtARS(mov.montoEfectivo)}
            </p>
            <p className="text-xs text-slate-400">
              Fecha actual: {fmtFecha(mov.fecha_pago)}
              {mov.fecha_pago_original && ` (original: ${fmtFecha(mov.fecha_pago_original)})`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setModo('normal')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors
                ${modo === 'normal' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              Mantener proyección
            </button>
            <button
              onClick={() => setModo('no_cumple')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors
                ${modo === 'no_cumple' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              No se cumple
            </button>
            <button
              onClick={() => setModo('reprogramado')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors
                ${modo === 'reprogramado' ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              Reprogramar
            </button>
          </div>

          {modo === 'reprogramado' && (
            <div>
              <label className="block text-[11px] font-semibold text-violet-700 mb-1">Nueva fecha estimada</label>
              <input
                type="date"
                value={nuevaFecha}
                onChange={e => onChangeFecha(e.target.value)}
                className="px-3 py-2 text-sm rounded-xl border border-violet-200 text-slate-900 bg-white
                          focus:outline-none focus:ring-2 focus:border-transparent"
                autoFocus
              />
            </div>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {error && <span className="text-xs text-red-600 font-medium">{error}</span>}
            <button
              onClick={onCancelar}
              disabled={guardando}
              className="px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700
                        transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={() => onGuardar(modo || 'normal')}
              disabled={guardando || !modo}
              className="px-4 py-2 text-sm font-semibold text-white rounded-xl transition-colors
                        disabled:opacity-50 disabled:cursor-not-allowed bg-violet-600 hover:bg-violet-700"
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          "No se cumple" deja el movimiento visible como pendiente pero no lo suma ni resta del saldo acumulado.
          "Reprogramar" mueve la fecha de pago y guarda la fecha original para no perder el historial. Nada se borra.
        </p>
      </td>
    </tr>
  )
}

function FilaEdicionMovimiento({ mov, valores, guardando, error, onChange, onGuardar, onCancelar, onBorrar }) {
  return (
    <tr style={{ backgroundColor: '#ecfeff' }} className="border-b border-cyan-100">
      <td className="px-4 py-3" colSpan={9}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Proveedor / Cliente</label>
            <p className="text-sm text-slate-700 px-3 py-2">{mov.proveedor_cliente ?? mov.concepto ?? '—'}</p>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Fecha de pago</label>
            <input
              type="date"
              value={valores.fecha_pago ?? ''}
              onChange={e => onChange({ fecha_pago: e.target.value })}
              className="px-3 py-2 text-sm rounded-xl border border-slate-200 text-slate-900 bg-white
                        focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ '--tw-ring-color': '#0e7490' }}
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Monto</label>
            <input
              type="number"
              step="0.01"
              value={valores.monto_bruto ?? ''}
              onChange={e => onChange({ monto_bruto: e.target.value })}
              className="w-36 px-3 py-2 text-sm rounded-xl border border-slate-200 text-slate-900 bg-white
                        focus:outline-none focus:ring-2 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Estado</label>
            <select
              value={valores.estado ?? 'proyectado'}
              onChange={e => onChange({ estado: e.target.value })}
              className="px-3 py-2 text-sm rounded-xl border border-slate-200 text-slate-900 bg-white
                        focus:outline-none focus:ring-2 focus:border-transparent"
            >
              <option value="proyectado">Proyectado</option>
              <option value="ejecutado">Ejecutado</option>
            </select>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {error && <span className="text-xs text-red-600 font-medium">{error}</span>}
            <button
              onClick={onBorrar}
              disabled={guardando}
              className="px-3 py-2 text-sm font-medium text-red-500 hover:text-red-700
                        transition-colors disabled:opacity-50"
            >
              Borrar
            </button>
            <button
              onClick={onCancelar}
              disabled={guardando}
              className="px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700
                        transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={onGuardar}
              disabled={guardando}
              className="px-4 py-2 text-sm font-semibold text-white rounded-xl transition-colors
                        disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#0e7490' }}
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </td>
    </tr>
  )
}

function CardResumen({ label, valor, subLabel, positivo, grande = false }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
      <p className="text-xs font-semibold text-slate-400 mb-2">{label}</p>
      <p className={`font-extrabold tabular-nums ${grande ? 'text-2xl' : 'text-xl'}
                     ${positivo ? (grande ? 'text-slate-900' : 'text-emerald-600') : 'text-red-600'}`}>
        {valor}
      </p>
      {subLabel && <p className="text-xs text-slate-400 mt-1.5">{subLabel}</p>}
    </div>
  )
}

function Th({ children, align = 'left' }) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide
                    ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}