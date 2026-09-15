// pages/operaciones/VentasProyectadas.jsx
// Módulo de carga de ventas proyectadas para el rol 'operaciones'.
// Ruta: /operaciones/ventas
//
// Laura carga por obra, período, rubro y monto los ingresos esperados.
// Los abonos tienen botón para replicar a meses siguientes.
// Finanzas consume estos datos para registrarlos como movimientos reales.

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar'

const RUBROS = [
  { value: 'abono',                    label: 'Abono' },
  { value: 'correctivos',              label: 'Correctivos' },
  { value: 'extras',                   label: 'Extras' },
  { value: 'anticipo',                 label: 'Anticipo' },
  { value: 'certificados_ejecucion',   label: 'Certificados de ejecución' },
]

const fmtARS = n => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 2,
}).format(n ?? 0)

function generarPeriodos() {
  const lista = []
  const hoy = new Date()
  for (let i = -12; i <= 24; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1)
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

const FORM_VACIO = {
  rubro:   '',
  periodo: periodoActual(),
  monto:   '',
}

export default function VentasProyectadas() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [obras,          setObras]          = useState([])
  const [obraSeleccionada, setObraSeleccionada] = useState('')
  const [ventas,         setVentas]         = useState([])
  const [cargandoObras,  setCargandoObras]  = useState(true)
  const [cargando,       setCargando]       = useState(false)
  const [error,          setError]          = useState('')
  const [form,           setForm]           = useState(FORM_VACIO)
  const [guardando,      setGuardando]      = useState(false)
  const [errorForm,      setErrorForm]      = useState('')
  const [eliminando,     setEliminando]     = useState(null)

  // Modal de replicar abono
  const [modalReplicar,  setModalReplicar]  = useState(null) // venta a replicar
  const [mesesReplicar,  setMesesReplicar]  = useState(3)
  const [replicando,     setReplicando]     = useState(false)
  const [errorReplicar,  setErrorReplicar]  = useState('')

  useEffect(() => {
    async function cargarObras() {
      setCargandoObras(true)
      const { data, error } = await supabase
        .from('obras')
        .select('id, codigo, nombre, cliente')
        .eq('activa', true)
        .order('codigo')
      if (error) setError('No se pudieron cargar las obras.')
      setObras(data ?? [])
      setCargandoObras(false)
    }
    cargarObras()
  }, [])

  const cargarVentas = useCallback(async (obraId) => {
    if (!obraId) { setVentas([]); return }
    setCargando(true)
    const { data, error } = await supabase
      .from('ventas_proyectadas')
      .select('id, rubro, periodo, monto, registrado')
      .eq('obra_id', obraId)
      .order('periodo', { ascending: true })
      .order('rubro',   { ascending: true })
    if (error) setError('No se pudieron cargar las ventas.')
    setVentas(data ?? [])
    setCargando(false)
  }, [])

  useEffect(() => {
    cargarVentas(obraSeleccionada)
    setErrorForm('')
  }, [obraSeleccionada, cargarVentas])

  async function handleAgregar(e) {
    e.preventDefault()
    setErrorForm('')
    if (!obraSeleccionada)  { setErrorForm('Seleccioná una obra.'); return }
    if (!form.rubro)        { setErrorForm('Seleccioná un rubro.'); return }
    if (!form.monto || isNaN(Number(form.monto)) || Number(form.monto) <= 0) {
      setErrorForm('Ingresá un monto válido mayor a cero.'); return
    }

    setGuardando(true)
    const { error } = await supabase.from('ventas_proyectadas').insert({
      obra_id:    obraSeleccionada,
      rubro:      form.rubro,
      periodo:    form.periodo,
      monto:      Number(form.monto),
      created_by: user.id,
    })
    if (error) { setErrorForm('Error al guardar. Intentá de nuevo.'); setGuardando(false); return }
    setForm(FORM_VACIO)
    setGuardando(false)
    await cargarVentas(obraSeleccionada)
  }

  async function handleEliminar(id) {
    setEliminando(id)
    await supabase.from('ventas_proyectadas').delete().eq('id', id)
    setEliminando(null)
    await cargarVentas(obraSeleccionada)
  }

  async function handleReplicar() {
    if (!modalReplicar || mesesReplicar < 1) return
    setReplicando(true)
    setErrorReplicar('')

    const base = new Date(modalReplicar.periodo + 'T00:00:00')
    const inserts = []
    for (let i = 1; i <= mesesReplicar; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1)
      const periodo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      inserts.push({
        obra_id:    obraSeleccionada,
        rubro:      modalReplicar.rubro,
        periodo,
        monto:      modalReplicar.monto,
        created_by: user.id,
      })
    }

    const { error } = await supabase.from('ventas_proyectadas').insert(inserts)
    if (error) { setErrorReplicar('Error al replicar. Intentá de nuevo.'); setReplicando(false); return }
    setModalReplicar(null)
    setReplicando(false)
    await cargarVentas(obraSeleccionada)
  }

  // Agrupar por período para la tabla
  function agruparPorPeriodo(lista) {
    const mapa = new Map()
    lista.forEach(v => {
      if (!mapa.has(v.periodo)) mapa.set(v.periodo, [])
      mapa.get(v.periodo).push(v)
    })
    return Array.from(mapa.entries()).sort(([a], [b]) => a.localeCompare(b))
  }

  const grupos     = agruparPorPeriodo(ventas)
  const totalGeneral = ventas.reduce((s, v) => s + Number(v.monto), 0)

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar titulo="Operaciones" accentColor="text-emerald-400" />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">

        {/* Encabezado */}
        <div className="mb-8 flex items-center justify-between">
          <div>
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
            <h1 className="text-slate-900 text-2xl font-semibold tracking-tight">Ventas Proyectadas</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Cargá los ingresos esperados por obra, período y rubro
            </p>
          </div>
        </div>

        {error && <MensajeError mensaje={error} onCerrar={() => setError('')} />}

        {cargandoObras ? (
          <EstadoCarga mensaje="Cargando obras…" />
        ) : obras.length === 0 ? (
          <EstadoVacio titulo="No hay obras activas" descripcion="Necesitás al menos una obra activa." />
        ) : (
          <>
            {/* Selector de obra */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">Obra</label>
              <select
                value={obraSeleccionada}
                onChange={e => setObraSeleccionada(e.target.value)}
                className={selCls}
              >
                <option value="">— Seleccioná una obra —</option>
                {obras.map(o => (
                  <option key={o.id} value={o.id}>{o.codigo} · {o.nombre} ({o.cliente})</option>
                ))}
              </select>
            </div>

            {obraSeleccionada && (
              <>
                {/* Formulario */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
                  <h2 className="text-slate-800 font-semibold text-sm mb-4">Agregar venta proyectada</h2>
                  <form onSubmit={handleAgregar} noValidate>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">Rubro</label>
                        <select
                          value={form.rubro}
                          onChange={e => setForm(f => ({ ...f, rubro: e.target.value }))}
                          className={selCls}
                        >
                          <option value="">— Seleccioná —</option>
                          {RUBROS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">Período</label>
                        <select
                          value={form.periodo}
                          onChange={e => setForm(f => ({ ...f, periodo: e.target.value }))}
                          className={selCls}
                        >
                          {PERIODOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">Monto ($)</label>
                        <input
                          type="number" min="0.01" step="0.01" placeholder="0,00"
                          value={form.monto}
                          onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200
                                     text-slate-900 placeholder:text-slate-400
                                     focus:outline-none focus:ring-2 focus:ring-emerald-500
                                     focus:border-transparent"
                        />
                      </div>
                    </div>

                    {errorForm && (
                      <p className="text-red-600 text-sm mb-3 flex items-center gap-1.5">
                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                        </svg>
                        {errorForm}
                      </p>
                    )}

                    <button
                      type="submit" disabled={guardando}
                      className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700
                                 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5
                                 rounded-lg transition-colors"
                    >
                      {guardando && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      {guardando ? 'Guardando…' : 'Agregar'}
                    </button>
                  </form>
                </div>

                {/* Tabla */}
                {cargando ? (
                  <EstadoCarga mensaje="Cargando ventas…" />
                ) : ventas.length === 0 ? (
                  <EstadoVacio titulo="Sin ventas cargadas" descripcion="Usá el formulario de arriba para agregar la primera." />
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Período</th>
                            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Rubro</th>
                            <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Monto</th>
                            <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                            <th className="px-5 py-3 w-48" />
                          </tr>
                        </thead>
                        <tbody>
                          {grupos.map(([periodo, filas]) => (
                            filas.map((v, i) => (
                              <tr key={v.id} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                                <td className="px-5 py-3.5 text-slate-700 text-xs">
                                  {i === 0 ? <span className="font-medium text-slate-800">{labelPeriodo(periodo)}</span> : null}
                                </td>
                                <td className="px-5 py-3.5 text-slate-700 text-xs">
                                  {RUBROS.find(r => r.value === v.rubro)?.label ?? v.rubro}
                                </td>
                                <td className="px-5 py-3.5 text-right tabular-nums font-medium text-slate-800 text-xs">
                                  {fmtARS(v.monto)}
                                </td>
                                <td className="px-5 py-3.5 text-center">
                                  {v.registrado ? (
                                    <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100
                                                     px-2 py-0.5 rounded-full font-medium">
                                      Registrado
                                    </span>
                                  ) : (
                                    <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100
                                                     px-2 py-0.5 rounded-full font-medium">
                                      Pendiente
                                    </span>
                                  )}
                                </td>
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center justify-end gap-2">
                                    {/* Replicar — solo abonos no registrados */}
                                    {v.rubro === 'abono' && !v.registrado && (
                                      <button
                                        onClick={() => { setModalReplicar(v); setMesesReplicar(3); setErrorReplicar('') }}
                                        className="text-xs font-medium bg-emerald-50 hover:bg-emerald-100
                                                   text-emerald-700 border border-emerald-200
                                                   px-3 py-1.5 rounded-md transition-colors"
                                      >
                                        Replicar
                                      </button>
                                    )}
                                    {/* Eliminar — solo si no está registrado */}
                                    {!v.registrado && (
                                      eliminando === v.id ? (
                                        <span className="flex items-center gap-1.5 text-xs text-red-500 px-3 py-1.5">
                                          <span className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
                                          Eliminando…
                                        </span>
                                      ) : (
                                        <button
                                          onClick={() => handleEliminar(v.id)}
                                          className="text-xs font-medium bg-red-500 hover:bg-red-600
                                                     text-white px-3 py-1.5 rounded-md transition-colors"
                                        >
                                          Eliminar
                                        </button>
                                      )
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-emerald-100 border-t-2 border-emerald-200">
                            <td colSpan={2} className="px-5 py-3 text-sm font-bold text-emerald-900">Total general</td>
                            <td className="px-5 py-3 text-right text-sm font-bold text-emerald-900 tabular-nums">
                              {fmtARS(totalGeneral)}
                            </td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {!obraSeleccionada && (
              <EstadoVacio titulo="Seleccioná una obra" descripcion="Elegí una obra para ver y gestionar sus ventas proyectadas." />
            )}
          </>
        )}
      </main>

      {/* Modal replicar abono */}
      {modalReplicar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-slate-900 font-semibold text-base mb-1">Replicar abono</h3>
            <p className="text-slate-500 text-sm mb-5">
              Replicá el abono de <span className="font-medium text-slate-700">{labelPeriodo(modalReplicar.periodo)}</span> ({fmtARS(modalReplicar.monto)}) a los siguientes meses.
            </p>

            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Cantidad de meses a replicar
            </label>
            <input
              type="number" min="1" max="24"
              value={mesesReplicar}
              onChange={e => setMesesReplicar(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200
                         focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-4"
            />

            {errorReplicar && (
              <p className="text-red-600 text-xs mb-3">{errorReplicar}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleReplicar}
                disabled={replicando}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50
                           text-white text-sm font-medium py-2.5 rounded-lg transition-colors
                           inline-flex items-center justify-center gap-2"
              >
                {replicando && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {replicando ? 'Replicando…' : `Replicar ${mesesReplicar} ${mesesReplicar === 1 ? 'mes' : 'meses'}`}
              </button>
              <button
                onClick={() => setModalReplicar(null)}
                disabled={replicando}
                className="flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-50
                           text-slate-700 text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EstadoCarga({ mensaje }) {
  return (
    <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
      <span className="w-5 h-5 border-2 border-slate-300 border-t-emerald-500 rounded-full animate-spin" />
      <span className="text-sm">{mensaje}</span>
    </div>
  )
}

function EstadoVacio({ titulo, descripcion }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4">
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0
               0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
        </svg>
      </div>
      <p className="text-slate-700 font-medium text-sm">{titulo}</p>
      <p className="text-slate-500 text-sm mt-1 max-w-xs">{descripcion}</p>
    </div>
  )
}

function MensajeError({ mensaje, onCerrar }) {
  return (
    <div className="flex items-start justify-between gap-3 bg-red-50 border border-red-100
                    text-red-700 text-sm rounded-lg px-4 py-3 mb-5">
      <span>{mensaje}</span>
      <button onClick={onCerrar} className="text-red-400 hover:text-red-600 shrink-0">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

const selCls = `w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200
  text-slate-900 bg-white focus:outline-none focus:ring-2
  focus:ring-emerald-500 focus:border-transparent`