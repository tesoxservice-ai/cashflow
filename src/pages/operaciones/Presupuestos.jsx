// pages/operaciones/Presupuestos.jsx
// Módulo de gestión de presupuestos para el rol 'operaciones'.
// Ruta: /operaciones/presupuestos
//
// Permite:
//   - Seleccionar una obra activa
//   - Cargar presupuestos por rubro, concepto, período y monto
//   - Ver presupuestos agrupados por rubro con totales
//   - Editar filas inline
//   - Eliminar presupuestos
//
// Todas las operaciones van directo a Supabase.
// El usuario logueado se obtiene del AuthContext (campo created_by).

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar'

// ─────────────────────────────────────────────────────────────
// Utilidad: formatea un número como pesos argentinos
// Ej: 1234567.89 → "$ 1.234.567,89"
// ─────────────────────────────────────────────────────────────
function formatearPesos(valor) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(valor ?? 0)
}

// ─────────────────────────────────────────────────────────────
// Utilidad: convierte una fecha tipo "2026-09-01" al label
// "Septiembre 2026" para mostrar en la tabla
// ─────────────────────────────────────────────────────────────
function formatearPeriodo(fechaStr) {
  if (!fechaStr) return '—'
  // Parseamos sin ajuste de zona horaria añadiendo T00:00:00
  const fecha = new Date(fechaStr + 'T00:00:00')
  return fecha.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

// ─────────────────────────────────────────────────────────────
// Utilidad: genera las opciones de período (próximos 24 meses
// desde el mes actual) como objetos { value, label }
// value = "YYYY-MM-01" (formato que espera Supabase)
// ─────────────────────────────────────────────────────────────
function generarOpcionesPeriodo() {
  const opciones = []
  const hoy = new Date()
  // Empezamos desde el mes actual
  for (let i = 0; i < 24; i++) {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1)
    const value = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-01`
    const label = fecha.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    // Capitalizamos la primera letra del mes
    opciones.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return opciones
}

const PERIODOS = generarOpcionesPeriodo()

// ─────────────────────────────────────────────────────────────
// Estado inicial del formulario de carga (para poder resetearlo)
// ─────────────────────────────────────────────────────────────
const FORM_VACIO = {
  rubro_id: '',
  concepto: '',
  periodo:  PERIODOS[0].value, // mes actual por defecto
  monto:    '',
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function Presupuestos() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // ── Datos maestros (se cargan una sola vez al montar) ────────
  const [obras,  setObras]  = useState([])
  const [rubros, setRubros] = useState([])

  // ── Obra seleccionada y sus presupuestos ──────────────────────
  const [obraSeleccionada,  setObraSeleccionada]  = useState('')
  const [presupuestos,      setPresupuestos]      = useState([])

  // ── Estados de carga y error ──────────────────────────────────
  const [cargandoObras,       setCargandoObras]       = useState(true)
  const [cargandoPresupuestos, setCargandoPresupuestos] = useState(false)
  const [errorGlobal,         setErrorGlobal]         = useState('')

  // ── Formulario de nueva fila ──────────────────────────────────
  const [form,          setForm]          = useState(FORM_VACIO)
  const [guardandoForm, setGuardandoForm] = useState(false)
  const [errorForm,     setErrorForm]     = useState('')

  // ── Edición inline: id de la fila en edición y sus valores ───
  const [filaEditando,   setFilaEditando]   = useState(null) // uuid del presupuesto
  const [valoresEdicion, setValoresEdicion] = useState({})
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [errorEdicion,   setErrorEdicion]   = useState('')

  // ── Eliminación: id de la fila confirmando delete ────────────
  const [eliminando, setEliminando] = useState(null) // uuid o null

  // ─────────────────────────────────────────────────────────────
  // CARGA INICIAL: obras activas + rubros de tipo 'obra'
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    async function cargarMaestros() {
      setCargandoObras(true)
      setErrorGlobal('')

      // Obras activas ordenadas por código
      const { data: dataObras, error: errorObras } = await supabase
        .from('obras')
        .select('id, codigo, nombre, cliente')
        .eq('activa', true)
        .order('codigo', { ascending: true })

      if (errorObras) {
        setErrorGlobal('No se pudieron cargar las obras. Intentá recargar la página.')
        setCargandoObras(false)
        return
      }

      // Rubros activos de tipo 'obra' (los únicos válidos para presupuestos)
      const { data: dataRubros, error: errorRubros } = await supabase
        .from('rubros')
        .select('id, nombre')
        .eq('tipo', 'obra')
        .eq('activo', true)
        .order('nombre', { ascending: true })

      if (errorRubros) {
        setErrorGlobal('No se pudieron cargar los rubros. Intentá recargar la página.')
        setCargandoObras(false)
        return
      }

      setObras(dataObras ?? [])
      setRubros(dataRubros ?? [])
      setCargandoObras(false)
    }

    cargarMaestros()
  }, [])

  // ─────────────────────────────────────────────────────────────
  // CARGA DE PRESUPUESTOS cuando cambia la obra seleccionada
  // useCallback para poder llamarla también después de mutations
  // ─────────────────────────────────────────────────────────────
  const cargarPresupuestos = useCallback(async (obraId) => {
    if (!obraId) {
      setPresupuestos([])
      return
    }

    setCargandoPresupuestos(true)
    setErrorGlobal('')

    const { data, error } = await supabase
      .from('presupuestos')
      .select(`
        id,
        concepto,
        periodo,
        monto,
        rubro_id,
        rubros ( id, nombre )
      `)
      .eq('obra_id', obraId)
      .order('rubros(nombre)', { ascending: true })
      .order('periodo',        { ascending: true })

    if (error) {
      setErrorGlobal('No se pudieron cargar los presupuestos.')
      setCargandoPresupuestos(false)
      return
    }

    setPresupuestos(data ?? [])
    setCargandoPresupuestos(false)
  }, [])

  // Disparar carga cada vez que cambia la obra seleccionada
  useEffect(() => {
    cargarPresupuestos(obraSeleccionada)
    // Cerramos cualquier edición abierta al cambiar de obra
    setFilaEditando(null)
    setErrorEdicion('')
    setErrorForm('')
  }, [obraSeleccionada, cargarPresupuestos])

  // ─────────────────────────────────────────────────────────────
  // SUBMIT DEL FORMULARIO DE CARGA
  // ─────────────────────────────────────────────────────────────
  async function handleAgregar(e) {
    e.preventDefault()
    setErrorForm('')

    // Validaciones mínimas (los campos required del form ya ayudan,
    // pero validamos de nuevo para el mensaje en español)
    if (!obraSeleccionada) { setErrorForm('Seleccioná una obra primero.'); return }
    if (!form.rubro_id)    { setErrorForm('Seleccioná un rubro.'); return }
    if (!form.concepto.trim()) { setErrorForm('Ingresá un concepto.'); return }
    if (!form.monto || isNaN(Number(form.monto)) || Number(form.monto) <= 0) {
      setErrorForm('Ingresá un monto válido mayor a cero.')
      return
    }

    setGuardandoForm(true)

    const { error } = await supabase
      .from('presupuestos')
      .insert({
        obra_id:    obraSeleccionada,
        rubro_id:   form.rubro_id,
        concepto:   form.concepto.trim(),
        periodo:    form.periodo,
        monto:      Number(form.monto),
        created_by: user.id,
      })

    if (error) {
      setErrorForm('Error al guardar. Intentá de nuevo.')
      setGuardandoForm(false)
      return
    }

    // Éxito: reseteamos el form y recargamos la tabla
    setForm(FORM_VACIO)
    setGuardandoForm(false)
    await cargarPresupuestos(obraSeleccionada)
  }

  // ─────────────────────────────────────────────────────────────
  // INICIAR EDICIÓN INLINE de una fila
  // ─────────────────────────────────────────────────────────────
  function handleIniciarEdicion(presupuesto) {
    setFilaEditando(presupuesto.id)
    setValoresEdicion({
      rubro_id: presupuesto.rubro_id,
      concepto: presupuesto.concepto,
      periodo:  presupuesto.periodo,
      monto:    String(presupuesto.monto),
    })
    setErrorEdicion('')
  }

  // ─────────────────────────────────────────────────────────────
  // CANCELAR EDICIÓN
  // ─────────────────────────────────────────────────────────────
  function handleCancelarEdicion() {
    setFilaEditando(null)
    setValoresEdicion({})
    setErrorEdicion('')
  }

  // ─────────────────────────────────────────────────────────────
  // GUARDAR EDICIÓN inline
  // ─────────────────────────────────────────────────────────────
  async function handleGuardarEdicion(id) {
    setErrorEdicion('')

    if (!valoresEdicion.rubro_id)          { setErrorEdicion('Seleccioná un rubro.'); return }
    if (!valoresEdicion.concepto?.trim())  { setErrorEdicion('Ingresá un concepto.'); return }
    if (!valoresEdicion.monto || isNaN(Number(valoresEdicion.monto)) || Number(valoresEdicion.monto) <= 0) {
      setErrorEdicion('Ingresá un monto válido mayor a cero.')
      return
    }

    setGuardandoEdicion(true)

    const { error } = await supabase
      .from('presupuestos')
      .update({
        rubro_id: valoresEdicion.rubro_id,
        concepto: valoresEdicion.concepto.trim(),
        periodo:  valoresEdicion.periodo,
        monto:    Number(valoresEdicion.monto),
      })
      .eq('id', id)

    if (error) {
      setErrorEdicion('Error al guardar los cambios.')
      setGuardandoEdicion(false)
      return
    }

    setFilaEditando(null)
    setValoresEdicion({})
    setGuardandoEdicion(false)
    await cargarPresupuestos(obraSeleccionada)
  }

  // ─────────────────────────────────────────────────────────────
  // ELIMINAR fila (con confirmación visual en la propia fila)
  // ─────────────────────────────────────────────────────────────
  async function handleEliminar(id) {
    setEliminando(id)

    const { error } = await supabase
      .from('presupuestos')
      .delete()
      .eq('id', id)

    if (error) {
      setErrorGlobal('No se pudo eliminar el presupuesto.')
      setEliminando(null)
      return
    }

    setEliminando(null)
    await cargarPresupuestos(obraSeleccionada)
  }

  // ─────────────────────────────────────────────────────────────
  // AGRUPADO POR RUBRO para la tabla
  // Devuelve un array de { nombreRubro, filas[], subtotal }
  // ─────────────────────────────────────────────────────────────
  function agruparPorRubro(lista) {
    const mapa = new Map()

    lista.forEach(p => {
      const nombre = p.rubros?.nombre ?? 'Sin rubro'
      if (!mapa.has(nombre)) {
        mapa.set(nombre, { nombreRubro: nombre, filas: [], subtotal: 0 })
      }
      const grupo = mapa.get(nombre)
      grupo.filas.push(p)
      grupo.subtotal += Number(p.monto)
    })

    // Ordenamos los grupos alfabéticamente por nombre de rubro
    return Array.from(mapa.values()).sort((a, b) =>
      a.nombreRubro.localeCompare(b.nombreRubro, 'es')
    )
  }

  const grupos      = agruparPorRubro(presupuestos)
  const totalGeneral = presupuestos.reduce((acc, p) => acc + Number(p.monto), 0)

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* ── Navbar ──────────────────────────────────────────────── */}
      <Navbar titulo="Operaciones" accentColor="text-emerald-400" />

      {/* ── Contenido principal ─────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">

        {/* Encabezado de sección con breadcrumb mínimo */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <button
              onClick={() => navigate('/operaciones')}
              className="text-emerald-600 text-sm hover:text-emerald-800
                         transition-colors flex items-center gap-1.5 mb-1"
            >
              {/* Flecha izquierda */}
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                   strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Panel de Operaciones
            </button>
            <h1 className="text-slate-900 text-2xl font-semibold tracking-tight">
              Presupuestos
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Cargá y editá el presupuesto mensual por obra y rubro
            </p>
          </div>
        </div>

        {/* Error global (errores de carga de maestros o de Supabase) */}
        {errorGlobal && (
          <MensajeError mensaje={errorGlobal} onCerrar={() => setErrorGlobal('')} />
        )}

        {/* ── ESTADO: cargando obras ─────────────────────────────── */}
        {cargandoObras ? (
          <EstadoCarga mensaje="Cargando obras…" />
        ) : obras.length === 0 ? (
          /* ── ESTADO: sin obras activas ───────────────────────── */
          <EstadoVacio
            titulo="No hay obras activas"
            descripcion="Para usar este módulo necesitás tener al menos una obra activa cargada en el sistema."
          />
        ) : (
          <>
            {/* ── SELECTOR DE OBRA ──────────────────────────────── */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
              <label
                htmlFor="selector-obra"
                className="block text-sm font-medium text-slate-700 mb-2"
              >
                Obra
              </label>
              <select
                id="selector-obra"
                value={obraSeleccionada}
                onChange={e => setObraSeleccionada(e.target.value)}
                className="w-full sm:w-96 px-3.5 py-2.5 text-sm rounded-lg
                           border border-slate-200 text-slate-900
                           focus:outline-none focus:ring-2 focus:ring-emerald-500
                           focus:border-transparent bg-white"
              >
                <option value="">— Seleccioná una obra —</option>
                {obras.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.codigo} · {o.nombre} ({o.cliente})
                  </option>
                ))}
              </select>
            </div>

            {/* Solo mostramos el formulario y la tabla si hay obra elegida */}
            {obraSeleccionada && (
              <>
                {/* ── FORMULARIO DE CARGA ────────────────────────── */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
                  <h2 className="text-slate-800 font-semibold text-sm mb-4">
                    Agregar presupuesto
                  </h2>

                  <form onSubmit={handleAgregar} noValidate>
                    {/* Grid de campos */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">

                      {/* Rubro */}
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                          Rubro
                        </label>
                        <select
                          value={form.rubro_id}
                          onChange={e => setForm(f => ({ ...f, rubro_id: e.target.value }))}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200
                                     text-slate-900 focus:outline-none focus:ring-2
                                     focus:ring-emerald-500 focus:border-transparent bg-white"
                          required
                        >
                          <option value="">— Seleccioná —</option>
                          {rubros.map(r => (
                            <option key={r.id} value={r.id}>{r.nombre}</option>
                          ))}
                        </select>
                      </div>

                      {/* Concepto */}
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                          Concepto
                        </label>
                        <input
                          type="text"
                          placeholder="Ej: Combustible YPF"
                          value={form.concepto}
                          onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200
                                     text-slate-900 placeholder:text-slate-400
                                     focus:outline-none focus:ring-2 focus:ring-emerald-500
                                     focus:border-transparent"
                          required
                        />
                      </div>

                      {/* Período */}
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                          Período
                        </label>
                        <select
                          value={form.periodo}
                          onChange={e => setForm(f => ({ ...f, periodo: e.target.value }))}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200
                                     text-slate-900 focus:outline-none focus:ring-2
                                     focus:ring-emerald-500 focus:border-transparent bg-white"
                        >
                          {PERIODOS.map(p => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Monto */}
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                          Monto ($)
                        </label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="0,00"
                          value={form.monto}
                          onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200
                                     text-slate-900 placeholder:text-slate-400
                                     focus:outline-none focus:ring-2 focus:ring-emerald-500
                                     focus:border-transparent"
                          required
                        />
                      </div>
                    </div>

                    {/* Error del formulario */}
                    {errorForm && (
                      <p className="text-red-600 text-sm mb-3 flex items-center gap-1.5">
                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                        </svg>
                        {errorForm}
                      </p>
                    )}

                    {/* Botón */}
                    <button
                      type="submit"
                      disabled={guardandoForm}
                      className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700
                                 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed
                                 text-white text-sm font-medium px-5 py-2.5 rounded-lg
                                 transition-colors duration-150"
                    >
                      {guardandoForm && (
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white
                                         rounded-full animate-spin" />
                      )}
                      {guardandoForm ? 'Guardando…' : 'Agregar'}
                    </button>
                  </form>
                </div>

                {/* ── TABLA DE PRESUPUESTOS ──────────────────────── */}
                {cargandoPresupuestos ? (
                  <EstadoCarga mensaje="Cargando presupuestos…" />
                ) : presupuestos.length === 0 ? (
                  <EstadoVacio
                    titulo="Sin presupuestos cargados"
                    descripcion="Esta obra todavía no tiene presupuestos. Usá el formulario de arriba para agregar el primero."
                  />
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">

                    {/* Error de edición (aparece sobre la tabla) */}
                    {errorEdicion && (
                      <div className="px-5 pt-4">
                        <MensajeError mensaje={errorEdicion} onCerrar={() => setErrorEdicion('')} />
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-40">
                              Rubro
                            </th>
                            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                              Concepto
                            </th>
                            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-44">
                              Período
                            </th>
                            <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-44">
                              Monto
                            </th>
                            <th className="px-5 py-3 w-36">
                              {/* columna acciones sin header */}
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {grupos.map((grupo, gi) => (
                            // Fragment por grupo de rubro
                            <GrupoRubro
                              key={grupo.nombreRubro}
                              grupo={grupo}
                              rubros={rubros}
                              periodos={PERIODOS}
                              esUltimo={gi === grupos.length - 1}
                              filaEditando={filaEditando}
                              valoresEdicion={valoresEdicion}
                              guardandoEdicion={guardandoEdicion}
                              eliminando={eliminando}
                              onIniciarEdicion={handleIniciarEdicion}
                              onCancelarEdicion={handleCancelarEdicion}
                              onGuardarEdicion={handleGuardarEdicion}
                              onEliminar={handleEliminar}
                              onChangeEdicion={(campo, valor) =>
                                setValoresEdicion(v => ({ ...v, [campo]: valor }))
                              }
                            />
                          ))}
                        </tbody>

                        {/* ── TOTAL GENERAL ─────────────────────── */}
                        <tfoot>
                          <tr className="bg-emerald-100 border-t-2 border-emerald-200">
                            <td colSpan={3} className="px-5 py-3 text-sm font-bold text-emerald-900">
                              Total general
                            </td>
                            <td className="px-5 py-3 text-right text-sm font-bold text-emerald-900">
                              {formatearPesos(totalGeneral)}
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Mensaje cuando no hay obra seleccionada */}
            {!obraSeleccionada && (
              <EstadoVacio
                titulo="Seleccioná una obra"
                descripcion="Elegí una obra del selector de arriba para ver y gestionar sus presupuestos."
                icono="obra"
              />
            )}
          </>
        )}

      </main>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// SUBCOMPONENTE: GrupoRubro
// Renderiza las filas de un grupo de rubro + su fila de subtotal.
// ══════════════════════════════════════════════════════════════
function GrupoRubro({
  grupo, rubros, periodos, esUltimo,
  filaEditando, valoresEdicion, guardandoEdicion, eliminando,
  onIniciarEdicion, onCancelarEdicion, onGuardarEdicion,
  onEliminar, onChangeEdicion,
}) {
  return (
    <>
      {/* Filas de datos */}
      {grupo.filas.map((p, idx) => (
        filaEditando === p.id
          ? /* ── Fila en modo edición ─── */
            <FilaEdicion
              key={p.id}
              presupuesto={p}
              rubros={rubros}
              periodos={periodos}
              valores={valoresEdicion}
              guardando={guardandoEdicion}
              onChange={onChangeEdicion}
              onGuardar={() => onGuardarEdicion(p.id)}
              onCancelar={onCancelarEdicion}
            />
          : /* ── Fila normal ─────────── */
            <FilaNormal
              key={p.id}
              presupuesto={p}
              esEliminar={eliminando === p.id}
              onEditar={() => onIniciarEdicion(p)}
              onEliminar={() => onEliminar(p.id)}
            />
      ))}

      {/* ── Fila de subtotal por rubro ─────────────────────────── */}
      <tr className={`bg-emerald-50 ${!esUltimo ? 'border-b border-emerald-100' : ''}`}>
        <td colSpan={3} className="px-5 py-2.5 text-xs font-semibold text-emerald-800">
          Subtotal {grupo.nombreRubro}
        </td>
        <td className="px-5 py-2.5 text-right text-xs font-semibold text-emerald-800">
          {formatearPesos(grupo.subtotal)}
        </td>
        <td />
      </tr>
    </>
  )
}

// ══════════════════════════════════════════════════════════════
// SUBCOMPONENTE: FilaNormal
// Fila de tabla en modo lectura con botones Editar / Eliminar
// ══════════════════════════════════════════════════════════════
function FilaNormal({ presupuesto: p, esEliminar, onEditar, onEliminar }) {
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
      {/* Rubro */}
      <td className="px-5 py-3.5 text-slate-700">
        {p.rubros?.nombre ?? '—'}
      </td>
      {/* Concepto */}
      <td className="px-5 py-3.5 text-slate-700">
        {p.concepto}
      </td>
      {/* Período */}
      <td className="px-5 py-3.5 text-slate-600">
        {formatearPeriodo(p.periodo)}
      </td>
      {/* Monto */}
      <td className="px-5 py-3.5 text-right font-medium text-slate-800 tabular-nums">
        {formatearPesos(p.monto)}
      </td>
      {/* Acciones */}
      <td className="px-5 py-3.5">
        <div className="flex items-center justify-end gap-2">
          {/* Botón Editar */}
          <button
            onClick={onEditar}
            disabled={esEliminar}
            className="text-xs font-medium bg-blue-600 hover:bg-blue-700
                       disabled:opacity-40 disabled:cursor-not-allowed
                       text-white px-3 py-1.5 rounded-md transition-colors"
          >
            Editar
          </button>

          {/* Botón Eliminar / Confirmar */}
          {esEliminar ? (
            /* Estado: eliminando (spinner) */
            <span className="flex items-center gap-1.5 text-xs text-red-500 px-3 py-1.5">
              <span className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-500
                               rounded-full animate-spin" />
              Eliminando…
            </span>
          ) : (
            <button
              onClick={onEliminar}
              className="text-xs font-medium bg-red-500 hover:bg-red-600
                         text-white px-3 py-1.5 rounded-md transition-colors"
            >
              Eliminar
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ══════════════════════════════════════════════════════════════
// SUBCOMPONENTE: FilaEdicion
// Fila de tabla en modo edición inline con campos editables
// ══════════════════════════════════════════════════════════════
function FilaEdicion({ presupuesto, rubros, periodos, valores, guardando, onChange, onGuardar, onCancelar }) {
  return (
    <tr className="border-b border-blue-200 bg-blue-50">
      {/* Rubro editable */}
      <td className="px-3 py-2.5">
        <select
          value={valores.rubro_id ?? ''}
          onChange={e => onChange('rubro_id', e.target.value)}
          className="w-full px-2.5 py-1.5 text-sm rounded-md border border-blue-300
                     text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500
                     bg-white"
        >
          <option value="">— Rubro —</option>
          {rubros.map(r => (
            <option key={r.id} value={r.id}>{r.nombre}</option>
          ))}
        </select>
      </td>

      {/* Concepto editable */}
      <td className="px-3 py-2.5">
        <input
          type="text"
          value={valores.concepto ?? ''}
          onChange={e => onChange('concepto', e.target.value)}
          className="w-full px-2.5 py-1.5 text-sm rounded-md border border-blue-300
                     text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </td>

      {/* Período editable */}
      <td className="px-3 py-2.5">
        <select
          value={valores.periodo ?? ''}
          onChange={e => onChange('periodo', e.target.value)}
          className="w-full px-2.5 py-1.5 text-sm rounded-md border border-blue-300
                     text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500
                     bg-white"
        >
          {periodos.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </td>

      {/* Monto editable */}
      <td className="px-3 py-2.5">
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={valores.monto ?? ''}
          onChange={e => onChange('monto', e.target.value)}
          className="w-full px-2.5 py-1.5 text-sm rounded-md border border-blue-300
                     text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500
                     text-right"
        />
      </td>

      {/* Acciones edición */}
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onGuardar}
            disabled={guardando}
            className="text-xs font-medium bg-emerald-600 hover:bg-emerald-700
                       disabled:opacity-50 disabled:cursor-not-allowed
                       text-white px-3 py-1.5 rounded-md transition-colors
                       inline-flex items-center gap-1.5"
          >
            {guardando && (
              <span className="w-3 h-3 border-2 border-white/30 border-t-white
                               rounded-full animate-spin" />
            )}
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            onClick={onCancelar}
            disabled={guardando}
            className="text-xs font-medium bg-slate-400 hover:bg-slate-500
                       disabled:opacity-50 text-white px-3 py-1.5 rounded-md transition-colors"
          >
            Cancelar
          </button>
        </div>
      </td>
    </tr>
  )
}

// ══════════════════════════════════════════════════════════════
// SUBCOMPONENTE: EstadoCarga
// Spinner centrado con mensaje
// ══════════════════════════════════════════════════════════════
function EstadoCarga({ mensaje }) {
  return (
    <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
      <span className="w-5 h-5 border-2 border-slate-300 border-t-emerald-500
                       rounded-full animate-spin" />
      <span className="text-sm">{mensaje}</span>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// SUBCOMPONENTE: EstadoVacio
// Estado vacío con ícono, título y descripción
// ══════════════════════════════════════════════════════════════
function EstadoVacio({ titulo, descripcion }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {/* Ícono decorativo */}
      <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full
                      flex items-center justify-center mb-4">
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24"
             strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125
               1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0
               12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125
               1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0
               1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      </div>
      <p className="text-slate-700 font-medium text-sm">{titulo}</p>
      <p className="text-slate-500 text-sm mt-1 max-w-xs">{descripcion}</p>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// SUBCOMPONENTE: MensajeError
// Banner de error inline con botón para cerrar
// ══════════════════════════════════════════════════════════════
function MensajeError({ mensaje, onCerrar }) {
  return (
    <div className="flex items-start justify-between gap-3 bg-red-50 border border-red-100
                    text-red-700 text-sm rounded-lg px-4 py-3 mb-5">
      <div className="flex items-start gap-2.5">
        <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673
               1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485
               2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110
               5zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        <span>{mensaje}</span>
      </div>
      {/* Botón cerrar */}
      <button
        onClick={onCerrar}
        className="text-red-400 hover:text-red-600 shrink-0 transition-colors"
        aria-label="Cerrar error"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24"
             strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
