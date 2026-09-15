// pages/finanzas/VentasProyectadas.jsx
// Módulo de ventas proyectadas para el rol 'finanzas'.
// Ruta: /finanzas/ventas
//
// Muestra las ventas cargadas por Operaciones.
// Finanzas puede registrar cada venta como ingreso_cliente real
// en la tabla movimientos, lo que afecta el Cash Flow.

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar'

const RUBROS = [
  { value: 'abono',                  label: 'Abono' },
  { value: 'correctivos',            label: 'Correctivos' },
  { value: 'extras',                 label: 'Extras' },
  { value: 'anticipo',               label: 'Anticipo' },
  { value: 'certificados_ejecucion', label: 'Certificados de ejecución' },
]

const fmtARS = n => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 2,
}).format(n ?? 0)

function labelRubro(value) {
  return RUBROS.find(r => r.value === value)?.label ?? value
}

function labelPeriodo(fechaStr) {
  if (!fechaStr) return '—'
  const d = new Date(fechaStr + 'T00:00:00')
  const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function generarPeriodos() {
  const lista = [{ value: 'todos', label: '— Todos los períodos —' }]
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

export default function VentasProyectadasFinanzas() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [obras,          setObras]          = useState([])
  const [cuentas,        setCuentas]        = useState([])
  const [obraFiltro,     setObraFiltro]     = useState('')
  const [periodoFiltro,  setPeriodoFiltro]  = useState('todos')
  const [estadoFiltro,   setEstadoFiltro]   = useState('pendiente') // 'todos' | 'pendiente' | 'registrado'
  const [ventas,         setVentas]         = useState([])
  const [cargando,       setCargando]       = useState(false)
  const [error,          setError]          = useState('')

  // Modal registrar ingreso
  const [modalVenta,     setModalVenta]     = useState(null)
  const [formRegistro,   setFormRegistro]   = useState({ cuenta_id: '', fecha_pago: '', monto_neto: '', observaciones: '' })
  const [registrando,    setRegistrando]    = useState(false)
  const [errorModal,     setErrorModal]     = useState('')

  useEffect(() => {
    async function cargarMaestros() {
      const [{ data: dataObras }, { data: dataCuentas }] = await Promise.all([
        supabase.from('obras').select('id, codigo, nombre, cliente').eq('activa', true).order('codigo'),
        supabase.from('cuentas').select('id, nombre, tipo').eq('activa', true).order('nombre'),
      ])
      setObras(dataObras   ?? [])
      setCuentas(dataCuentas ?? [])
    }
    cargarMaestros()
  }, [])

  const cargarVentas = useCallback(async () => {
    setCargando(true)
    setError('')

    let q = supabase
      .from('ventas_proyectadas')
      .select('id, obra_id, rubro, periodo, monto, registrado, obras(codigo, nombre, cliente)')
      .order('periodo', { ascending: true })
      .order('rubro',   { ascending: true })

    if (obraFiltro)    q = q.eq('obra_id', obraFiltro)
    if (periodoFiltro !== 'todos') q = q.eq('periodo', periodoFiltro)
    if (estadoFiltro === 'pendiente')  q = q.eq('registrado', false)
    if (estadoFiltro === 'registrado') q = q.eq('registrado', true)

    const { data, error } = await q
    if (error) { setError('No se pudieron cargar las ventas.'); setCargando(false); return }
    setVentas(data ?? [])
    setCargando(false)
  }, [obraFiltro, periodoFiltro, estadoFiltro])

  useEffect(() => { cargarVentas() }, [cargarVentas])

  function abrirModal(venta) {
    setModalVenta(venta)
    setFormRegistro({
      cuenta_id:     cuentas[0]?.id ?? '',
      fecha_pago:    '',
      monto_neto:    String(venta.monto),
      observaciones: '',
    })
    setErrorModal('')
  }

  async function handleRegistrar() {
    setErrorModal('')
    if (!formRegistro.cuenta_id)  { setErrorModal('Seleccioná una cuenta.'); return }
    if (!formRegistro.fecha_pago) { setErrorModal('Ingresá la fecha de cobro.'); return }
    if (!formRegistro.monto_neto || Number(formRegistro.monto_neto) <= 0) {
      setErrorModal('Ingresá un monto válido.'); return
    }

    setRegistrando(true)

    // 1. Crear el movimiento de ingreso
    const { data: movData, error: movError } = await supabase
      .from('movimientos')
      .insert({
        tipo:              'ingreso',
        categoria:         'ingreso_cliente',
        proveedor_cliente: modalVenta.obras?.nombre ?? '',
        monto_bruto:       modalVenta.monto,
        monto_neto:        Number(formRegistro.monto_neto),
        obra_id:           modalVenta.obra_id,
        periodo:           modalVenta.periodo,
        forma_pago:        'transferencia',
        fecha_pago:        formRegistro.fecha_pago,
        cuenta_id:         formRegistro.cuenta_id,
        estado:            'ejecutado',
        concepto:          labelRubro(modalVenta.rubro),
        observaciones:     formRegistro.observaciones || null,
        created_by:        user.id,
      })
      .select('id')
      .single()

    if (movError) {
      setErrorModal('Error al crear el movimiento. Intentá de nuevo.')
      setRegistrando(false)
      return
    }

    // 2. Marcar la venta como registrada y vincular el movimiento
    const { error: updError } = await supabase
      .from('ventas_proyectadas')
      .update({ registrado: true, movimiento_id: movData.id })
      .eq('id', modalVenta.id)

    if (updError) {
      setErrorModal('El ingreso se creó pero no se pudo marcar como registrado.')
      setRegistrando(false)
      return
    }

    setModalVenta(null)
    setRegistrando(false)
    await cargarVentas()
  }

  // Resumen cards
  const totalPendiente  = ventas.filter(v => !v.registrado).reduce((s, v) => s + Number(v.monto), 0)
  const totalRegistrado = ventas.filter(v =>  v.registrado).reduce((s, v) => s + Number(v.monto), 0)
  const totalGeneral    = ventas.reduce((s, v) => s + Number(v.monto), 0)

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar titulo="Cash Flow" accentColor="text-blue-400" />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">

        {/* Encabezado */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/finanzas')}
            className="text-blue-600 text-sm hover:text-blue-800 transition-colors
                       flex items-center gap-1.5 mb-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Panel de Finanzas
          </button>
          <h1 className="text-slate-900 text-2xl font-semibold tracking-tight">Ventas Proyectadas</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Ingresos esperados cargados por Operaciones. Registralos para que impacten en el Cash Flow.
          </p>
        </div>

        {/* Filtros */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Obra</label>
              <select value={obraFiltro} onChange={e => setObraFiltro(e.target.value)} className={selCls}>
                <option value="">— Todas las obras —</option>
                {obras.map(o => <option key={o.id} value={o.id}>{o.codigo} · {o.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Período</label>
              <select value={periodoFiltro} onChange={e => setPeriodoFiltro(e.target.value)} className={selCls}>
                {PERIODOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Estado</label>
              <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)} className={selCls}>
                <option value="todos">Todos</option>
                <option value="pendiente">Pendientes</option>
                <option value="registrado">Registrados</option>
              </select>
            </div>
          </div>
        </div>

        {/* Cards resumen */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <CardResumen label="Total proyectado" valor={fmtARS(totalGeneral)} color="text-slate-900" />
          <CardResumen label="Pendiente de registrar" valor={fmtARS(totalPendiente)} color="text-amber-600" />
          <CardResumen label="Ya registrado" valor={fmtARS(totalRegistrado)} color="text-emerald-600" />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-lg px-4 py-3 mb-5 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {cargando ? (
          <div className="flex items-center justify-center py-24 gap-3 text-slate-500">
            <span className="w-5 h-5 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-sm">Cargando ventas…</span>
          </div>
        ) : ventas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0
                     0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
              </svg>
            </div>
            <p className="text-slate-700 font-medium text-sm">Sin ventas para estos filtros</p>
            <p className="text-slate-400 text-xs mt-1">Operaciones todavía no cargó ventas proyectadas, o no coinciden con los filtros.</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Obra</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Período</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Rubro</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Monto</th>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                    <th className="px-5 py-3 w-40" />
                  </tr>
                </thead>
                <tbody>
                  {ventas.map(v => (
                    <tr key={v.id} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3.5 text-xs text-slate-700">
                        <span className="font-medium text-slate-800">{v.obras?.codigo}</span>
                        <span className="text-slate-400 mx-1">·</span>
                        {v.obras?.nombre}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">{labelPeriodo(v.periodo)}</td>
                      <td className="px-5 py-3.5 text-xs text-slate-700">{labelRubro(v.rubro)}</td>
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
                      <td className="px-5 py-3.5 text-right">
                        {!v.registrado && (
                          <button
                            onClick={() => abrirModal(v)}
                            className="text-xs font-medium bg-blue-600 hover:bg-blue-700
                                       text-white px-3 py-1.5 rounded-md transition-colors"
                          >
                            Registrar ingreso
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-300">
                    <td colSpan={3} className="px-5 py-3 text-sm font-bold text-slate-800">Total</td>
                    <td className="px-5 py-3 text-right tabular-nums text-sm font-bold text-slate-800">
                      {fmtARS(totalGeneral)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Modal registrar ingreso */}
      {modalVenta && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-slate-900 font-semibold text-base mb-1">Registrar ingreso</h3>
            <p className="text-slate-500 text-sm mb-5">
              {labelRubro(modalVenta.rubro)} · {labelPeriodo(modalVenta.periodo)} ·{' '}
              <span className="font-medium text-slate-700">{modalVenta.obras?.codigo} {modalVenta.obras?.nombre}</span>
            </p>

            <div className="space-y-4 mb-5">
              {/* Cuenta */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Cuenta de cobro</label>
                <select
                  value={formRegistro.cuenta_id}
                  onChange={e => setFormRegistro(f => ({ ...f, cuenta_id: e.target.value }))}
                  className={selCls}
                >
                  <option value="">— Seleccioná —</option>
                  {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>

              {/* Fecha de cobro */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Fecha de cobro</label>
                <input
                  type="date"
                  value={formRegistro.fecha_pago}
                  onChange={e => setFormRegistro(f => ({ ...f, fecha_pago: e.target.value }))}
                  className={selCls}
                />
              </div>

              {/* Monto neto */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Monto neto cobrado
                  <span className="text-slate-400 font-normal ml-1">(proyectado: {fmtARS(modalVenta.monto)})</span>
                </label>
                <input
                  type="number" min="0.01" step="0.01"
                  value={formRegistro.monto_neto}
                  onChange={e => setFormRegistro(f => ({ ...f, monto_neto: e.target.value }))}
                  className={selCls}
                />
              </div>

              {/* Observaciones */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Observaciones (opcional)</label>
                <input
                  type="text" placeholder="Ej: Retención IIBB descontada"
                  value={formRegistro.observaciones}
                  onChange={e => setFormRegistro(f => ({ ...f, observaciones: e.target.value }))}
                  className={selCls}
                />
              </div>
            </div>

            {errorModal && (
              <p className="text-red-600 text-xs mb-4 flex items-center gap-1.5">
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                {errorModal}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleRegistrar}
                disabled={registrando}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50
                           text-white text-sm font-medium py-2.5 rounded-lg transition-colors
                           inline-flex items-center justify-center gap-2"
              >
                {registrando && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {registrando ? 'Registrando…' : 'Confirmar ingreso'}
              </button>
              <button
                onClick={() => setModalVenta(null)}
                disabled={registrando}
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

function CardResumen({ label, valor, color }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${color}`}>{valor}</p>
    </div>
  )
}

const selCls = `w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200
  text-slate-900 bg-white focus:outline-none focus:ring-2
  focus:ring-blue-500 focus:border-transparent`