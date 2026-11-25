// pages/finanzas/CashFlow.jsx
// Vista principal del Cash Flow Predictivo.
// Ruta: /finanzas/cashflow

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { traerTodo } from '../../lib/traerTodo'
import { useAuth } from '../../context/AuthContext'
import SidebarFinanzas, { CLASE_SIDEBAR } from './components/SidebarFinanzas'
import FormularioMovimiento from './components/FormularioMovimiento'
import SeccionDebitos from './components/SeccionDebitos'
import ModalNotas from './components/ModalNotas'
import { combinarConProyeccion, dividirPorPorcentajes, indexarRegistrado, desgloseDeLinea, NIVELACION_DIARIA } from '../../lib/proyeccionPresupuesto'
import { CARD, TONOS, Icono, ICONOS, ico, CardResumen as CardPremium } from '../directorio/utilsDirectorio'
import { puedeEditarPresupuestosEnFinanzas } from '../../lib/permisos'
import { desgloseDeCobro, normalizarItems, BASES_RETENCION } from '../../lib/retencionesClientes'

// Una línea de gasto proyectado (obra + rubro + período) puede tener varias filas (partes): todas comparten esta clave.
const claveDeLinea = m => `${m._claveFecha.obra_id}|${m._claveFecha.rubro_id}|${m._claveFecha.periodo}`

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

// "octubre" (o "enero 2027" si no es el año en curso): mes del período al que corresponde un gasto proyectado.
function periodoCorto(periodoISO) {
  if (!periodoISO) return ''
  const d = new Date(periodoISO + 'T00:00:00')
  const mes = d.toLocaleDateString('es-AR', { month: 'long' })
  return d.getFullYear() === new Date().getFullYear() ? mes : `${mes} ${d.getFullYear()}`
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
  reintegro_impuestos: 'bg-teal-50 text-teal-700',
  reintegro_seguros:   'bg-teal-50 text-teal-700',
  reintegro_otros:     'bg-teal-50 text-teal-700',
  gasto_proyectado:  'bg-slate-50 text-slate-500 border border-dashed border-slate-300',
  venta_proyectada:  'bg-slate-50 text-slate-500 border border-dashed border-slate-300',
  impuesto_venta_proyectado: 'bg-slate-50 text-slate-500 border border-dashed border-slate-300',
  otro:              'bg-slate-100 text-slate-600',
}
const LABEL_CAT = {
  factura:           'Factura',
  ingreso_cliente:   'Ventas',
  sueldo:            'Sueldo',
  impuesto:          'Impuesto',
  debito_automatico: 'Débito aut.',
  fima:              'FIMA',
  reintegro_impuestos: 'Reintegro impuestos',
  reintegro_seguros:   'Reintegro seguros',
  reintegro_otros:     'Otros reintegros',
  gasto_proyectado:  'Gasto proyectado (presupuesto)',
  venta_proyectada:  'Venta proyectada (sin registrar)',
  impuesto_venta_proyectado: 'Impuesto s/ cobro (proyectado)',
  otro:              'Otro',
}

// Categoría → tipo de movimiento (para recalcular al editar). FIMA queda afuera
// porque su tipo depende del subtipo (rescate/suscripción), no editable acá.
const CATEGORIA_TIPO = {
  factura:           'egreso',
  ingreso_cliente:   'ingreso',
  sueldo:            'egreso',
  impuesto:          'egreso',
  debito_automatico: 'egreso',
  reintegro_impuestos: 'ingreso',
  reintegro_seguros:   'ingreso',
  reintegro_otros:     'ingreso',
  otro:              'egreso',
}

// Mismos rubros que ve Operaciones al cargar presupuestos, más "Ventas"
// (que se usa para la categoría Ventas / ingreso_cliente).
const RUBROS_PERMITIDOS_FINANZAS = [
  'Materiales',
  'Subcontratos',
  'MO directa con Carg Sociales',
  'Mano de obra indirecta con cargas',
  'Vehículos',
  'Otros Gastos Operativos',
  'Gastos Generales',
  'Impuestos',
  'Ventas',
]

const CATEGORIAS_FILTRO = [
  { value: 'factura',           label: 'Factura' },
  { value: 'ingreso_cliente',   label: 'Ventas' },
  { value: 'sueldo',            label: 'Sueldo' },
  { value: 'impuesto',          label: 'Impuesto' },
  { value: 'debito_automatico', label: 'Débito automático' },
  { value: 'fima',              label: 'FIMA' },
  { value: 'reintegro_impuestos', label: 'Reintegro impuestos' },
  { value: 'reintegro_seguros',   label: 'Reintegro seguros' },
  { value: 'reintegro_otros',     label: 'Otros reintegros' },
  { value: 'otro',              label: 'Otro' },
]

