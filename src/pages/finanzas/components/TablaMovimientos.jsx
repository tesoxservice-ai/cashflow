// pages/finanzas/components/TablaMovimientos.jsx
// Tabla de movimientos con filtros, ejecución inline y acciones.
//
// Props:
//   movimientos   → array completo de movimientos (con joins rubros, obras, cuentas)
//   obras         → array de obras (para el filtro por obra)
//   cargando      → boolean
//   userId        → id del usuario logueado (para ModalNotas)
//   onEliminar    → async fn(id) — llamada tras confirmar eliminación
//   onEjecutado   → fn() sin args — recarga el listado tras ejecutar
//   onNota        → fn(movimiento) — abre el modal de notas (lo maneja el padre)

import { useState, useMemo } from 'react'
import { supabase } from '../../../supabaseClient'

// ─────────────────────────────────────────────────────────────
// Utilitarios de presentación
// ─────────────────────────────────────────────────────────────
const fmtARS = n => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 2,
}).format(n ?? 0)

function fmtFecha(str) {
  if (!str) return '—'
  return new Date(str + 'T00:00:00').toLocaleDateString('es-AR')
}

// Genera los próximos 24 meses + 12 anteriores para el filtro de período
function generarPeriodos() {
  const lista = []
  const hoy = new Date()
  for (let i = -12; i < 24; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    lista.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return lista
}
const PERIODOS_FILTRO = generarPeriodos()

// ── Configuración de badges ────────────────────────────────────
const BADGE_CAT = {
  factura:           'bg-orange-50 text-orange-700 border-orange-100',
  ingreso_cliente:   'bg-green-50 text-green-700 border-green-100',
  sueldo:            'bg-purple-50 text-purple-700 border-purple-100',
  impuesto:          'bg-red-50 text-red-700 border-red-100',
  debito_automatico: 'bg-yellow-50 text-yellow-700 border-yellow-100',
  fima:              'bg-blue-50 text-blue-700 border-blue-100',
  otro:              'bg-slate-100 text-slate-600 border-slate-200',
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

// Categoría → tipo de movimiento (para recalcular al editar). FIMA queda afuera
// porque su tipo depende del subtipo (rescate/suscripción), no editable acá.
const CATEGORIA_TIPO = {
  factura:           'egreso',
  ingreso_cliente:   'ingreso',
  sueldo:            'egreso',
  impuesto:          'egreso',
  debito_automatico: 'egreso',
  otro:              'egreso',
}

const CATEGORIAS_FILTRO = [
  { value: '',                  label: 'Todas las categorías' },
  { value: 'factura',           label: 'Factura' },
  { value: 'ingreso_cliente',   label: 'Ventas' },
  { value: 'sueldo',            label: 'Sueldo' },
  { value: 'impuesto',          label: 'Impuesto' },
  { value: 'debito_automatico', label: 'Débito automático' },
  { value: 'fima',              label: 'FIMA' },
  { value: 'otro',              label: 'Otro' },
]

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function TablaMovimientos({
  movimientos, obras, rubros, cargando, userId, onEliminar, onEjecutado, onEditado, onNota,
}) {
  // ── Filtros ────────────────────────────────────────────────
  const periodoActual = (() => {
    const hoy = new Date()
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`
  })()

  const [filtroPeriodo,    setFiltroPeriodo]    = useState(periodoActual)
  const [filtroCategoria,  setFiltroCategoria]  = useState('')
  const [filtroEstado,     setFiltroEstado]     = useState('')  // '' | 'proyectado' | 'ejecutado'
  const [filtroObra,       setFiltroObra]       = useState('')
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('')
  const [filtroBusqueda,   setFiltroBusqueda]   = useState('')

  // ── Ejecución inline ───────────────────────────────────────
  const [ejecutandoId,  setEjecutandoId]  = useState(null)
  const [montoNeto,     setMontoNeto]     = useState('')
  const [obsEjecucion,  setObsEjecucion]  = useState('')
  const [guardandoEjec, setGuardandoEjec] = useState(false)
  const [errorEjec,     setErrorEjec]     = useState('')

  // ── Edición inline ──────────────────────────────────────────
  const [filaEditando,    setFilaEditando]    = useState(null)
  const [valoresEdicion,  setValoresEdicion]  = useState({})
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [errorEdicion,    setErrorEdicion]    = useState('')

  // ── Confirmación de eliminación ───────────────────────────
  const [confirmarElim, setConfirmarElim] = useState(null) // id

  // ── Filtrado en memoria ────────────────────────────────────
  const filtrados = useMemo(() => {
    const busqueda = filtroBusqueda.trim().toLowerCase()
    return movimientos.filter(m => {
      if (filtroPeriodo    && m.periodo    !== filtroPeriodo)    return false
      if (filtroCategoria  && m.categoria  !== filtroCategoria)  return false
      if (filtroEstado     && m.estado     !== filtroEstado)     return false
      if (filtroObra       && m.obra_id    !== filtroObra)       return false
      if (filtroFechaDesde && (!m.fecha_pago || m.fecha_pago < filtroFechaDesde)) return false
      if (busqueda) {
        const campos = [
          m.proveedor_cliente, m.numero_factura, m.concepto,
          m.obras?.codigo, m.obras?.nombre,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!campos.includes(busqueda)) return false
      }
      return true
    })
  }, [movimientos, filtroPeriodo, filtroCategoria, filtroEstado, filtroObra, filtroFechaDesde, filtroBusqueda])

  // ── Totales del período filtrado ───────────────────────────
  const totales = useMemo(() => {
    let ingresos = 0, egresos = 0
    filtrados.forEach(m => {
      const monto = m.estado === 'ejecutado'
        ? Number(m.monto_neto  ?? m.monto_bruto)
        : Number(m.monto_bruto ?? 0)
      if (m.tipo === 'ingreso') ingresos += monto
      else                      egresos  += monto
    })
    return { ingresos, egresos, diferencia: ingresos - egresos }
  }, [filtrados])

  // ── Iniciar ejecución ──────────────────────────────────────
  function handleIniciarEjecucion(id) {
    setEjecutandoId(id)
    setMontoNeto('')
    setObsEjecucion('')
    setErrorEjec('')
  }

  function handleCancelarEjecucion() {
    setEjecutandoId(null)
    setMontoNeto('')
    setObsEjecucion('')
    setErrorEjec('')
  }

  // ── Confirmar ejecución ────────────────────────────────────
  async function handleConfirmarEjecucion(id) {
    setErrorEjec('')
    if (!montoNeto || isNaN(Number(montoNeto)) || Number(montoNeto) <= 0) {
      setErrorEjec('Ingresá el monto neto real.')
      return
    }
    setGuardandoEjec(true)
    const { error } = await supabase
      .from('movimientos')
      .update({
        monto_neto:    Number(montoNeto),
        observaciones: obsEjecucion.trim() || null,
        estado:        'ejecutado',
        updated_at:    new Date().toISOString(),
      })
      .eq('id', id)
    if (error) { setErrorEjec('Error al ejecutar el movimiento.'); setGuardandoEjec(false); return }
    setEjecutandoId(null)
    setGuardandoEjec(false)
    onEjecutado()
  }

  // ── Eliminar movimiento ────────────────────────────────────
  async function handleEliminarConfirmado(id) {
    await onEliminar(id)
    setConfirmarElim(null)
  }

  // ── Iniciar edición ─────────────────────────────────────────
  function handleIniciarEdicion(m) {
    setFilaEditando(m.id)
    setErrorEdicion('')
    setValoresEdicion({
      proveedor_cliente: m.proveedor_cliente ?? '',
      numero_factura:    m.numero_factura ?? '',
      categoria:         m.categoria,
      obra_id:           m.obra_id ?? '',
      rubro_id:          m.rubro_id ?? '',
      fecha_pago:        m.fecha_pago ?? '',
      monto_bruto:       String(m.monto_bruto ?? ''),
      concepto:          m.concepto ?? '',
      estado:            m.estado,
      periodo:           m.periodo ?? '',
    })
  }

  function handleCancelarEdicion() {
    setFilaEditando(null)
    setValoresEdicion({})
    setErrorEdicion('')
  }

  // ── Guardar edición ─────────────────────────────────────────
  async function handleGuardarEdicion(mov) {
    setErrorEdicion('')
    if (!valoresEdicion.categoria) { setErrorEdicion('Seleccioná una categoría.'); return }
    if (!valoresEdicion.fecha_pago) { setErrorEdicion('Elegí una fecha de pago.'); return }
    if (!valoresEdicion.periodo) { setErrorEdicion('Elegí un período.'); return }
    const monto = Number(valoresEdicion.monto_bruto)
    if (!valoresEdicion.monto_bruto || isNaN(monto) || monto <= 0) {
      setErrorEdicion('El monto tiene que ser un número mayor a 0.'); return
    }

    // El rubro de una Venta siempre es "Ventas" -- se asigna solo, no se elige.
    let rubroId = valoresEdicion.rubro_id || null
    if (valoresEdicion.categoria === 'ingreso_cliente') {
      const rubroVentas = (rubros ?? []).find(r => r.nombre === 'Ventas' && r.tipo === (valoresEdicion.obra_id ? 'obra' : 'general'))
      rubroId = rubroVentas?.id ?? null
    }

    const payload = {
      proveedor_cliente: valoresEdicion.proveedor_cliente.trim() || null,
      numero_factura:    valoresEdicion.numero_factura.trim()    || null,
      categoria:         valoresEdicion.categoria,
      obra_id:           valoresEdicion.obra_id  || null,
      rubro_id:          rubroId,
      fecha_pago:        valoresEdicion.fecha_pago,
      periodo:           valoresEdicion.periodo,
      monto_bruto:       monto,
      concepto:          valoresEdicion.concepto.trim() || null,
      estado:            valoresEdicion.estado,
    }
    if (CATEGORIA_TIPO[valoresEdicion.categoria]) payload.tipo = CATEGORIA_TIPO[valoresEdicion.categoria]
    if (valoresEdicion.estado === 'ejecutado' && mov.estado !== 'ejecutado') payload.monto_neto = monto
    if (valoresEdicion.estado === 'proyectado') payload.monto_neto = null

    setGuardandoEdicion(true)
    const { error: updError } = await supabase.from('movimientos').update(payload).eq('id', mov.id)
    setGuardandoEdicion(false)

    if (updError) { setErrorEdicion('No se pudo guardar el cambio.'); return }
    setFilaEditando(null)
    setValoresEdicion({})
    onEditado()
  }

  // ── RENDER ─────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Filtros ─────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Período */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Período</label>
            <select value={filtroPeriodo} onChange={e => setFiltroPeriodo(e.target.value)} className={selCls}>
              <option value="">Todos</option>
              {PERIODOS_FILTRO.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          {/* Categoría */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Categoría</label>
            <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} className={selCls}>
              {CATEGORIAS_FILTRO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          {/* Estado */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Estado</label>
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className={selCls}>
              <option value="">Todos</option>
              <option value="proyectado">Proyectado</option>
              <option value="ejecutado">Ejecutado</option>
            </select>
          </div>
          {/* Obra */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Obra</label>
            <select value={filtroObra} onChange={e => setFiltroObra(e.target.value)} className={selCls}>
              <option value="">Todas</option>
              {obras.map(o => <option key={o.id} value={o.id}>{o.codigo} · {o.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Fecha desde */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Fecha desde</label>
            <div className="flex items-center gap-2">
              <input type="date" value={filtroFechaDesde}
                onChange={e => setFiltroFechaDesde(e.target.value)} className={selCls} />
              {filtroFechaDesde && (
                <button onClick={() => setFiltroFechaDesde('')}
                  className="text-xs text-slate-400 hover:text-slate-600 shrink-0">
                  Sacar
                </button>
              )}
            </div>
          </div>
          {/* Búsqueda */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Buscar (proveedor, factura, concepto, obra)
            </label>
            <input type="text" placeholder="Ej: startech, 4-1596, obra 678…"
              value={filtroBusqueda} onChange={e => setFiltroBusqueda(e.target.value)}
              className={selCls} />
          </div>
        </div>
      </div>

      {/* ── Tabla ───────────────────────────────────────────── */}
      {cargando ? (
        <div className="flex items-center justify-center py-20 gap-3 text-slate-500">
          <span className="w-5 h-5 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-sm">Cargando movimientos…</span>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-full
                          flex items-center justify-center mb-3">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          </div>
          <p className="text-slate-600 text-sm font-medium">Sin movimientos para los filtros seleccionados</p>
          <p className="text-slate-400 text-xs mt-1">Cambiá los filtros o cargá un nuevo movimiento.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <Th>Fecha pago</Th>
                  <Th>Categoría</Th>
                  <Th>Proveedor / Cliente</Th>
                  <Th>Obra</Th>
                  <Th>Rubro</Th>
                  <Th align="right">Monto bruto</Th>
                  <Th align="right">Monto neto</Th>
                  <Th>Estado</Th>
                  <Th>{/* acciones */}</Th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(m => (
                  <>
                    {/* ── Fila de edición o fila principal ─────── */}
                    {filaEditando === m.id ? (
                      <FilaEdicionMovimiento
                        key={m.id}
                        mov={m}
                        valores={valoresEdicion}
                        obras={obras}
                        rubros={rubros}
                        guardando={guardandoEdicion}
                        error={errorEdicion}
                        onChange={cambios => setValoresEdicion(v => ({ ...v, ...cambios }))}
                        onGuardar={() => handleGuardarEdicion(m)}
                        onCancelar={handleCancelarEdicion}
                      />
                    ) : (
                      <FilaMovimiento
                        key={m.id}
                        mov={m}
                        ejecutandoEsta={ejecutandoId === m.id}
                        confirmarElim={confirmarElim === m.id}
                        deshabilitada={filaEditando !== null}
                        onEditar={() => handleIniciarEdicion(m)}
                        onEjecutar={() => handleIniciarEjecucion(m.id)}
                        onNotas={() => onNota(m)}
                        onEliminar={() => setConfirmarElim(m.id)}
                        onCancelarElim={() => setConfirmarElim(null)}
                        onConfirmarElim={() => handleEliminarConfirmado(m.id)}
                      />
                    )}

                    {/* ── Panel de ejecución inline ──────────── */}
                    {ejecutandoId === m.id && (
                      <tr key={`ejec-${m.id}`}>
                        <td colSpan={9} className="px-0 py-0">
                          <PanelEjecucion
                            mov={m}
                            montoNeto={montoNeto}
                            obs={obsEjecucion}
                            guardando={guardandoEjec}
                            error={errorEjec}
                            onChangeMontoNeto={setMontoNeto}
                            onChangeObs={setObsEjecucion}
                            onConfirmar={() => handleConfirmarEjecucion(m.id)}
                            onCancelar={handleCancelarEjecucion}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Totales al pie ──────────────────────────────── */}
          <div className="border-t border-slate-200 bg-slate-50 px-5 py-4">
            <div className="flex flex-wrap gap-6 text-sm">
              <span className="text-slate-500">
                <span className="font-medium">Ingresos: </span>
                <span className="text-emerald-600 font-semibold tabular-nums">
                  {fmtARS(totales.ingresos)}
                </span>
              </span>
              <span className="text-slate-500">
                <span className="font-medium">Egresos: </span>
                <span className="text-red-600 font-semibold tabular-nums">
                  {fmtARS(totales.egresos)}
                </span>
              </span>
              <span className="text-slate-500">
                <span className="font-medium">Diferencia: </span>
                <span className={`font-bold tabular-nums ${totales.diferencia >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {fmtARS(totales.diferencia)}
                </span>
              </span>
              <span className="text-xs text-slate-400 ml-auto self-center">
                {filtrados.length} movimiento{filtrados.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// SUBCOMPONENTE: FilaMovimiento
// ══════════════════════════════════════════════════════════════
function FilaMovimiento({ mov: m, ejecutandoEsta, confirmarElim, deshabilitada, onEditar, onEjecutar, onNotas, onEliminar, onCancelarElim, onConfirmarElim }) {
  const esIngreso = m.tipo === 'ingreso'

  // Conteo de notas (viene como campo agregado si se hizo join, si no es null/undefined)
  const cantNotas = m.notas_count ?? 0

  return (
    <tr className={`border-b border-slate-100 last:border-0 transition-colors
                    ${ejecutandoEsta ? 'bg-emerald-50/40' : 'hover:bg-slate-50/60'}`}>
      {/* Fecha pago */}
      <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
        {fmtFecha(m.fecha_pago)}
      </td>
      {/* Categoría */}
      <td className="px-4 py-3">
        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border
                          ${BADGE_CAT[m.categoria] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
          {LABEL_CAT[m.categoria] ?? m.categoria}
        </span>
      </td>
      {/* Proveedor/Cliente */}
      <td className="px-4 py-3 text-slate-700 max-w-[160px] truncate">
        <span title={m.proveedor_cliente ?? ''}>
          {m.proveedor_cliente ?? '—'}
        </span>
        {m.numero_factura && (
          <span className="block text-xs text-slate-400">Nº {m.numero_factura}</span>
        )}
      </td>
      {/* Obra */}
      <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">
        {m.obras?.codigo ? `${m.obras.codigo}` : '—'}
      </td>
      {/* Rubro */}
      <td className="px-4 py-3 text-slate-600 text-xs max-w-[120px] truncate">
        {m.rubros?.nombre ?? '—'}
      </td>
      {/* Monto bruto */}
      <td className={`px-4 py-3 text-right font-medium tabular-nums whitespace-nowrap
                      ${esIngreso ? 'text-emerald-600' : 'text-red-600'}`}>
        {esIngreso ? '+' : '−'}{fmtARS(m.monto_bruto)}
      </td>
      {/* Monto neto */}
      <td className={`px-4 py-3 text-right tabular-nums text-xs whitespace-nowrap
                      ${esIngreso ? 'text-emerald-700' : 'text-red-700'}`}>
        {m.estado === 'ejecutado' ? fmtARS(m.monto_neto) : '—'}
      </td>
      {/* Estado */}
      <td className="px-4 py-3">
        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full
          ${m.estado === 'ejecutado'
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-slate-100 text-slate-600'}`}>
          {m.estado === 'ejecutado' ? 'Ejecutado' : 'Proyectado'}
        </span>
      </td>
      {/* Acciones */}
      <td className="px-4 py-3">
        {confirmarElim ? (
          /* Confirmación de eliminación inline */
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-xs text-red-600 font-medium">¿Eliminar?</span>
            <button onClick={onConfirmarElim}
              className="text-xs bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded-md transition-colors">
              Sí
            </button>
            <button onClick={onCancelarElim}
              className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 px-2 py-1 rounded-md transition-colors">
              No
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
            {/* Editar */}
            <button onClick={onEditar} disabled={deshabilitada}
              className="text-xs font-medium bg-slate-600 hover:bg-slate-700
                         text-white px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-50">
              Editar
            </button>
            {/* Ejecutar (solo proyectados) */}
            {m.estado === 'proyectado' && (
              <button onClick={onEjecutar} disabled={deshabilitada}
                className="text-xs font-medium bg-emerald-600 hover:bg-emerald-700
                           text-white px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-50">
                Ejecutar
              </button>
            )}
            {/* Notas (solo facturas) */}
            {m.categoria === 'factura' && (
              <button onClick={onNotas} disabled={deshabilitada}
                className="relative text-xs font-medium bg-blue-600 hover:bg-blue-700
                           text-white px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-50">
                Notas
                {cantNotas > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-orange-500 text-white
                                   text-[10px] font-bold rounded-full flex items-center justify-center">
                    {cantNotas}
                  </span>
                )}
              </button>
            )}
            {/* Eliminar */}
            <button onClick={onEliminar} disabled={deshabilitada}
              className="text-xs font-medium bg-red-500 hover:bg-red-600
                         text-white px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-50">
              Eliminar
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

// ══════════════════════════════════════════════════════════════
// SUBCOMPONENTE: FilaEdicionMovimiento
// Fila de edición inline (reemplaza la fila principal mientras se edita)
// ══════════════════════════════════════════════════════════════
function FilaEdicionMovimiento({ mov, valores, obras, rubros, guardando, error, onChange, onGuardar, onCancelar }) {
  const rubrosFiltrados = (rubros ?? []).filter(r =>
    r.activo && (valores.obra_id ? r.tipo === 'obra' : r.tipo === 'general')
  )

  return (
    <tr className="bg-cyan-50/60 border-b border-cyan-100">
      <td colSpan={9} className="px-4 py-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <Campo label="Proveedor / Cliente">
            <input type="text" value={valores.proveedor_cliente ?? ''}
              onChange={e => onChange({ proveedor_cliente: e.target.value })} className={inCls} />
          </Campo>
          <Campo label="Número de factura">
            <input type="text" value={valores.numero_factura ?? ''}
              onChange={e => onChange({ numero_factura: e.target.value })} className={inCls} />
          </Campo>
          <Campo label="Categoría">
            <select value={valores.categoria ?? ''}
              onChange={e => onChange({ categoria: e.target.value })} className={selCls}>
              {CATEGORIAS_FILTRO.filter(c => c.value).map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
              <option value="fima">FIMA</option>
            </select>
          </Campo>
          <Campo label="Obra">
            <select value={valores.obra_id ?? ''}
              onChange={e => onChange({ obra_id: e.target.value, rubro_id: '' })} className={selCls}>
              <option value="">— Sin obra / General —</option>
              {obras.map(o => <option key={o.id} value={o.id}>{o.codigo} · {o.nombre}</option>)}
            </select>
          </Campo>
          <Campo label="Rubro">
            {valores.categoria === 'ingreso_cliente' ? (
              <p className="text-sm text-slate-500 px-3 py-2">Ventas (automático)</p>
            ) : (
              <select value={valores.rubro_id ?? ''}
                onChange={e => onChange({ rubro_id: e.target.value })} className={selCls}>
                <option value="">— Sin rubro —</option>
                {rubrosFiltrados.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            )}
          </Campo>
          <Campo label="Fecha de pago">
            <input type="date" value={valores.fecha_pago ?? ''}
              onChange={e => onChange({ fecha_pago: e.target.value })} className={inCls} />
          </Campo>
          <Campo label="Período">
            <select value={valores.periodo ?? ''}
              onChange={e => onChange({ periodo: e.target.value })} className={selCls}>
              {PERIODOS_FILTRO.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Campo>
          <Campo label="Monto bruto">
            <input type="number" step="0.01" value={valores.monto_bruto ?? ''}
              onChange={e => onChange({ monto_bruto: e.target.value })} className={inCls + ' text-right'} />
          </Campo>
          <Campo label="Estado">
            <select value={valores.estado ?? 'proyectado'}
              onChange={e => onChange({ estado: e.target.value })} className={selCls}>
              <option value="proyectado">Proyectado</option>
              <option value="ejecutado">Ejecutado</option>
            </select>
          </Campo>
          <Campo label="Concepto">
            <input type="text" value={valores.concepto ?? ''}
              onChange={e => onChange({ concepto: e.target.value })} className={inCls} />
          </Campo>
        </div>

        <div className="flex items-center gap-2 mt-3">
          {error && <span className="text-xs text-red-600 font-medium">{error}</span>}
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onCancelar} disabled={guardando}
              className="text-xs font-medium text-slate-500 hover:text-slate-700
                         px-3 py-2 transition-colors disabled:opacity-50">
              Cancelar
            </button>
            <button onClick={onGuardar} disabled={guardando}
              className="text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50
                         text-white px-4 py-2 rounded-lg transition-colors">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </td>
    </tr>
  )
}

function Campo({ label, children }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// SUBCOMPONENTE: PanelEjecucion
// Panel que aparece debajo de una fila proyectada al ejecutar
// ══════════════════════════════════════════════════════════════
function PanelEjecucion({ mov, montoNeto, obs, guardando, error, onChangeMontoNeto, onChangeObs, onConfirmar, onCancelar }) {
  return (
    <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-4">
      <p className="text-emerald-800 font-medium text-xs mb-3">
        Ejecutar movimiento — {mov.proveedor_cliente ?? mov.concepto ?? 'sin descripción'}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        {/* Monto neto real */}
        <div>
          <label className="block text-xs font-medium text-emerald-700 mb-1">
            Monto neto real *
          </label>
          <input
            type="number" min="0.01" step="0.01"
            placeholder="0,00"
            value={montoNeto}
            onChange={e => onChangeMontoNeto(e.target.value)}
            className="w-40 px-3 py-2 text-sm rounded-lg border border-emerald-300
                       text-slate-900 text-right
                       focus:outline-none focus:ring-2 focus:ring-emerald-500
                       focus:border-transparent bg-white"
          />
        </div>
        {/* Observaciones */}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-emerald-700 mb-1">
            Observaciones (retenciones, diferencias…)
          </label>
          <input
            type="text"
            placeholder="Opcional"
            value={obs}
            onChange={e => onChangeObs(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-emerald-300
                       text-slate-900 placeholder:text-emerald-300
                       focus:outline-none focus:ring-2 focus:ring-emerald-500
                       focus:border-transparent bg-white"
          />
        </div>
        {/* Botones */}
        <div className="flex gap-2 pb-0.5">
          <button onClick={onConfirmar} disabled={guardando}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700
                       disabled:opacity-50 text-white text-xs font-medium
                       px-4 py-2 rounded-lg transition-colors">
            {guardando && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {guardando ? 'Guardando…' : 'Confirmar ejecución'}
          </button>
          <button onClick={onCancelar} disabled={guardando}
            className="bg-slate-200 hover:bg-slate-300 text-slate-700
                       text-xs font-medium px-3 py-2 rounded-lg transition-colors">
            Cancelar
          </button>
        </div>
      </div>
      {error && (
        <p className="text-red-600 text-xs mt-2 flex items-center gap-1">
          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────
function Th({ children, align = 'left' }) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide
                    ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

const selCls = `w-full px-2.5 py-2 text-sm rounded-lg border border-slate-200
  text-slate-900 bg-white focus:outline-none focus:ring-2
  focus:ring-blue-500 focus:border-transparent`

const inCls = `w-full px-2.5 py-2 text-sm rounded-lg border border-slate-200
  text-slate-900 placeholder:text-slate-300 bg-white focus:outline-none focus:ring-2
  focus:ring-blue-500 focus:border-transparent`