// Desde diciembre de 2024 (fijo) hasta 24 meses después de hoy
function generarPeriodosEdicion() {
  const lista = []
  const hoy = new Date()
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 24, 1)
  for (let d = new Date(2024, 11, 1); d <= fin; d.setMonth(d.getMonth() + 1)) {
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    lista.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return lista
}
const PERIODOS_EDICION = generarPeriodosEdicion()

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
  const [obras,       setObras]       = useState([])
  const [rubros,      setRubros]      = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [presupuestos, setPresupuestos] = useState([])
  const [ventasProyectadas, setVentasProyectadas] = useState([])
  const [fechasEstimadasGasto, setFechasEstimadasGasto] = useState([])
  const [fechasEstimadasVenta, setFechasEstimadasVenta] = useState([])
  const [ajustesRetenciones, setAjustesRetenciones] = useState([]) // ajustes editables de retenciones (tabla retenciones_config)
  const [tablaRetencionesFaltante, setTablaRetencionesFaltante] = useState(false)
  const [saldosBase,  setSaldosBase]  = useState([])
  const [cargando,     setCargando]     = useState(true)
  const [actualizando, setActualizando] = useState(false)
  const [error,       setError]       = useState('')

  const [filtroCuenta, setFiltroCuenta] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [horizonte,    setHorizonte]    = useState(365)
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('')
  const [filtroCategoria,  setFiltroCategoria]  = useState('')
  const [filtroBusqueda,   setFiltroBusqueda]   = useState('')

  const [filaEditando,   setFilaEditando]   = useState(null)
  // true cuando la edición se abrió desde el detalle de una línea gris: el formulario se muestra ahí y no en su fecha
  const [editorEnDetalle, setEditorEnDetalle] = useState(false)
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

  const [debitos,        setDebitos]        = useState([])
  const [fondos,         setFondos]         = useState([])
  const [mostrarFormMov, setMostrarFormMov] = useState(false)
  const [modalNotas,     setModalNotas]     = useState(null)
  const [mostrarDebitos, setMostrarDebitos] = useState(false)

  // Mover varios gastos proyectados juntos a otra fecha: solo Santiago Verdinelli (decide qué se ve en pantalla).
  const puedeMoverGastos = puedeEditarPresupuestosEnFinanzas(user)
  const [seleccionMover,    setSeleccionMover]    = useState(() => new Set()) // claves obra|rubro|período
  const [fechaDestinoMover, setFechaDestinoMover] = useState('')
  const [fechaOrigenMover,  setFechaOrigenMover]  = useState('')
  const [moviendoGastos,    setMoviendoGastos]    = useState(false)
  const [errorMover,        setErrorMover]        = useState('')

  const [filaEditandoFecha,  setFilaEditandoFecha]  = useState(null)
  const [nuevaFechaEstimada, setNuevaFechaEstimada]  = useState('')
  const [nuevoConceptoVenta, setNuevoConceptoVenta]  = useState('')
  const [guardandoFecha,     setGuardandoFecha]      = useState(false)
  const [errorFecha,         setErrorFecha]          = useState('')

  useEffect(() => {
    supabase
      .from('cuentas')
      .select('id, nombre, tipo, activa')
      .eq('activa', true)
      .order('nombre')
      .then(({ data }) => setCuentas(data ?? []))
    supabase
      .from('obras')
      .select('id, codigo, nombre, activa')
      .eq('activa', true)
      .order('codigo')
      .then(({ data }) => setObras(data ?? []))
    supabase
      .from('rubros')
      .select('id, nombre, tipo, activo')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => setRubros(data ?? []))
    traerTodo(() => supabase
      .from('presupuestos')
      .select('id, obra_id, rubro_id, periodo, monto')
      .order('id'))
      .then(({ data }) => setPresupuestos(data ?? []))
  }, [])

  const cargarVentasProyectadas = useCallback(async () => {
    const { data } = await traerTodo(() => supabase
      .from('ventas_proyectadas')
      .select('id, obra_id, periodo, monto, registrado')
      .order('id'))
    setVentasProyectadas(data ?? [])
  }, [])

  useEffect(() => { cargarVentasProyectadas() }, [cargarVentasProyectadas])

  // Débitos automáticos activos: alimentan la categoría "Débito automático"
  // del formulario de Nuevo movimiento.
  const cargarDebitos = useCallback(async () => {
    const { data } = await supabase
      .from('debitos_automaticos_config')
      .select('id, nombre, monto_estimado, dia_del_mes, rubro_id, obra_id')
      .eq('activo', true)
      .order('nombre')
    setDebitos(data ?? [])
  }, [])

  useEffect(() => { cargarDebitos() }, [cargarDebitos])

  // Fondos de inversión: para elegir el fondo en los movimientos FIMA. Si la
  // tabla todavía no existe en la base, queda vacío y el formulario se comporta como antes.
  useEffect(() => {
    supabase.from('fondos_inversion').select('id, nombre, activo').eq('activo', true).order('created_at')
      .then(({ data, error }) => setFondos(error ? [] : (data ?? [])))
  }, [])

  const cargarFechasEstimadasGasto = useCallback(async () => {
    const { data } = await supabase
      .from('gasto_proyectado_fecha_estimada')
      .select('*') // trae también `partes` (la división manual) sin romper si la columna todavía no existe
    setFechasEstimadasGasto(data ?? [])
  }, [])

  useEffect(() => { cargarFechasEstimadasGasto() }, [cargarFechasEstimadasGasto])

  const cargarFechasEstimadasVenta = useCallback(async () => {
    const { data } = await supabase
      .from('venta_proyectada_fecha_estimada')
      .select('*')
    setFechasEstimadasVenta(data ?? [])
  }, [])

  useEffect(() => { cargarFechasEstimadasVenta() }, [cargarFechasEstimadasVenta])

  // Ajustes de retenciones. Si la tabla todavía no se creó (sql/retenciones_config.sql), se usan los valores estándar y no se puede guardar.
  const cargarAjustesRetenciones = useCallback(async () => {
    const { data, error } = await supabase.from('retenciones_config').select('*')
    if (error) {
      setTablaRetencionesFaltante(['42P01', 'PGRST205'].includes(error.code) || /retenciones_config/i.test(error.message ?? ''))
      setAjustesRetenciones([])
      return
    }
    setTablaRetencionesFaltante(false)
    setAjustesRetenciones(data ?? [])
  }, [])

  useEffect(() => { cargarAjustesRetenciones() }, [cargarAjustesRetenciones])

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

  const cargarMovimientos = useCallback(async (opts = {}) => {
    const { silencioso = false } = opts
    if (silencioso) setActualizando(true); else setCargando(true)
    setError('')
    const { data: movData, error: movErr } = await traerTodo(() => supabase
      .from('movimientos')
      .select(`
        id, tipo, categoria, proveedor_cliente, numero_factura,
        monto_bruto, monto_neto, concepto, observaciones,
        periodo, fecha_pago, estado, cuenta_id, obra_id, rubro_id, created_at,
        estado_proyeccion, fecha_pago_original,
        obras   ( id, codigo, nombre ),
        rubros  ( id, nombre ),
        cuentas ( id, nombre )
      `)
      .order('fecha_pago', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .order('id',         { ascending: true }))

    if (movErr) { setError('No se pudieron cargar los movimientos.'); setCargando(false); setActualizando(false); return }

    const movIds = (movData ?? []).map(m => m.id)
    let notasPorMov = {}
    if (movIds.length > 0) {
      // Se traen todas las notas (son pocas): con un .in() de cientos de ids la URL se pasa del
      // largo permitido, la consulta da error y las notas de débito/crédito quedaban sin aplicar
      // en silencio, con el saldo mal.
      const { data: notasData, error: notasErr } = await supabase
        .from('notas')
        .select('movimiento_id, tipo_nota, monto')
      if (notasErr) setError('No se pudieron cargar las notas de débito/crédito: los saldos de las facturas pueden no ser exactos.')
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
    setActualizando(false)
  }, [])

  useEffect(() => { cargarMovimientos() }, [cargarMovimientos])

  // Movimientos reales + filas virtuales de "gasto proyectado" (lo que del
  // presupuesto de Operaciones todavía no se facturó). Las virtuales nunca se
  // guardan en la base: se recalculan cada vez a partir de presupuestos vivos.
  const movimientosCombinados = useMemo(
    () => combinarConProyeccion(movimientos, presupuestos, ventasProyectadas, fechasEstimadasGasto, fechasEstimadasVenta, obras, rubros, new Date(), ajustesRetenciones),
    [movimientos, presupuestos, ventasProyectadas, fechasEstimadasGasto, fechasEstimadasVenta, obras, rubros, ajustesRetenciones]
  )

  const { movimientosConSaldo, saldoInicial } = useMemo(() => {
    const sumaSaldosBase = saldosBase.reduce((acc, s) => acc + Number(s.monto ?? 0), 0)
    let saldoActual = sumaSaldosBase
    const resultado = movimientosCombinados.map(m => {
      // "No se cumple": el movimiento queda registrado pero no suma/resta
      // en el saldo acumulado (no se borra ni se pierde el dato). Lo mismo
      // para una venta proyectada de un período anterior a este mes: se
      // muestra como dato informativo pero no afecta el saldo.
      if (m.estado_proyeccion !== 'no_cumple' && m._afectaCashflow !== false) {
        if (m.tipo === 'ingreso') saldoActual += m.montoEfectivo
        else                      saldoActual -= m.montoEfectivo
      }
      return { ...m, saldoAcumulado: saldoActual }
    })
    return { movimientosConSaldo: resultado, saldoInicial: sumaSaldosBase }
  }, [movimientosCombinados, saldosBase])

  const cards = useMemo(() => {
    const hoy = hoyISO()
    const d30 = fechaFutura(30)
    const d60 = fechaFutura(60)
    const d90 = fechaFutura(90)
    const sumaSaldosBase = saldosBase.reduce((acc, s) => acc + Number(s.monto ?? 0), 0)

    let saldoHoy = sumaSaldosBase
    // Sin fecha de pago no se puede saber si ya pasó: no entra al saldo de hoy
    // (en la tabla esos movimientos quedan al final, igual que acá).
    movimientosCombinados.forEach(m => {
      const fecha = m.fecha_pago
      if (!fecha || fecha > hoy) return
      if (m.estado_proyeccion === 'no_cumple') return
      if (m._afectaCashflow === false) return
      if (m.tipo === 'ingreso') saldoHoy += m.montoEfectivo
      else                      saldoHoy -= m.montoEfectivo
    })

    function posicionEn(fechaLimite) {
      let ultimo = sumaSaldosBase
      for (const m of movimientosConSaldo) {
        const fecha = m.fecha_pago
        if (!fecha || fecha > fechaLimite) break
        ultimo = m.saldoAcumulado
      }
      return ultimo
    }

    return { saldoHoy, pos30: posicionEn(d30), pos60: posicionEn(d60), pos90: posicionEn(d90) }
  }, [movimientosCombinados, movimientosConSaldo, saldosBase])

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
      if (m._afectaCashflow === false) return
      if (m.tipo === 'ingreso') ingresos += m.montoEfectivo
      else                      egresos  += m.montoEfectivo
    })
    return { ingresos, egresos, diferencia: ingresos - egresos }
  }, [filasFiltradas])

  function handleIniciarEdicion(m) {
    setEditorEnDetalle(false)
    setFilaEditando(m.id)
    setErrorEdicion('')
    setValoresEdicion({
      proveedor_cliente: m.proveedor_cliente ?? '',
      numero_factura:    m.numero_factura ?? '',
      categoria:         m.categoria,
      obra_id:           m.obra_id ?? '',
      rubro_id:          m.rubro_id ?? '',
      fecha_pago:        m.fecha_pago ?? '',
      periodo:           m.periodo ?? '',
      monto_bruto:       String(m.monto_bruto ?? ''),
      monto_neto:        m.monto_neto != null ? String(m.monto_neto) : '',
      concepto:          m.concepto ?? '',
      observaciones:     m.observaciones ?? '',
      estado:            m.estado,
    })
  }

  function handleEditarDesdeDetalle(m) {
    handleIniciarEdicion(m)
    setEditorEnDetalle(true)
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
    await cargarMovimientos({ silencioso: true })
  }

  async function handleGuardarEdicion(id) {
    setErrorEdicion('')
    if (!valoresEdicion.categoria)  { setErrorEdicion('Seleccioná una categoría.'); return }
    if (!valoresEdicion.fecha_pago) { setErrorEdicion('Elegí una fecha de pago.'); return }
    if (!valoresEdicion.periodo)    { setErrorEdicion('Elegí un período.'); return }
    const monto = Number(valoresEdicion.monto_bruto)
    if (!valoresEdicion.monto_bruto || isNaN(monto) || monto <= 0) {
      setErrorEdicion('El monto tiene que ser un número mayor a 0.'); return
    }
    let montoNeto = null
    if (valoresEdicion.estado === 'ejecutado') {
      montoNeto = valoresEdicion.monto_neto !== '' && valoresEdicion.monto_neto != null
        ? Number(valoresEdicion.monto_neto)
        : monto
      if (isNaN(montoNeto) || montoNeto <= 0) { setErrorEdicion('El monto neto tiene que ser un número mayor a 0.'); return }
    }

    // El rubro de una Venta siempre es "Ventas" -- se asigna solo, no se elige.
    let rubroId = valoresEdicion.rubro_id || null
    if (valoresEdicion.categoria === 'ingreso_cliente') {
      const rubroVentas = rubros.find(r => r.nombre === 'Ventas' && r.tipo === (valoresEdicion.obra_id ? 'obra' : 'general'))
      rubroId = rubroVentas?.id ?? null
    }

    const payload = {
      proveedor_cliente: valoresEdicion.proveedor_cliente.trim() || null,
      numero_factura:    valoresEdicion.numero_factura.trim()    || null,
      categoria:         valoresEdicion.categoria,
      obra_id:           valoresEdicion.obra_id || null,
      rubro_id:          rubroId,
      fecha_pago:        valoresEdicion.fecha_pago,
      periodo:           valoresEdicion.periodo,
      monto_bruto:       monto,
      monto_neto:        montoNeto,
      concepto:          valoresEdicion.concepto.trim() || null,
      observaciones:     valoresEdicion.observaciones.trim() || null,
      estado:            valoresEdicion.estado,
    }
    if (CATEGORIA_TIPO[valoresEdicion.categoria]) payload.tipo = CATEGORIA_TIPO[valoresEdicion.categoria]

    setGuardandoEdicion(true)
    const { error: updError } = await supabase
      .from('movimientos')
      .update(payload)
      .eq('id', id)
    setGuardandoEdicion(false)

    if (updError) { setErrorEdicion('No se pudo guardar el cambio.'); return }

    setFilaEditando(null)
    setValoresEdicion({})
    await cargarMovimientos({ silencioso: true })
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
    await cargarMovimientos({ silencioso: true })
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
    await cargarMovimientos({ silencioso: true })
  }

  function handleIniciarEditarFecha(m) {
    setFilaEditandoFecha(m.id)
    setNuevaFechaEstimada(m.fecha_pago ?? '')
    setNuevoConceptoVenta(m._conceptoManual ?? '')
    setErrorFecha('')
  }

  function handleCancelarEditarFecha() {
    setFilaEditandoFecha(null)
    setNuevaFechaEstimada('')
    setNuevoConceptoVenta('')
    setErrorFecha('')
  }

  // Fecha estimada (y concepto, para ventas) de una fila gris ("Gasto
  // proyectado" / "Venta proyectada"). No toca el presupuesto ni la venta
  // proyectada original de Operaciones: guarda todo aparte, según el tipo de fila.
  async function handleGuardarFecha(m) {
    setErrorFecha('')
    if (!nuevaFechaEstimada) { setErrorFecha('Elegí una fecha.'); return }

    setGuardandoFecha(true)
    // Si la línea estaba dividida a mano, una fecha única la vuelve a juntar (la división manda sobre la fecha).
    const sinDivision = m._divisionManual ? { partes: null } : {}
    let error
    if (m.categoria === 'venta_proyectada') {
      ;({ error } = await supabase
        .from('venta_proyectada_fecha_estimada')
        .upsert({ ...m._claveFecha, fecha_estimada: nuevaFechaEstimada, concepto: nuevoConceptoVenta.trim() || null, ...sinDivision }, { onConflict: 'obra_id,periodo' }))
    } else {
      ;({ error } = await supabase
        .from('gasto_proyectado_fecha_estimada')
        .upsert({ ...m._claveFecha, fecha_estimada: nuevaFechaEstimada, ...sinDivision }, { onConflict: 'obra_id,rubro_id,periodo' }))
    }
    setGuardandoFecha(false)

    if (error) { setErrorFecha('No se pudo guardar la fecha.'); return }

    setFilaEditandoFecha(null)
    setNuevaFechaEstimada('')
    setNuevoConceptoVenta('')
    if (m.categoria === 'venta_proyectada') await cargarFechasEstimadasVenta()
    else await cargarFechasEstimadasGasto()
  }

  // Divide una fila gris en partes (porcentaje + fecha cada una). Se guarda aparte, igual que la fecha: no toca
  // el presupuesto ni la venta de Operaciones, y las facturas siguen descontando (el motor reparte el saldo
  // que queda, no el importe original). Hace falta la columna `partes` (sql/proyeccion_dividir_en_partes.sql).
  async function guardarPartes(m, partes) {
    setErrorFecha('')
    setGuardandoFecha(true)
    let error
    if (m.categoria === 'venta_proyectada') {
      ;({ error } = await supabase
        .from('venta_proyectada_fecha_estimada')
        .upsert({ ...m._claveFecha, fecha_estimada: null, partes, concepto: nuevoConceptoVenta.trim() || null }, { onConflict: 'obra_id,periodo' }))
    } else {
      ;({ error } = await supabase
        .from('gasto_proyectado_fecha_estimada')
        .upsert({ ...m._claveFecha, fecha_estimada: null, partes }, { onConflict: 'obra_id,rubro_id,periodo' }))
    }
    setGuardandoFecha(false)

    if (error) {
      setErrorFecha(/partes/i.test(error.message ?? '') ? 'Falta correr el script SQL de la división en partes.' : 'No se pudo guardar la división.')
      return
    }

    setFilaEditandoFecha(null)
    setNuevaFechaEstimada('')
    setNuevoConceptoVenta('')
    if (m.categoria === 'venta_proyectada') await cargarFechasEstimadasVenta()
    else await cargarFechasEstimadasGasto()
  }

  const handleGuardarDivision = (m, partes) => guardarPartes(m, partes)
  // Quitar la división: la línea vuelve a su fecha por defecto (sin fecha manual ni partes).
  const handleQuitarDivision = m => guardarPartes(m, null)

  // Cierra una proyección "a mano": Finanzas ya revisó que el saldo restante
  // no va a pasar, y no debe seguir apareciendo en el Cash Flow. No borra el
  // presupuesto ni la venta proyectada original, solo la oculta.
  async function handleCerrarProyeccion(m) {
    if (!window.confirm('¿Cerrar esta proyección? El saldo restante deja de aparecer en el Cash Flow. El presupuesto/venta original de Operaciones no se toca.')) return
    setErrorFecha('')
    setGuardandoFecha(true)
    let error
    if (m.categoria === 'venta_proyectada') {
      ;({ error } = await supabase
        .from('venta_proyectada_fecha_estimada')
        .upsert({ ...m._claveFecha, cerrado: true }, { onConflict: 'obra_id,periodo' }))
    } else {
      ;({ error } = await supabase
        .from('gasto_proyectado_fecha_estimada')
        .upsert({ ...m._claveFecha, cerrado: true }, { onConflict: 'obra_id,rubro_id,periodo' }))
    }
    setGuardandoFecha(false)

    if (error) { setErrorFecha('No se pudo cerrar la proyección.'); return }

    setFilaEditandoFecha(null)
    setNuevaFechaEstimada('')
    setNuevoConceptoVenta('')
    if (m.categoria === 'venta_proyectada') await cargarFechasEstimadasVenta()
    else await cargarFechasEstimadasGasto()
  }

  // ─── Mover varios gastos proyectados juntos (solo Santiago) ───────────────────
  // Cada línea movida queda con fecha puesta a mano en ese día (igual que "Editar fecha"). Después, el resto
  // del gasto proyectado automático de ese día se reacomoda solo (ver nivelarGastoAutomatico) para que el día
  // no pase del tope. No toca presupuestos ni facturas.
  const gastosProyectadosMovibles = useMemo(
    () => movimientosCombinados.filter(m => m._virtual && m.categoria === 'gasto_proyectado' && m._claveFecha),
    [movimientosCombinados]
  )
  // La selección es por FILA (cada parte de una línea partida se elige por separado): solo se mueve lo que se tilda.
  const resumenSeleccionMover = useMemo(() => {
    const filas = gastosProyectadosMovibles.filter(m => seleccionMover.has(m.id))
    return { lineas: filas.length, monto: filas.reduce((s, m) => s + m.montoEfectivo, 0) }
  }, [gastosProyectadosMovibles, seleccionMover])

  // Atajos de la barra: los próximos 5 miércoles (los días de pago), a partir de mañana.
  const proximosMiercoles = useMemo(() => {
    const h = new Date()
    const d = new Date(h.getFullYear(), h.getMonth(), h.getDate() + 1)
    while (d.getDay() !== 3) d.setDate(d.getDate() + 1)
    return Array.from({ length: 5 }, (_, i) => {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * i)
      return { iso: `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`, etiqueta: `${x.getDate()}/${x.getMonth() + 1}` }
    })
  }, [])

  const alternarSeleccionMover = id => setSeleccionMover(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  function handleElegirDelDia() {
    setErrorMover('')
    if (!fechaOrigenMover) { setErrorMover('Elegí el día del que querés mover los gastos.'); return }
    const ids = gastosProyectadosMovibles.filter(m => m.fecha_pago === fechaOrigenMover).map(m => m.id)
    if (ids.length === 0) { setErrorMover('Ese día no tiene gasto proyectado.'); return }
    setSeleccionMover(prev => new Set([...prev, ...ids]))
  }

  async function handleMoverGastos() {
    setErrorMover('')
    if (seleccionMover.size === 0) { setErrorMover('Elegí al menos un gasto proyectado.'); return }
    if (!fechaDestinoMover) { setErrorMover('Elegí la fecha a la que se mueven.'); return }
    const h = new Date()
    const hoyISO = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`
    if (fechaDestinoMover <= hoyISO) { setErrorMover('La fecha tiene que ser posterior a hoy.'); return }

    // Se agrupan las filas elegidas por línea (obra + rubro + período).
    const porLinea = new Map()
    gastosProyectadosMovibles.forEach(m => {
      if (!seleccionMover.has(m.id)) return
      const k = claveDeLinea(m)
      if (!porLinea.has(k)) porLinea.set(k, [])
      porLinea.get(k).push(m)
    })
    let lineasSinMover = 0 // por si alguna línea no se puede mover: se avisa, nunca se saltea en silencio
    const conDivision = [] // líneas partidas de las que solo se mueven algunas partes
    const sinDivision = [] // líneas enteras (sin partir, o con todas sus partes elegidas)
    porLinea.forEach((elegidas, k) => {
      const todas = gastosProyectadosMovibles.filter(m => claveDeLinea(m) === k)
      const clave = elegidas[0]._claveFecha
      if (todas.length === elegidas.length) {
        // Se movió todo lo que tiene la línea: queda con una sola fecha (si estaba dividida a mano, se junta).
        const fila = { ...clave, fecha_estimada: fechaDestinoMover }
        if (todas.some(m => m._divisionManual)) conDivision.push({ ...fila, partes: null }); else sinDivision.push(fila)
        return
      }
      // Solo algunas partes: cada parte conserva su porcentaje y su fecha, salvo las elegidas, que van a la fecha nueva.
      const division = todas[0]._division
      if (!Array.isArray(division) || division.length < 2) { lineasSinMover += 1; return }
      const idsElegidos = new Set(elegidas.map(m => m._parte))
      const partes = division.map((p, i) => ({
        porcentaje: Number(p.porcentaje),
        fecha: idsElegidos.has(i + 1) ? fechaDestinoMover : p.fecha,
      }))
      const suma = partes.slice(0, -1).reduce((s, p) => s + p.porcentaje, 0)
      partes[partes.length - 1].porcentaje = Math.round((100 - suma) * 100) / 100
      conDivision.push({ ...clave, fecha_estimada: null, partes })
    })

    if (lineasSinMover > 0) { setErrorMover(`${lineasSinMover} línea(s) no se pudieron mover porque les falta la división. No se movió nada.`); return }
    if (sinDivision.length + conDivision.length === 0) { setErrorMover('No había nada para mover.'); return }

    setMoviendoGastos(true)
    let error = null
    for (const grupo of [sinDivision, conDivision]) {
      if (!grupo.length || error) continue
      ;({ error } = await supabase.from('gasto_proyectado_fecha_estimada').upsert(grupo, { onConflict: 'obra_id,rubro_id,periodo' }))
    }
    setMoviendoGastos(false)
    if (error) { setErrorMover('No se pudieron mover los gastos. Revisá la conexión y probá de nuevo.'); return }

    setSeleccionMover(new Set())
    setFechaDestinoMover('')
    await cargarFechasEstimadasGasto()
  }

  // ─── Retenciones e impuestos editables ──────────────────────────────────────────────────────────
  // Se guardan en retenciones_config (una fila por cliente o por venta). Devuelven un texto de error, o null si salió bien.
  const puedeEditarRetenciones = perfil?.rol === 'finanzas' || perfil?.rol === 'directorio' || puedeEditarPresupuestosEnFinanzas(user)
  const textoErrorRetenciones = error => (/retenciones_config|42P01|PGRST205/i.test(`${error.code ?? ''} ${error.message ?? ''}`)
    ? 'Falta crear la tabla de retenciones: correr el script sql/retenciones_config.sql.'
    : 'No se pudo guardar. Probá de nuevo.')
  async function handleGuardarRetenciones(clave, { retenciones, banco }) {
    const { error } = await supabase.from('retenciones_config').upsert({ clave, retenciones, banco }, { onConflict: 'clave' })
    if (error) return textoErrorRetenciones(error)
    await cargarAjustesRetenciones()
    return null
  }
  async function handleBorrarRetenciones(clave) {
    const { error } = await supabase.from('retenciones_config').delete().eq('clave', clave)
    if (error) return textoErrorRetenciones(error)
    await cargarAjustesRetenciones()
    return null
  }

  const selCls = `w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 text-slate-900 bg-white
    transition-shadow focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:border-teal-400`
  const lbCls = 'block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5'

  return (
    <div className={`min-h-screen flex flex-col ${CLASE_SIDEBAR}`} style={{ backgroundColor: '#f0f7fa' }}>
      <SidebarFinanzas perfil={perfil} activo="cashflow" />

      <main className="flex-1 w-full max-w-[1600px] px-6 lg:px-8 py-8">

        {/* Encabezado */}
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-slate-900 text-2xl font-extrabold tracking-tight">Cash Flow</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Posición financiera de la empresa — próximos {horizonte} días
            </p>
          </div>

          <button
            onClick={() => setMostrarFormMov(true)}
            className="shrink-0 inline-flex items-center gap-2 text-white text-sm font-semibold
                       px-5 py-2.5 rounded-xl transition-colors shadow-[0_6px_16px_rgba(14,116,144,0.28)]"
            style={{ backgroundColor: '#0e7490' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#164e63'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0e7490'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nuevo movimiento
          </button>
        </div>

        {/* Nuevo movimiento — en un modal para no mover el scroll de la tabla */}
        {mostrarFormMov && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-50 overflow-y-auto p-4 sm:p-8">
            <div className="w-full max-w-5xl mx-auto">
              <FormularioMovimiento
                obras={obras} rubros={rubros} cuentas={cuentas} debitos={debitos} fondos={fondos}
                userId={user.id}
                onGuardado={async () => { setMostrarFormMov(false); await cargarMovimientos({ silencioso: true }) }}
                onCancelar={() => setMostrarFormMov(false)}
              />
            </div>
          </div>
        )}

        {/* Indicador de refresco en segundo plano (no tapa la pantalla ni mueve el scroll) */}
        {actualizando && (
          <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-white shadow-md
                          border border-slate-100 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-500">
            <span className="w-3.5 h-3.5 border-2 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
            Actualizando…
          </div>
        )}

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

        {/* Cards de posición */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
          <CardPremium label="Saldo disponible hoy" valor={fmtARS(cards.saldoHoy)} icono={ico('billetera')} tono="teal"
            color={cards.saldoHoy >= 0 ? 'text-slate-900' : 'text-red-600'} subLabel="Todas las cuentas al día de hoy" />
          <CardPremium label="Posición a 30 días" valor={fmtARS(cards.pos30)} icono={ico('tendencia')} tono="teal"
            color={cards.pos30 >= 0 ? 'text-slate-900' : 'text-red-600'} subLabel={`Al ${fmtFecha(fechaFutura(30))}`} />
          <CardPremium label="Posición a 60 días" valor={fmtARS(cards.pos60)} icono={ico('calendario')} tono="teal"
            color={cards.pos60 >= 0 ? 'text-slate-900' : 'text-red-600'} subLabel={`Al ${fmtFecha(fechaFutura(60))}`} />
          <CardPremium label="Posición a 90 días" valor={fmtARS(cards.pos90)} icono={ico('calendario')} tono="teal"
            color={cards.pos90 >= 0 ? 'text-slate-900' : 'text-red-600'} subLabel={`Al ${fmtFecha(fechaFutura(90))}`} />
        </div>

        {/* Picos (máximo y mínimo dentro de lo filtrado) */}
        {puntosExtremos && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <CardPremium label="Punto más alto" valor={fmtARS(puntosExtremos.max.saldoAcumulado)} icono={ico('subir')} tono="emerald"
              color="text-emerald-600"
              subLabel={`El ${fmtFecha(puntosExtremos.max.fecha_pago)} — ${puntosExtremos.max.proveedor_cliente ?? puntosExtremos.max.concepto ?? ''}`} />
            <CardPremium label="Punto más bajo" valor={fmtARS(puntosExtremos.min.saldoAcumulado)} icono={ico('bajar')} tono="rose"
              color={puntosExtremos.min.saldoAcumulado >= 0 ? 'text-emerald-600' : 'text-red-600'}
              subLabel={`El ${fmtFecha(puntosExtremos.min.fecha_pago)} — ${puntosExtremos.min.proveedor_cliente ?? puntosExtremos.min.concepto ?? ''}`} />
          </div>
        )}

        {/* Filtros */}
        <div className={`${CARD} p-4 sm:p-5 mb-5`}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={lbCls}>Horizonte</label>
              <select value={horizonte} onChange={e => setHorizonte(Number(e.target.value))} className={selCls}>
                <option value={30}>Próximos 30 días</option>
                <option value={60}>Próximos 60 días</option>
                <option value={90}>Próximos 90 días</option>
                <option value={180}>Próximos 6 meses</option>
                <option value={365}>Próximo año</option>
              </select>
            </div>
            <div>
              <label className={lbCls}>Cuenta</label>
              <select value={filtroCuenta} onChange={e => setFiltroCuenta(e.target.value)} className={selCls}>
                <option value="">Todas las cuentas</option>
                {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className={lbCls}>Estado</label>
              <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className={selCls}>
                <option value="">Todos</option>
                <option value="proyectado">Solo proyectados</option>
                <option value="ejecutado">Solo ejecutados</option>
              </select>
            </div>
            <div>
              <label className={lbCls}>Categoría</label>
              <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} className={selCls}>
                <option value="">Todas</option>
                {Object.entries(LABEL_CAT).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={lbCls}>Fecha desde</label>
              <div className="flex gap-2">
                <input type="date" value={filtroFechaDesde} onChange={e => setFiltroFechaDesde(e.target.value)} className={selCls} />
                <button type="button" onClick={() => setFiltroFechaDesde(hoyISO())}
                  className="shrink-0 px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 bg-white
                             text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap">
                  Desde hoy
                </button>
                <button type="button" onClick={() => setFiltroFechaDesde('')} disabled={!filtroFechaDesde}
                  className="shrink-0 px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 bg-white
                             text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-default disabled:hover:bg-white">
                  Limpiar
                </button>
              </div>
            </div>
            <div className="sm:col-span-3">
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none">
                  <Icono {...ICONOS.buscar} className="w-4 h-4" />
                </span>
                <input type="text" value={filtroBusqueda} onChange={e => setFiltroBusqueda(e.target.value)}
                  placeholder="Buscar proveedor, factura, concepto u obra…" className={`${selCls} !pl-10`} />
              </div>
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
                          bg-white rounded-2xl border border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_20px_rgba(15,23,42,0.05)]">
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
            {puedeMoverGastos && (
              // Arriba queda una sola línea chica; el botón de mover está en la barra que flota abajo (ver más abajo).
              <div className={`${CARD} px-4 py-2.5 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2`}>
                <p className="text-sm font-bold text-slate-900"
                  title={`Tildá gastos proyectados en la tabla y movelos con la barra de abajo. Topes: ${fmtARS(NIVELACION_DIARIA.topeMiercoles)} los miércoles y ${fmtARS(NIVELACION_DIARIA.topeOtroDia)} los otros días. Lo que movés tiene prioridad sobre lo automático; si el día se llena, lo que sobra pasa solo al siguiente día con lugar. Las facturas no se mueven.`}>
                  Mover gastos proyectados
                </p>
                <p className="text-xs text-slate-400">Tildá los gastos en la tabla. La barra para moverlos aparece abajo.</p>
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs font-semibold text-slate-500">Elegir todos los del día</span>
                  <input type="date" value={fechaOrigenMover} onChange={e => setFechaOrigenMover(e.target.value)}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/25" />
                  <button onClick={handleElegirDelDia}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                    Elegir
                  </button>
                </div>
                {errorMover && resumenSeleccionMover.lineas === 0 && <p className="basis-full text-xs text-red-600 font-semibold">{errorMover}</p>}
              </div>
            )}
            <TablaCashFlow
              puedeEditarRetenciones={puedeEditarRetenciones}
              tablaRetencionesFaltante={tablaRetencionesFaltante}
              onGuardarRetenciones={handleGuardarRetenciones}
              onBorrarRetenciones={handleBorrarRetenciones}
              seleccionMover={puedeMoverGastos ? seleccionMover : null}
              onAlternarSeleccionMover={alternarSeleccionMover}
              filas={filasFiltradas}
              saldoInicial={saldoInicial}
              obras={obras}
              rubros={rubros}
              filaEditando={filaEditando}
              valoresEdicion={valoresEdicion}
              guardandoEdicion={guardandoEdicion}
              errorEdicion={errorEdicion}
              onIniciarEdicion={handleIniciarEdicion}
              onCambiarEdicion={cambios => setValoresEdicion(v => ({ ...v, ...cambios }))}
              onGuardarEdicion={handleGuardarEdicion}
              onCancelarEdicion={handleCancelarEdicion}
              onBorrarEdicion={handleBorrarEdicion}
              onNotas={mov => setModalNotas(mov)}
              movimientosBase={movimientos}
              presupuestosBase={presupuestos}
              editorEnDetalle={editorEnDetalle}
              onEditarDesdeDetalle={handleEditarDesdeDetalle}
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
              filaEditandoFecha={filaEditandoFecha}
              nuevaFechaEstimada={nuevaFechaEstimada}
              nuevoConceptoVenta={nuevoConceptoVenta}
              guardandoFecha={guardandoFecha}
              errorFecha={errorFecha}
              onIniciarEditarFecha={handleIniciarEditarFecha}
              onCambiarFechaEstimada={setNuevaFechaEstimada}
              onCambiarConceptoVenta={setNuevoConceptoVenta}
              onGuardarFecha={handleGuardarFecha}
              onGuardarDivision={handleGuardarDivision}
              onQuitarDivision={handleQuitarDivision}
              onCancelarEditarFecha={handleCancelarEditarFecha}
              onCerrarProyeccion={handleCerrarProyeccion}
            />

            {/* Pie de totales */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className={`${CARD} px-5 py-4`}>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total ingresos</p>
                <p className="text-emerald-600 font-bold text-lg tabular-nums mt-0.5">{fmtARS(totales.ingresos)}</p>
              </div>
              <div className={`${CARD} px-5 py-4`}>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total egresos</p>
                <p className="text-rose-600 font-bold text-lg tabular-nums mt-0.5">{fmtARS(totales.egresos)}</p>
              </div>
              <div className={`${CARD} px-5 py-4`}>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Diferencia</p>
                <p className={`font-extrabold text-lg tabular-nums mt-0.5 ${totales.diferencia >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {fmtARS(totales.diferencia)}
                </p>
              </div>
            </div>
          </>
        )}

        {/* Configuración de débitos automáticos (plegable: casi no se toca) */}
        <div className="mt-10">
          <button
            onClick={() => setMostrarDebitos(v => !v)}
            className={`${CARD} w-full flex items-center justify-between gap-3 px-5 py-4 text-left transition-shadow hover:shadow-md`}
          >
            <span className="flex items-center gap-3.5">
              <span className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${TONOS.amber}`}>
                <Icono {...ICONOS.calendario} />
              </span>
              <span>
                <span className="block text-sm font-bold text-slate-900">Débitos automáticos</span>
                <span className="block text-xs text-slate-400 mt-0.5">Configuración de servicios recurrentes</span>
              </span>
            </span>
            <span className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
              <span className={`transition-transform duration-200 text-slate-400 ${mostrarDebitos ? 'rotate-180' : ''}`}>
                <IconChevronDown />
              </span>
            </span>
          </button>
          {mostrarDebitos && (
            <SeccionDebitos
              debitos={debitos} rubros={rubros} obras={obras} userId={user.id}
              onActualizado={cargarDebitos}
            />
          )}
        </div>
      </main>

      {/* Barra flotante para mover los gastos tildados: queda siempre a la vista, sin tener que subir. Solo Santiago. */}
      {puedeMoverGastos && resumenSeleccionMover.lineas > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto max-w-full rounded-2xl bg-white border border-slate-200 px-4 py-3
                          shadow-[0_10px_40px_rgba(15,23,42,0.22)]">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 tabular-nums">
                  {resumenSeleccionMover.lineas} {resumenSeleccionMover.lineas === 1 ? 'gasto elegido' : 'gastos elegidos'}
                  <span className="text-slate-500 font-semibold"> · {fmtARS(resumenSeleccionMover.monto)}</span>
                </p>
                <p className="text-[11px] text-slate-400">Si una línea está en partes, solo se mueven las que tildaste.</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500 mr-1">Mover a</span>
                {proximosMiercoles.map(w => (
                  <button key={w.iso} onClick={() => { setFechaDestinoMover(w.iso); setErrorMover('') }}
                    className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors
                      ${fechaDestinoMover === w.iso ? 'bg-cyan-700 text-white border-cyan-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    title={`Miércoles ${w.etiqueta}`}>
                    Mié {w.etiqueta}
                  </button>
                ))}
                <input type="date" value={fechaDestinoMover} onChange={e => { setFechaDestinoMover(e.target.value); setErrorMover('') }}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/25" />
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <button onClick={() => { setSeleccionMover(new Set()); setErrorMover('') }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-2">
                  Limpiar
                </button>
                <button onClick={handleMoverGastos} disabled={moviendoGastos}
                  className="text-sm font-semibold text-white px-5 py-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#0e7490' }}>
                  {moviendoGastos ? 'Moviendo…' : 'Mover'}
                </button>
              </div>
            </div>
            {errorMover && <p className="text-xs text-red-600 font-semibold mt-2">{errorMover}</p>}
          </div>
        </div>
      )}

      {modalNotas && (
        <ModalNotas
          movimiento={modalNotas} userId={user.id}
          onCerrar={() => { setModalNotas(null); cargarMovimientos({ silencioso: true }) }}
        />
      )}
    </div>
  )
}

// ─── Tabla ────────────────────────────────────────────────────────────────────

function TablaCashFlow({
  puedeEditarRetenciones, tablaRetencionesFaltante, onGuardarRetenciones, onBorrarRetenciones,
  seleccionMover, onAlternarSeleccionMover,
  filas, saldoInicial, obras, rubros,
  movimientosBase, presupuestosBase, editorEnDetalle, onEditarDesdeDetalle,
  filaEditando, valoresEdicion, guardandoEdicion, errorEdicion,
  onIniciarEdicion, onCambiarEdicion, onGuardarEdicion, onCancelarEdicion, onBorrarEdicion, onNotas,
  filaAjustando, valorAjuste, guardandoAjuste, errorAjuste,
  onIniciarAjuste, onCambiarAjuste, onGuardarAjuste, onCancelarAjuste,
  filaProyeccion, nuevaFechaProyeccion, guardandoProyeccion, errorProyeccion,
  onIniciarProyeccion, onCambiarNuevaFecha, onGuardarProyeccion, onCancelarProyeccion,
  filaEditandoFecha, nuevaFechaEstimada, nuevoConceptoVenta, guardandoFecha, errorFecha,
  onIniciarEditarFecha, onCambiarFechaEstimada, onCambiarConceptoVenta, onGuardarFecha, onGuardarDivision, onQuitarDivision, onCancelarEditarFecha, onCerrarProyeccion,
}) {
  // Detalle de lo registrado contra cada línea gris (gasto o venta proyectada): se abre con "Ver detalle".
  const [detalleAbierto, setDetalleAbierto] = useState(() => new Set())
  const indiceRegistrado = useMemo(() => indexarRegistrado(movimientosBase), [movimientosBase])
  const alternarDetalle = id => setDetalleAbierto(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  // Desplegable de retenciones e impuestos de cada venta (detalle y edición).
  const [retencionesAbiertas, setRetencionesAbiertas] = useState(() => new Set())
  const alternarRetenciones = id => setRetencionesAbiertas(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const cantidadRegistrada = m => (m.categoria === 'venta_proyectada'
    ? indiceRegistrado.ventas[`${m.obra_id}|${m.periodo}`]
    : indiceRegistrado.facturas[`${m.obra_id}|${m.rubro_id}|${m.periodo}`])?.length ?? 0

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
    <div className={`${CARD} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70">
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

              if (filaEditando === m.id && !editorEnDetalle) {
                return (
                  <FilaEdicionMovimiento
                    key={fila.key}
                    mov={m}
                    obras={obras}
                    rubros={rubros}
                    valores={valoresEdicion}
                    guardando={guardandoEdicion}
                    error={errorEdicion}
                    onChange={onCambiarEdicion}
                    onGuardar={() => onGuardarEdicion(m.id)}
                    onCancelar={onCancelarEdicion}
                    onBorrar={() => onBorrarEdicion(m.id)}
                    onNotas={() => onNotas(m)}
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

              if (filaEditandoFecha === m.id) {
                return (
                  <FilaEditarFechaEstimada
                    key={fila.key}
                    mov={m}
                    nuevaFecha={nuevaFechaEstimada}
                    nuevoConcepto={nuevoConceptoVenta}
                    guardando={guardandoFecha}
                    error={errorFecha}
                    onChangeFecha={onCambiarFechaEstimada}
                    onChangeConcepto={onCambiarConceptoVenta}
                    onGuardar={() => onGuardarFecha(m)}
                    onGuardarDivision={partes => onGuardarDivision(m, partes)}
                    onQuitarDivision={() => onQuitarDivision(m)}
                    onCancelar={onCancelarEditarFecha}
                    onCerrar={() => onCerrarProyeccion(m)}
                  />
                )
              }

              const esLinea = m._virtual && (m.categoria === 'gasto_proyectado' || m.categoria === 'venta_proyectada')
              const abierto = esLinea && detalleAbierto.has(m.id)
              return (
                <Fragment key={fila.key}>
                <tr
                  className={`border-b border-slate-100/80 last:border-0 transition-colors
                    ${m._virtual ? 'bg-slate-50/40' : saldoNeg ? 'bg-red-50/60' : 'hover:bg-slate-50/60'}`}>
                  <td className="px-3.5 py-3.5 text-slate-500 text-xs whitespace-nowrap">
                    {seleccionMover && m._virtual && m.categoria === 'gasto_proyectado' && m._claveFecha && (
                      <input type="checkbox" className="mr-2 align-middle accent-cyan-700"
                        title="Elegir para moverlo junto con otros gastos proyectados"
                        checked={seleccionMover.has(m.id)}
                        onChange={() => onAlternarSeleccionMover(m.id)} />
                    )}
                    {fmtFecha(m.fecha_pago)}
                  </td>
                  <td className="px-3.5 py-3.5">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg
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
                  <td className="px-3.5 py-3.5">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg
                      ${BADGE_CAT[m.categoria] ?? 'bg-slate-100 text-slate-600'}`}>
                      {LABEL_CAT[m.categoria] ?? m.categoria}
                    </span>
                  </td>
                  <td className="px-3.5 py-3.5 text-slate-700 max-w-[180px]">
                    {m.categoria === 'gasto_proyectado' ? (
                      <span className="truncate block italic text-slate-500"
                        title={`Presupuestado: ${fmtARS(m._presupuestado)} — Ya facturado: ${fmtARS(m._gastoReal)}`}>
                        {m.rubros?.nombre ?? 'Rubro'} — saldo sin facturar
                        <span className="block not-italic text-slate-600 font-medium uppercase">Período {periodoCorto(m.periodo)}</span>
                        {m._gastoReal > 0
                          ? <span className="block not-italic text-slate-500">Ya facturado: {fmtARS(m._gastoReal)} de {fmtARS(m._presupuestado)}</span>
                          : <span className="block not-italic text-slate-400">Sin facturas cargadas</span>}
                        {m._partes > 1 && (
                          <span className="block not-italic text-cyan-700 font-semibold">
                            Parte {m._parte} de {m._partes}{m._porcentaje ? ` · ${m._porcentaje}%` : ''}
                          </span>
                        )}
                      </span>
                    ) : m.categoria === 'venta_proyectada' ? (
                      <span className="truncate block italic text-slate-500">
                        Venta proyectada de {labelPeriodo(m.periodo)}
                        {m._conceptoManual && (
                          <span className="block not-italic text-slate-600 font-medium">{m._conceptoManual}</span>
                        )}
                        {m._partes > 1 && (
                          <span className="block not-italic text-cyan-700 font-semibold">
                            Parte {m._parte} de {m._partes}{m._porcentaje ? ` · ${m._porcentaje}%` : ''}
                          </span>
                        )}
                        {m._gastoReal > 0
                          ? <span className="block not-italic text-slate-500">Ya registrado: {fmtARS(m._gastoReal)} de {fmtARS(m._presupuestado)}</span>
                          : <span className="block not-italic text-slate-400">Nada registrado todavía</span>}
                        {m._afectaCashflow === false && (
                          <span className="block not-italic text-amber-600 font-medium" title="Período anterior al mes en curso: se muestra como dato, pero no suma ni resta en el saldo del Cash Flow">
                            No afecta el saldo (período pasado)
                          </span>
                        )}
                      </span>
                    ) : m._impuestoVenta ? (
                      <span className="truncate block italic text-slate-500" title="Se calcula solo sobre el cobro de esa venta: IIBB 3%, SUSS 2%, Ganancias 2% y Ley 25413 0,6% (créditos). A NEC se le suma una fila de retenciones hasta llegar al 22,2% en total (retenciones reales de sus recibos más impuestos del banco).">
                        {m._impuestoEtiqueta} {Math.round(m._tasa * 10000) / 100}% s/ cobro
                        <span className="block not-italic text-slate-400">
                          de {fmtARS(m._baseCobro)}{m._clienteVenta ? ` · ${m._clienteVenta}` : ''}
                        </span>
                      </span>
                    ) : (
                      <span className="truncate block" title={m.proveedor_cliente ?? m.concepto ?? ''}>
                        {m.proveedor_cliente ?? m.concepto ?? '—'}
                      </span>
                    )}
                    {m.numero_factura && (
                      <span className="text-xs text-slate-400 block">Nº {m.numero_factura}</span>
                    )}
                    {m._retenciones && m.tipo === 'ingreso' && (
                      <button onClick={() => alternarRetenciones(m.id)}
                        title="Ver el detalle de la factura, las retenciones y los impuestos, y editarlos"
                        className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-800 transition-colors">
                        <span className="inline-block w-3">{retencionesAbiertas.has(m.id) ? '▾' : '▸'}</span>
                        Retenciones e impuestos: −{fmtARS(m._brutoFC - m.montoEfectivo)}
                        {m._retenciones.fuente !== 'estandar' && <span className="ml-1 rounded bg-amber-100 text-amber-800 px-1.5 py-px font-semibold">ajustado</span>}
                      </button>
                    )}
                  </td>
                  <td className="px-3.5 py-3.5 text-slate-400 text-xs whitespace-nowrap">
                    {m.obras?.codigo ?? '—'}
                  </td>
                  <td className="px-3.5 py-3.5 text-right tabular-nums whitespace-nowrap">
                    {m.tipo === 'ingreso'
                      ? <>
                          <span className={m.estado_proyeccion === 'no_cumple' ? 'text-slate-300 font-semibold line-through' : m._virtual ? 'text-slate-400 font-semibold' : 'text-emerald-600 font-semibold'}
                            title={m._retenciones ? 'Neto estimado: lo que queda después de las retenciones y los impuestos del banco' : undefined}>{fmtARS(m.montoEfectivo)}</span>
                          {m._retenciones && <span className="block text-[10px] text-slate-400 font-normal">FC {fmtARS(m._brutoFC)} · neto</span>}
                        </>
                      : <span className="text-slate-200 text-xs">—</span>}
                  </td>
                  <td className="px-3.5 py-3.5 text-right tabular-nums whitespace-nowrap">
                    {m.tipo === 'egreso'
                      ? <span className={m.estado_proyeccion === 'no_cumple' ? 'text-slate-300 font-semibold line-through' : m._virtual ? 'text-slate-400 font-semibold' : 'text-rose-600 font-semibold'}>{fmtARS(m.montoEfectivo)}</span>
                      : <span className="text-slate-200 text-xs">—</span>}
                  </td>
                  <td className="px-3.5 py-3.5 text-right tabular-nums whitespace-nowrap">
                    <span className={`inline-block font-bold text-sm px-2.5 py-1 rounded-lg ${saldoNeg ? 'text-rose-600 bg-rose-50' : 'text-slate-900'}`}
                      title={saldoNeg ? 'Saldo negativo' : undefined}>
                      {fmtARS(m.saldoAcumulado)}
                    </span>
                  </td>
                  <td className="px-3.5 py-3.5 text-right whitespace-nowrap">
                    {m._impuestoVenta ? (
                      <span className="text-xs text-slate-400 italic" title="Se calcula solo: tasa × importe de la venta. Cuando se cobra, se cargan los impuestos reales del extracto.">Calculado</span>
                    ) : m._virtual ? (
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => alternarDetalle(m.id)}
                          title="Ver qué facturas o ventas ya están registradas contra esta línea, para revisarlas y corregir lo que esté mal cargado"
                          className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
                        >
                          {abierto ? 'Ocultar detalle' : `Ver detalle (${cantidadRegistrada(m)})`}
                        </button>
                        <button
                          onClick={() => onIniciarEditarFecha(m)}
                          disabled={filaEditandoFecha !== null}
                          title="Estimado por Operaciones — podés ajustar la fecha o dividirlo en partes"
                          className="text-xs font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          style={{ color: '#0e7490' }}
                        >
                          Editar / dividir
                        </button>
                        <button
                          onClick={() => onCerrarProyeccion(m)}
                          disabled={filaEditandoFecha !== null}
                          title="El saldo restante deja de aparecer en el Cash Flow. No borra el presupuesto/venta original."
                          className="text-xs font-semibold text-red-600 hover:text-red-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Cerrar proyección
                        </button>
                      </div>
                    ) : (
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
                    )}
                  </td>
                </tr>
                {abierto && (
                  <FilasDesglose
                    m={m} movimientos={movimientosBase} indice={indiceRegistrado} presupuestos={presupuestosBase}
                    obras={obras} rubros={rubros}
                    filaEditando={filaEditando} editorEnDetalle={editorEnDetalle} valoresEdicion={valoresEdicion}
                    guardandoEdicion={guardandoEdicion} errorEdicion={errorEdicion}
                    onCambiarEdicion={onCambiarEdicion} onGuardarEdicion={onGuardarEdicion} onCancelarEdicion={onCancelarEdicion}
                    onBorrarEdicion={onBorrarEdicion} onNotas={onNotas} onEditar={onEditarDesdeDetalle}
                  />
                )}
                {m._retenciones && m.tipo === 'ingreso' && retencionesAbiertas.has(m.id) && (
                  <FilaRetenciones
                    m={m} puedeEditar={puedeEditarRetenciones} tablaFaltante={tablaRetencionesFaltante}
                    onGuardar={onGuardarRetenciones} onBorrar={onBorrarRetenciones}
                  />
                )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Retenciones e impuestos de una venta: desplegable con el detalle y edición ─────────────────────
// Muestra la factura (bruto), lo que retiene el cliente, lo que le saca el banco y el neto que queda. Se puede cambiar la alícuota,
// agregar o sacar retenciones, para esa venta o para todas las ventas del cliente (se guardan en retenciones_config).

// Pasa las retenciones de la pantalla (texto) a la forma que se guarda y se calcula.
const aBorradorRet = items => items.map(it => ({
  clave: it.clave, etiqueta: it.etiqueta, base: it.base, esIVA: !!it.esIVA,
  valor: it.base === 'monto' ? String(it.monto ?? 0) : String(Math.round(it.tasa * 10000) / 100).replace('.', ','),
}))
const numeroDe = t => Number(String(t ?? '').replace(/\./g, '').replace(',', '.'))
const desdeBorradorRet = (lista, baseFija = null) => lista.map((it, i) => {
  const n = numeroDe(it.valor)
  const base = baseFija ?? it.base
  return { clave: it.clave || `extra_${i}`, etiqueta: it.etiqueta.trim(), base, esIVA: !!it.esIVA, ...(base === 'monto' ? { monto: n } : { tasa: n / 100 }) }
})
const mensajeInvalido = lista => {
  for (const it of lista) {
    const n = numeroDe(it.valor)
    if (!it.etiqueta.trim()) return 'Poné un nombre a cada retención (o sacala con la ✕).'
    if (!Number.isFinite(n) || n < 0) return `Revisá el valor de "${it.etiqueta}": tiene que ser un número mayor o igual a cero.`
    if (it.base !== 'monto' && n > 100) return `Revisá el porcentaje de "${it.etiqueta}": no puede pasar de 100.`
  }
  return ''
}

function FilaRetenciones({ m, puedeEditar, tablaFaltante, onGuardar, onBorrar }) {
  const r = m._retenciones
  const [editando, setEditando] = useState(false)
  const [ret, setRet] = useState([])
  const [banco, setBanco] = useState([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const empezar = () => { setRet(aBorradorRet(r.retenciones)); setBanco(aBorradorRet(r.banco)); setError(''); setEditando(true) }
  const cambiar = (set, i, campo, valor) => set(lista => lista.map((it, j) => (j === i ? { ...it, [campo]: valor } : it)))
  const agregar = () => setRet(lista => [...lista, { clave: '', etiqueta: '', base: 'neto', esIVA: false, valor: '' }])

  // Vista previa del neto con lo que se está editando (no guarda nada hasta apretar un botón de guardar).
  const vista = useMemo(() => {
    if (!editando) return r
    const itemsRet = normalizarItems(desdeBorradorRet(ret.filter(it => !mensajeInvalido([it])))) ?? []
    const itemsBanco = normalizarItems(desdeBorradorRet(banco.filter(it => !mensajeInvalido([it])), 'acreditado'), 'acreditado') ?? []
    return desgloseDeCobro(m._brutoFC, { retenciones: itemsRet, banco: itemsBanco })
  }, [editando, ret, banco, r, m._brutoFC])

  async function guardar(clave) {
    const msg = mensajeInvalido([...ret, ...banco])
    if (msg) { setError(msg); return }
    setGuardando(true); setError('')
    let e = await onGuardar(clave, { retenciones: desdeBorradorRet(ret), banco: desdeBorradorRet(banco, 'acreditado') })
    // Si se guarda para todo el cliente y esta venta tenía un ajuste propio, se saca: si no, seguiría mandando el de la venta.
    if (!e && clave === r.claveCliente && r.fuente === 'venta') e = await onBorrar(r.claveVenta)
    setGuardando(false)
    if (e) setError(e); else setEditando(false)
  }
  async function volverAEstandar() {
    const clave = r.fuente === 'venta' ? r.claveVenta : r.claveCliente
    if (!clave) return
    setGuardando(true); setError('')
    const e = await onBorrar(clave)
    setGuardando(false)
    if (e) setError(e); else setEditando(false)
  }

  const fuenteTexto = r.fuente === 'venta' ? 'Ajustado para esta venta'
    : r.fuente === 'cliente' ? `Ajustado para todas las ventas de ${r.perfil}` : `Valores estándar de ${r.perfil}`
  const linea = (etiqueta, detalle, valor, { fuerte = false, resta = false, nota = null } = {}) => (
    <div className={`flex items-baseline gap-3 py-1 ${fuerte ? 'border-t border-amber-200 mt-1 pt-1.5' : ''}`}>
      <span className={`flex-1 min-w-0 ${fuerte ? 'font-bold text-slate-800' : 'text-slate-700'}`}>
        {etiqueta}
        {detalle && <span className="text-slate-400 text-[11px] font-normal"> · {detalle}</span>}
        {nota && <span className="ml-2 text-emerald-600 text-[11px] font-semibold">{nota}</span>}
      </span>
      <span className={`tabular-nums whitespace-nowrap ${fuerte ? 'font-bold text-slate-900' : resta ? 'text-rose-600' : 'text-slate-700'}`}>{resta ? '−' : ''}{fmtARS(valor)}</span>
    </div>
  )
  const inputCls = 'px-2 py-1 text-xs rounded-md border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/25'

  return (
    <tr style={{ backgroundColor: '#fffbeb' }} className="border-b border-amber-100">
      <td colSpan={9} className="px-4 py-3">
        <div className="max-w-[780px] ml-6 text-xs">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <p className="font-bold text-slate-800">Retenciones e impuestos estimados · {r.perfil}</p>
            <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-px text-[11px] font-semibold">{fuenteTexto}</span>
            {puedeEditar && !editando && (
              <button onClick={empezar} disabled={tablaFaltante} className="ml-auto font-semibold disabled:opacity-40" style={{ color: '#0e7490' }}>Editar retenciones</button>
            )}
          </div>
          {tablaFaltante && <p className="text-amber-700 mb-1">Para poder guardar cambios hay que crear la tabla de retenciones (script sql/retenciones_config.sql).</p>}

          {!editando ? (
            <>
              {linea('Factura (con IVA)', null, m._brutoFC, { fuerte: false })}
              {linea('Importe sin IVA', null, vista.neto)}
              {linea('IVA de la factura', null, vista.iva)}
              <p className="mt-1.5 mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Retenciones del cliente</p>
              {vista.retenciones.length === 0 && <p className="text-slate-400 py-1">Sin retenciones.</p>}
              {vista.retenciones.map(it => linea(it.etiqueta, it.detalle, it.monto, { resta: true, nota: it.esIVA ? 'adelanto de IVA: queda a favor' : null }))}
              {linea('Entra al banco', null, vista.alBanco, { fuerte: true })}
              <p className="mt-1.5 mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Impuestos del banco</p>
              {vista.banco.map(it => linea(it.etiqueta, it.detalle, it.monto, { resta: true }))}
              {linea('Neto disponible', null, vista.disponible, { fuerte: true })}
            </>
          ) : (
            <>
              <p className="mt-1 mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Retenciones del cliente</p>
              {ret.length === 0 && <p className="text-slate-400 py-1">Sin retenciones (agregá una abajo).</p>}
              {ret.map((it, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 py-1">
                  <input className={`${inputCls} w-52`} value={it.etiqueta} placeholder="Nombre (ej.: IIBB Córdoba)" onChange={e => cambiar(setRet, i, 'etiqueta', e.target.value)} />
                  <select className={inputCls} value={it.base} onChange={e => cambiar(setRet, i, 'base', e.target.value)}>
                    {Object.entries(BASES_RETENCION).map(([k, txt]) => <option key={k} value={k}>{k === 'monto' ? txt : `% del ${txt.toLowerCase()}`}</option>)}
                  </select>
                  <span className="flex items-center gap-1">
                    {it.base === 'monto' && <span className="text-slate-400">$</span>}
                    <input className={`${inputCls} w-24 text-right`} inputMode="decimal" value={it.valor} onChange={e => cambiar(setRet, i, 'valor', e.target.value)} />
                    {it.base !== 'monto' && <span className="text-slate-400">%</span>}
                  </span>
                  <label className="flex items-center gap-1 text-slate-500" title="Marcá si es una retención de IVA: queda como adelanto de IVA a favor">
                    <input type="checkbox" checked={it.esIVA} onChange={e => cambiar(setRet, i, 'esIVA', e.target.checked)} /> es de IVA
                  </label>
                  <button onClick={() => setRet(lista => lista.filter((_, j) => j !== i))} className="text-rose-500 hover:text-rose-700 font-bold px-1" title="Sacar esta retención">✕</button>
                </div>
              ))}
              <button onClick={agregar} className="mt-1 font-semibold" style={{ color: '#0e7490' }}>+ Agregar retención</button>

              <p className="mt-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Impuestos del banco (sobre lo que acredita)</p>
              {banco.map((it, i) => (
                <div key={it.clave} className="flex items-center gap-2 py-1">
                  <span className="w-52 text-slate-700">{it.etiqueta}</span>
                  <input className={`${inputCls} w-24 text-right`} inputMode="decimal" value={it.valor} onChange={e => cambiar(setBanco, i, 'valor', e.target.value)} />
                  <span className="text-slate-400">%</span>
                </div>
              ))}

              <div className="mt-3 rounded-lg bg-white border border-amber-200 px-3 py-2">
                {linea('Retenido', null, vista.totalRetenido, { resta: true })}
                {linea('Impuestos del banco', null, vista.bancoImpuestos, { resta: true })}
                {linea('Neto disponible con estos cambios', null, vista.disponible, { fuerte: true })}
              </div>
              {error && <p className="text-rose-600 font-semibold mt-2">{error}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button onClick={() => guardar(r.claveVenta)} disabled={guardando}
                  className="font-semibold text-white px-3.5 py-1.5 rounded-lg disabled:opacity-50" style={{ backgroundColor: '#0e7490' }}>
                  {guardando ? 'Guardando…' : 'Guardar solo para esta venta'}
                </button>
                {r.claveCliente && (
                  <button onClick={() => guardar(r.claveCliente)} disabled={guardando}
                    className="font-semibold px-3.5 py-1.5 rounded-lg border border-cyan-700 text-cyan-800 hover:bg-cyan-50 disabled:opacity-50">
                    Guardar para todas las ventas de {r.perfil}
                  </button>
                )}
                {r.fuente !== 'estandar' && (
                  <button onClick={volverAEstandar} disabled={guardando} className="font-semibold text-amber-700 hover:text-amber-900 px-2 py-1.5 disabled:opacity-50">
                    Volver a los valores estándar
                  </button>
                )}
                <button onClick={() => { setEditando(false); setError('') }} disabled={guardando} className="font-semibold text-slate-500 hover:text-slate-800 px-2 py-1.5">Cancelar</button>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Detalle de lo registrado contra una línea gris ──────────────────────────────────────────────

const MOTIVO_CANDIDATO = {
  otro_rubro:   'Misma obra y período, pero cargada en otro rubro',
  otro_periodo: 'Misma obra, pero cargada en otro período',
  otra_obra:    'Mismo rubro y período, pero en otra obra que no tiene presupuesto de eso',
}

// Filas que se abren debajo de un gasto proyectado o una venta proyectada: lo que el Cash Flow ya descuenta de esa línea
// (misma obra + rubro + período, o obra + período en ventas) y lo que NO descuenta pero podría ser de ella. Cada fila se
// puede corregir con "Editar" (obra, rubro, período, importe...) y la línea se recalcula sola al guardar.
function FilasDesglose({ m, movimientos, indice, presupuestos, obras, rubros, filaEditando, editorEnDetalle, valoresEdicion,
  guardandoEdicion, errorEdicion, onCambiarEdicion, onGuardarEdicion, onCancelarEdicion, onBorrarEdicion, onNotas, onEditar }) {
  const esVenta = m.categoria === 'venta_proyectada'
  const { cuenta, total, candidatos } = desgloseDeLinea(m._claveFecha, movimientos, indice, presupuestos, esVenta ? 'venta' : 'gasto')
  const [verTodos, setVerTodos] = useState(false)
  const rubroDe = id => rubros.find(x => x.id === id)?.nombre ?? 'sin rubro'
  const obraDe = id => obras.find(x => x.id === id)?.codigo ?? '—'
  const visibles = verTodos ? candidatos : candidatos.slice(0, 8)
  const palabra = esVenta ? 'ventas' : 'facturas'

  const fila = (mov, motivo) => {
    if (filaEditando === mov.id && editorEnDetalle) {
      return (
        <FilaEdicionMovimiento
          key={mov.id} mov={mov} obras={obras} rubros={rubros} valores={valoresEdicion}
          guardando={guardandoEdicion} error={errorEdicion} onChange={onCambiarEdicion}
          onGuardar={() => onGuardarEdicion(mov.id)} onCancelar={onCancelarEdicion}
          onBorrar={() => onBorrarEdicion(mov.id)} onNotas={() => onNotas(mov)}
        />
      )
    }
    return (
      <tr key={mov.id} style={{ backgroundColor: '#fbfdfe' }} className="border-b border-slate-100">
        <td colSpan={9} className="px-4 py-2">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs pl-6">
            <span className="text-slate-500 w-20">{mov.fecha_pago ? fmtFecha(mov.fecha_pago) : 'sin fecha'}</span>
            <span className={`font-semibold px-2 py-0.5 rounded-md ${mov.estado === 'ejecutado' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {mov.estado === 'ejecutado' ? 'Ejecutado' : 'Proyectado'}
            </span>
            <span className="text-slate-800 font-semibold min-w-[180px]">{mov.proveedor_cliente ?? mov.concepto ?? '—'}{mov.numero_factura ? <span className="font-normal text-slate-400"> · Nº {mov.numero_factura}</span> : null}</span>
            <span className="text-slate-500">Obra {obraDe(mov.obra_id)} · {rubroDe(mov.rubro_id)} · período {mov.periodo ? mov.periodo.slice(0, 7) : '—'}</span>
            <span className="tabular-nums font-semibold text-slate-700 ml-auto">{fmtARS(mov.monto_bruto)}</span>
            <button onClick={() => onEditar(mov)} disabled={filaEditando !== null}
              className="font-semibold disabled:opacity-30 disabled:cursor-not-allowed" style={{ color: '#0e7490' }}>Editar</button>
          </div>
          {motivo && <p className="text-[11px] text-amber-700 pl-6 mt-0.5">{MOTIVO_CANDIDATO[motivo]}.</p>}
        </td>
      </tr>
    )
  }

  return (
    <>
      <tr style={{ backgroundColor: '#f1f7fa' }} className="border-b border-slate-200">
        <td colSpan={9} className="px-4 py-3">
          <p className="text-xs font-bold text-slate-700">
            Lo que ya está registrado contra esta línea: {fmtARS(total)} de {fmtARS(m._presupuestado ?? 0)}
            <span className="font-normal text-slate-500"> · {cuenta.length} {cuenta.length === 1 ? (esVenta ? 'venta' : 'factura') : palabra} · falta {fmtARS(Math.max(0, (m._presupuestado ?? 0) - total))}</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {esVenta
              ? 'Son las ventas cargadas con la misma obra y período. Se restan de lo que proyectó Operaciones.'
              : 'Son las facturas cargadas con la misma obra, rubro y período. Se restan del presupuesto de Operaciones: lo que queda es el gasto proyectado.'}
            {' '}Si falta alguna o hay una de más, corregí su obra, rubro o período con "Editar" y la línea se recalcula sola.
          </p>
        </td>
      </tr>
      {cuenta.length === 0 && (
        <tr style={{ backgroundColor: '#fbfdfe' }} className="border-b border-slate-100">
          <td colSpan={9} className="px-4 py-2.5 text-xs text-slate-400 pl-10">No hay ninguna {esVenta ? 'venta' : 'factura'} registrada contra esta línea.</td>
        </tr>
      )}
      {cuenta.map(mov => fila(mov, null))}
      {candidatos.length > 0 && (
        <tr style={{ backgroundColor: '#fffbeb' }} className="border-b border-amber-100">
          <td colSpan={9} className="px-4 py-2.5">
            <p className="text-xs font-bold text-amber-800">
              Cargadas que NO se descuentan pero podrían ser de esta línea ({candidatos.length})
              <span className="font-normal text-amber-700"> — si alguna es de esta obra, rubro y período, corregila con "Editar".</span>
            </p>
          </td>
        </tr>
      )}
      {visibles.map(c => fila(c.mov, c.motivo))}
      {candidatos.length > visibles.length && (
        <tr style={{ backgroundColor: '#fffbeb' }} className="border-b border-amber-100">
          <td colSpan={9} className="px-4 py-2 pl-10">
            <button onClick={() => setVerTodos(true)} className="text-xs font-semibold" style={{ color: '#0e7490' }}>Ver las {candidatos.length - visibles.length} restantes</button>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function FilaSeparador({ label, saldoInicio }) {
  return (
    <tr className="bg-sky-50/80 border-y border-sky-100">
      <td colSpan={5} className="px-4 py-2.5">
        <span className="text-[13px] font-bold tracking-wide" style={{ color: '#0e7490' }}>
          {label}
        </span>
      </td>
      <td colSpan={2} className="px-4 py-2.5 text-right">
        <span className="text-[11px] font-medium text-slate-400">Saldo al inicio del mes</span>
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        <span className={`text-xs font-bold ${saldoInicio < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
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
                        transition-shadow focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:border-teal-400"
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
                          transition-shadow focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:border-teal-400"
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

function sumarDias(fechaISO, dias) {
  const d = new Date(`${fechaISO}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// n partes iguales (al centavo de porcentaje: la última absorbe el resto), una por semana desde la fecha base.
function partesIguales(n, fechaBase) {
  const base = Math.floor(10000 / n)
  return Array.from({ length: n }, (_, i) => ({
    porcentaje: String((i === n - 1 ? 10000 - base * (n - 1) : base) / 100),
    fecha: fechaBase ? sumarDias(fechaBase, 7 * i) : '',
  }))
}

const numPct = v => Number(String(v ?? '').replace(',', '.'))

// Editor de una fila gris (gasto o venta proyectada): una sola fecha, o dividirla en partes con su porcentaje y fecha.
function FilaEditarFechaEstimada(props) {
  const { mov } = props
  const yaDividida = Array.isArray(mov._division) && mov._division.length > 1
  const [modo, setModo] = useState(yaDividida ? 'dividir' : 'una')
  const selector = (
    <div className="flex items-center gap-1 mb-3 p-1 rounded-xl bg-slate-100 w-fit">
      {[['una', 'Una sola fecha'], ['dividir', 'Dividir en partes']].map(([id, label]) => (
        <button key={id} type="button" onClick={() => setModo(id)}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors
            ${modo === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          {label}
        </button>
      ))}
    </div>
  )
  return modo === 'dividir'
    ? <FilaDividirEnPartes {...props} selector={selector} />
    : <FilaEditarFechaUnica {...props} selector={selector} />
}

function FilaDividirEnPartes({ mov, nuevoConcepto, guardando, error, onChangeConcepto, onGuardarDivision, onQuitarDivision, onCancelar, onCerrar, selector }) {
  const esVenta = mov.categoria === 'venta_proyectada'
  // Lo que se reparte es lo que todavía falta facturar: si entra una factura, el saldo (y cada parte) baja solo.
  const saldoLinea = Math.max(0, Number(mov._presupuestado ?? 0) - Number(mov._gastoReal ?? 0))
  const yaDividida = Array.isArray(mov._division) && mov._division.length > 1
  const [partes, setPartes] = useState(() => yaDividida
    ? mov._division.map(p => ({ porcentaje: String(p.porcentaje), fecha: p.fecha }))
    : partesIguales(2, mov.fecha_pago))
  const [errorLocal, setErrorLocal] = useState('')

  const cambiar = (i, campo, valor) => setPartes(ps => ps.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)))
  const quitar = i => setPartes(ps => ps.filter((_, j) => j !== i))
  const agregar = () => setPartes(ps => [...ps, { porcentaje: '0', fecha: sumarDias(ps[ps.length - 1]?.fecha || mov.fecha_pago || '', 7) }])
  const iguales = n => setPartes(ps => partesIguales(n, ps[0]?.fecha || mov.fecha_pago))

  const pcts = partes.map(p => numPct(p.porcentaje))
  const suma = Math.round(pcts.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0) * 100) / 100
  const sumaOk = Math.abs(suma - 100) <= 0.005
  const valida = partes.length >= 2 && sumaOk && pcts.every(x => x > 0) && partes.every(p => p.fecha)
  const montos = valida ? dividirPorPorcentajes(saldoLinea, pcts.map(x => ({ porcentaje: x }))) : null

  function guardar() {
    setErrorLocal('')
    if (partes.length < 2) { setErrorLocal('Tiene que haber al menos 2 partes.'); return }
    if (pcts.some(x => !(x > 0))) { setErrorLocal('Cada parte tiene que tener un porcentaje mayor a 0.'); return }
    if (!sumaOk) { setErrorLocal(`Los porcentajes suman ${suma}%: tienen que dar 100%.`); return }
    if (partes.some(p => !p.fecha)) { setErrorLocal('Falta la fecha de alguna parte.'); return }
    onGuardarDivision(partes.map((p, i) => ({ porcentaje: Number(pcts[i].toFixed(2)), fecha: p.fecha })))
  }

  const inputCls = `px-3 py-2 text-sm rounded-xl border border-slate-200 text-slate-900 bg-white
    transition-shadow focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:border-teal-400`

  return (
    <tr style={{ backgroundColor: '#f8fafc' }} className="border-b border-slate-200">
      <td className="px-4 py-3" colSpan={9}>
        {selector}
        <p className="text-[11px] font-semibold text-slate-500 mb-0.5">
          {esVenta ? `Venta proyectada de ${labelPeriodo(mov.periodo)}` : `${mov.rubros?.nombre ?? 'Rubro'} — saldo sin facturar`}
        </p>
        <p className="text-xs text-slate-500 mb-3">
          Saldo a repartir: <span className="font-semibold text-slate-700">{fmtARS(saldoLinea)}</span>
          <span className="text-slate-400"> (presupuestado {fmtARS(mov._presupuestado ?? 0)} − ya {esVenta ? 'registrado' : 'facturado'} {fmtARS(mov._gastoReal ?? 0)})</span>
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Partes iguales</span>
          {[2, 3, 4, 5].map(n => (
            <button key={n} type="button" onClick={() => iguales(n)}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-700 transition-colors">
              {n}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {partes.map((p, i) => (
            <div key={i} className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold text-slate-500 w-14">Parte {i + 1}</span>
              <div className="flex items-center gap-1">
                <input type="number" min="0" max="100" step="0.01" value={p.porcentaje}
                  onChange={e => cambiar(i, 'porcentaje', e.target.value)} className={`${inputCls} w-24 text-right`} />
                <span className="text-sm text-slate-400">%</span>
              </div>
              <input type="date" value={p.fecha} onChange={e => cambiar(i, 'fecha', e.target.value)} className={inputCls} />
              <span className="text-sm font-semibold text-slate-600 tabular-nums w-40 text-right">{montos ? fmtARS(montos[i]) : '—'}</span>
              {partes.length > 2 && (
                <button type="button" onClick={() => quitar(i)} className="text-xs font-semibold text-slate-400 hover:text-red-600 transition-colors">Quitar</button>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-3">
          <button type="button" onClick={agregar} className="text-xs font-semibold transition-colors" style={{ color: '#0e7490' }}>+ Agregar parte</button>
          <span className={`text-xs font-semibold ${sumaOk ? 'text-emerald-600' : 'text-rose-600'}`}>
            Suma: {suma}% {sumaOk ? '✓' : '— tiene que dar 100%'}
          </span>
        </div>

        {esVenta && (
          <div className="mt-3">
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Concepto (para identificarla en el Cash Flow)</label>
            <input type="text" placeholder="Ej: Anticipo obra 678, cobro estimado con 60 días" value={nuevoConcepto}
              onChange={e => onChangeConcepto(e.target.value)} className={`${inputCls} w-64`} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button onClick={onCerrar} disabled={guardando}
            className="px-3 py-2 text-sm font-semibold text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
            title="El saldo restante deja de aparecer en el Cash Flow. No borra el presupuesto/venta original.">
            Cerrar proyección
          </button>
          {mov._divisionManual && (
            <button onClick={onQuitarDivision} disabled={guardando}
              className="px-3 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
              title="La línea vuelve a su fecha original, sin dividir.">
              Quitar división
            </button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            {(errorLocal || error) && <span className="text-xs text-red-600 font-medium">{errorLocal || error}</span>}
            <button onClick={onCancelar} disabled={guardando}
              className="px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50">
              Cancelar
            </button>
            <button onClick={guardar} disabled={guardando || !valida}
              className="px-4 py-2 text-sm font-semibold text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#0e7490' }}>
              {guardando ? 'Guardando…' : 'Guardar división'}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          Se reparte el saldo que falta facturar, no el importe original: cuando llega una factura, todas las partes bajan en proporción,
          y si se factura todo desaparecen. No se toca el presupuesto ni la venta que cargó Operaciones.
        </p>
      </td>
    </tr>
  )
}

function FilaEditarFechaUnica({ mov, nuevaFecha, nuevoConcepto, guardando, error, onChangeFecha, onChangeConcepto, onGuardar, onCancelar, onCerrar, selector }) {
  const esVenta = mov.categoria === 'venta_proyectada'
  return (
    <tr style={{ backgroundColor: '#f8fafc' }} className="border-b border-slate-200">
      <td className="px-4 py-3" colSpan={9}>
        {selector}
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 mb-1">
              {esVenta ? `Venta proyectada de ${labelPeriodo(mov.periodo)}` : `${mov.rubros?.nombre ?? 'Rubro'} — saldo sin facturar`} — {fmtARS(mov.montoEfectivo)}
            </p>
            <p className="text-xs text-slate-400">Fecha estimada actual: {fmtFecha(mov.fecha_pago)}</p>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Nueva fecha estimada</label>
            <input
              type="date"
              value={nuevaFecha}
              onChange={e => onChangeFecha(e.target.value)}
              className="px-3 py-2 text-sm rounded-xl border border-slate-200 text-slate-900 bg-white
                        transition-shadow focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:border-teal-400"
              autoFocus
            />
          </div>

          {esVenta && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Concepto (para identificarla en el Cash Flow)</label>
              <input
                type="text"
                placeholder="Ej: Anticipo obra 678, cobro estimado con 60 días"
                value={nuevoConcepto}
                onChange={e => onChangeConcepto(e.target.value)}
                className="px-3 py-2 text-sm rounded-xl border border-slate-200 text-slate-900 bg-white w-64
                          transition-shadow focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:border-teal-400"
              />
            </div>
          )}

          <button
            onClick={onCerrar}
            disabled={guardando}
            className="px-3 py-2 text-sm font-semibold text-red-600 hover:text-red-700
                      transition-colors disabled:opacity-50"
            title="El saldo restante deja de aparecer en el Cash Flow. No borra el presupuesto/venta original."
          >
            Cerrar proyección
          </button>

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
                        disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#0e7490' }}
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          "Guardar" solo cambia cuándo se muestra esta proyección en el Cash Flow. "Cerrar proyección" la oculta del todo (el saldo restante no va a pasar). Ninguna de las dos toca el presupuesto ni la venta proyectada que cargó Operaciones.
        </p>
      </td>
    </tr>
  )
}

function FilaEdicionMovimiento({ mov, obras, rubros, valores, guardando, error, onChange, onGuardar, onCancelar, onBorrar, onNotas }) {
  const rubrosFiltrados = (rubros ?? []).filter(r =>
    r.activo && RUBROS_PERMITIDOS_FINANZAS.includes(r.nombre)
    && (valores.obra_id ? r.tipo === 'obra' : r.tipo === 'general')
  )

  return (
    <tr style={{ backgroundColor: '#ecfeff' }} className="border-b border-cyan-100">
      <td className="px-4 py-3" colSpan={9}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <CampoEdicion label="Proveedor / Cliente">
            <input type="text" value={valores.proveedor_cliente ?? ''}
              onChange={e => onChange({ proveedor_cliente: e.target.value })} className={inputEdicionCls} />
          </CampoEdicion>
          <CampoEdicion label="Número de factura">
            <input type="text" value={valores.numero_factura ?? ''}
              onChange={e => onChange({ numero_factura: e.target.value })} className={inputEdicionCls} />
          </CampoEdicion>
          <CampoEdicion label="Categoría">
            <select value={valores.categoria ?? ''}
              onChange={e => onChange({ categoria: e.target.value })} className={inputEdicionCls}>
              {CATEGORIAS_FILTRO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              <option value="fima">FIMA</option>
            </select>
          </CampoEdicion>
          <CampoEdicion label="Obra">
            <select value={valores.obra_id ?? ''}
              onChange={e => onChange({ obra_id: e.target.value, rubro_id: '' })} className={inputEdicionCls}>
              <option value="">— Sin obra / General —</option>
              {(obras ?? []).map(o => <option key={o.id} value={o.id}>{o.codigo} · {o.nombre}</option>)}
            </select>
          </CampoEdicion>
          <CampoEdicion label="Rubro">
            {valores.categoria === 'ingreso_cliente' ? (
              <p className="text-sm text-slate-500 px-3 py-2">Ventas (automático)</p>
            ) : (
              <select value={valores.rubro_id ?? ''}
                onChange={e => onChange({ rubro_id: e.target.value })} className={inputEdicionCls}>
                <option value="">— Sin rubro —</option>
                {rubrosFiltrados.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            )}
          </CampoEdicion>
          <CampoEdicion label="Fecha de pago">
            <input type="date" value={valores.fecha_pago ?? ''}
              onChange={e => onChange({ fecha_pago: e.target.value })} className={inputEdicionCls} />
          </CampoEdicion>
          <CampoEdicion label="Período">
            <select value={valores.periodo ?? ''}
              onChange={e => onChange({ periodo: e.target.value })} className={inputEdicionCls}>
              {PERIODOS_EDICION.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </CampoEdicion>
          <CampoEdicion label="Monto bruto">
            <input type="number" step="0.01" value={valores.monto_bruto ?? ''}
              onChange={e => onChange({ monto_bruto: e.target.value })} className={inputEdicionCls + ' text-right'} />
          </CampoEdicion>
          <CampoEdicion label="Estado">
            <select value={valores.estado ?? 'proyectado'}
              onChange={e => onChange({ estado: e.target.value })} className={inputEdicionCls}>
              <option value="proyectado">Proyectado</option>
              <option value="ejecutado">Ejecutado</option>
            </select>
          </CampoEdicion>
          {valores.estado === 'ejecutado' && (
            <CampoEdicion label="Monto neto (real cobrado/pagado)">
              <input type="number" step="0.01" placeholder={valores.monto_bruto || '0,00'}
                value={valores.monto_neto ?? ''}
                onChange={e => onChange({ monto_neto: e.target.value })} className={inputEdicionCls + ' text-right'} />
            </CampoEdicion>
          )}
          <CampoEdicion label="Concepto">
            <input type="text" value={valores.concepto ?? ''}
              onChange={e => onChange({ concepto: e.target.value })} className={inputEdicionCls} />
          </CampoEdicion>
          <CampoEdicion label="Observaciones">
            <input type="text" placeholder="Ej: Retención IIBB descontada" value={valores.observaciones ?? ''}
              onChange={e => onChange({ observaciones: e.target.value })} className={inputEdicionCls} />
          </CampoEdicion>
        </div>

        <div className="flex items-center gap-2 mt-3">
          {error && <span className="text-xs text-red-600 font-medium">{error}</span>}
          <div className="flex items-center gap-2 ml-auto">
            {mov.categoria === 'factura' && (
              <button
                onClick={onNotas}
                disabled={guardando}
                title="Notas de débito / crédito de esta factura"
                className="px-3 py-2 text-sm font-medium text-cyan-700 hover:text-cyan-900
                          transition-colors disabled:opacity-50"
              >
                Notas de débito/crédito
              </button>
            )}
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

function CampoEdicion({ label, children }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputEdicionCls = `w-full px-3 py-2 text-sm rounded-xl border border-slate-200 text-slate-900 bg-white
  transition-shadow focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:border-teal-400`

function Th({ children, align = 'left' }) {
  return (
    <th className={`px-3.5 py-3.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap
                    ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}