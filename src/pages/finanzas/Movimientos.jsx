// pages/finanzas/Movimientos.jsx
// Módulo de movimientos para el rol 'finanzas'.
// Ruta: /finanzas/movimientos
//
// Orquesta tres subcomponentes:
//   FormularioMovimiento → alta de nuevos movimientos
//   TablaMovimientos     → listado con filtros y acciones
//   ModalNotas           → notas de crédito/débito de facturas
//
// También incluye al final la sección de configuración
// de débitos automáticos (SeccionDebitos).

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar'
import FormularioMovimiento from './components/FormularioMovimiento'
import TablaMovimientos     from './components/TablaMovimientos'
import ModalNotas           from './components/ModalNotas'

export default function Movimientos() {
  const navigate = useNavigate()
  const { user } = useAuth()

  // ── Datos maestros (se cargan una vez al montar) ───────────
  const [obras,    setObras]    = useState([])
  const [rubros,   setRubros]   = useState([])
  const [cuentas,  setCuentas]  = useState([])
  const [debitos,  setDebitos]  = useState([])

  // ── Movimientos ────────────────────────────────────────────
  const [movimientos, setMovimientos] = useState([])
  const [cargando,    setCargando]    = useState(true)
  const [errorGlobal, setErrorGlobal] = useState('')

  // ── UI state ───────────────────────────────────────────────
  const [mostrarForm, setMostrarForm] = useState(false)
  const [modalNotas,  setModalNotas]  = useState(null) // objeto movimiento o null

  // ─────────────────────────────────────────────────────────
  // CARGA DE DATOS MAESTROS
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    async function cargarMaestros() {
      const [
        { data: dataObras },
        { data: dataRubros },
        { data: dataCuentas },
        { data: dataDebitos },
      ] = await Promise.all([
        supabase.from('obras').select('id, codigo, nombre, activa').eq('activa', true).order('codigo'),
        supabase.from('rubros').select('id, nombre, tipo, activo').eq('activo', true).order('nombre'),
        supabase.from('cuentas').select('id, nombre, tipo, activa').eq('activa', true).order('nombre'),
        supabase.from('debitos_automaticos_config')
          .select('id, nombre, monto_estimado, dia_del_mes, rubro_id, obra_id')
          .eq('activo', true)
          .order('nombre'),
      ])
      setObras(dataObras   ?? [])
      setRubros(dataRubros  ?? [])
      setCuentas(dataCuentas ?? [])
      setDebitos(dataDebitos ?? [])
    }
    cargarMaestros()
  }, [])

  // ─────────────────────────────────────────────────────────
  // CARGA DE MOVIMIENTOS
  // Join a rubros, obras y cuentas para mostrar nombres.
  // También hace un LEFT JOIN con notas para contar cuántas
  // tiene cada factura (campo notas_count).
  // ─────────────────────────────────────────────────────────
  const cargarMovimientos = useCallback(async () => {
    setCargando(true)
    setErrorGlobal('')

    const { data, error } = await supabase
      .from('movimientos')
      .select(`
        id, tipo, categoria, proveedor_cliente, numero_factura,
        fecha_factura, monto_bruto, monto_neto,
        concepto, periodo, forma_pago, numero_op, fecha_pago,
        estado, observaciones, created_at,
        obra_id, rubro_id, cuenta_id,
        rubros  ( id, nombre ),
        obras   ( id, codigo, nombre ),
        cuentas ( id, nombre )
      `)
      .order('fecha_pago', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (error) {
      setErrorGlobal('No se pudieron cargar los movimientos.')
      setCargando(false)
      return
    }

    // Contamos notas por movimiento en una query separada
    // (Supabase no soporta COUNT en joins relacionales de forma directa)
    const movIds = (data ?? []).map(m => m.id)
    let notasCount = {}
    if (movIds.length > 0) {
      const { data: notasData } = await supabase
        .from('notas')
        .select('movimiento_id')
        .in('movimiento_id', movIds)
      ;(notasData ?? []).forEach(n => {
        notasCount[n.movimiento_id] = (notasCount[n.movimiento_id] ?? 0) + 1
      })
    }

    // Enriquecemos cada movimiento con notas_count
    const enriquecidos = (data ?? []).map(m => ({
      ...m,
      notas_count: notasCount[m.id] ?? 0,
    }))

    setMovimientos(enriquecidos)
    setCargando(false)
  }, [])

  useEffect(() => { cargarMovimientos() }, [cargarMovimientos])

  // ─────────────────────────────────────────────────────────
  // ELIMINAR MOVIMIENTO
  // ─────────────────────────────────────────────────────────
  async function handleEliminar(id) {
    setErrorGlobal('')
    const { error } = await supabase.from('movimientos').delete().eq('id', id)
    if (error) { setErrorGlobal('No se pudo eliminar el movimiento.'); return }
    await cargarMovimientos()
  }

  // ── RENDER ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      <Navbar titulo="Cash Flow" accentColor="text-blue-400" />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">

        {/* Encabezado */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <button onClick={() => navigate('/finanzas')}
              className="text-blue-600 text-sm hover:text-blue-800 transition-colors
                         flex items-center gap-1.5 mb-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Panel de Finanzas
            </button>
            <h1 className="text-slate-900 text-2xl font-semibold tracking-tight">Movimientos</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Ingresos y egresos proyectados y ejecutados
            </p>
          </div>

          {/* Botón Nuevo movimiento */}
          <button
            onClick={() => { setMostrarForm(v => !v); setErrorGlobal('') }}
            className="shrink-0 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700
                       text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
            {mostrarForm ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancelar
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Nuevo movimiento
              </>
            )}
          </button>
        </div>

        {/* Error global */}
        {errorGlobal && (
          <div className="flex items-start justify-between gap-3 bg-red-50 border border-red-100
                          text-red-700 text-sm rounded-lg px-4 py-3 mb-5">
            <span>{errorGlobal}</span>
            <button onClick={() => setErrorGlobal('')}
              className="text-red-400 hover:text-red-600 shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* ── Formulario de alta ─────────────────────────────── */}
        {mostrarForm && (
          <FormularioMovimiento
            obras={obras}
            rubros={rubros}
            cuentas={cuentas}
            debitos={debitos}
            userId={user.id}
            onGuardado={async () => {
              setMostrarForm(false)
              await cargarMovimientos()
            }}
            onCancelar={() => setMostrarForm(false)}
          />
        )}

        {/* ── Tabla de movimientos ───────────────────────────── */}
        <TablaMovimientos
          movimientos={movimientos}
          obras={obras}
          cargando={cargando}
          userId={user.id}
          onEliminar={handleEliminar}
          onEjecutado={cargarMovimientos}
          onNota={mov => setModalNotas(mov)}
        />

        {/* ── Sección de débitos automáticos ────────────────── */}
        <SeccionDebitos
          debitos={debitos}
          rubros={rubros}
          obras={obras}
          userId={user.id}
          onActualizado={async () => {
            const { data } = await supabase
              .from('debitos_automaticos_config')
              .select('id, nombre, monto_estimado, dia_del_mes, rubro_id, obra_id, activo')
              .order('nombre')
            setDebitos(data ?? [])
          }}
        />

      </main>

      {/* ── Modal de notas ─────────────────────────────────── */}
      {modalNotas && (
        <ModalNotas
          movimiento={modalNotas}
          userId={user.id}
          onCerrar={() => {
            setModalNotas(null)
            cargarMovimientos() // recarga para actualizar notas_count
          }}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// SUBCOMPONENTE: SeccionDebitos
// Gestión de la configuración de débitos automáticos recurrentes.
// ══════════════════════════════════════════════════════════════
const DEBITO_VACIO = {
  nombre: '', monto_estimado: '', dia_del_mes: '', rubro_id: '', obra_id: '',
}

function SeccionDebitos({ debitos, rubros, obras, userId, onActualizado }) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form,        setForm]        = useState(DEBITO_VACIO)
  const [guardando,   setGuardando]   = useState(false)
  const [toggling,    setToggling]    = useState(null)
  const [eliminando,  setEliminando]  = useState(null)
  const [error,       setError]       = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleGuardar(e) {
    e.preventDefault()
    setError('')
    if (!form.nombre.trim())      { setError('El nombre es obligatorio.'); return }
    if (!form.dia_del_mes || isNaN(Number(form.dia_del_mes)) ||
        Number(form.dia_del_mes) < 1 || Number(form.dia_del_mes) > 31) {
      setError('El día del mes debe ser entre 1 y 31.')
      return
    }
    if (!form.monto_estimado || isNaN(Number(form.monto_estimado)) || Number(form.monto_estimado) <= 0) {
      setError('Ingresá un monto estimado válido.')
      return
    }
    setGuardando(true)
    const { error: err } = await supabase.from('debitos_automaticos_config').insert({
      nombre:         form.nombre.trim(),
      monto_estimado: Number(form.monto_estimado),
      dia_del_mes:    Number(form.dia_del_mes),
      rubro_id:       form.rubro_id || null,
      obra_id:        form.obra_id  || null,
      activo:         true,
      created_by:     userId,
    })
    if (err) { setError('Error al guardar.'); setGuardando(false); return }
    setForm(DEBITO_VACIO)
    setMostrarForm(false)
    setGuardando(false)
    onActualizado()
  }

  async function handleToggle(d) {
    setToggling(d.id)
    await supabase.from('debitos_automaticos_config').update({ activo: !d.activo }).eq('id', d.id)
    setToggling(null)
    onActualizado()
  }

  async function handleEliminar(id) {
    setEliminando(id)
    await supabase.from('debitos_automaticos_config').delete().eq('id', id)
    setEliminando(null)
    onActualizado()
  }

  const fmtARS = n => new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', minimumFractionDigits: 2,
  }).format(n ?? 0)

  // Todos los débitos (activos e inactivos) para la sección
  const [todos, setTodos] = useState([])
  useEffect(() => {
    supabase.from('debitos_automaticos_config')
      .select('id, nombre, monto_estimado, dia_del_mes, rubro_id, obra_id, activo')
      .order('nombre')
      .then(({ data }) => setTodos(data ?? []))
  }, [debitos]) // re-carga cuando el padre actualiza debitos

  return (
    <div className="mt-10">
      {/* Separador */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-slate-400 text-xs font-medium tracking-wide uppercase">
          Débitos automáticos
        </span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-slate-800 font-semibold text-sm">Configuración de débitos</h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Servicios recurrentes que se pre-cargan como movimientos proyectados
          </p>
        </div>
        <button
          onClick={() => { setMostrarForm(v => !v); setError('') }}
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700
                     text-white text-xs font-medium px-3.5 py-2 rounded-lg transition-colors">
          {mostrarForm ? 'Cancelar' : '+ Agregar débito'}
        </button>
      </div>

      {/* Formulario de alta de débito */}
      {mostrarForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
          <form onSubmit={handleGuardar} noValidate>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
              {/* Nombre */}
              <div className="col-span-2 sm:col-span-1">
                <label className={lbCls}>Nombre *</label>
                <input type="text" placeholder="Ej: Movistar"
                  value={form.nombre} onChange={e => set('nombre', e.target.value)}
                  className={inCls} />
              </div>
              {/* Monto estimado */}
              <div>
                <label className={lbCls}>Monto estimado *</label>
                <input type="number" min="0.01" step="0.01" placeholder="0,00"
                  value={form.monto_estimado} onChange={e => set('monto_estimado', e.target.value)}
                  className={inCls + ' text-right'} />
              </div>
              {/* Día del mes */}
              <div>
                <label className={lbCls}>Día del mes *</label>
                <input type="number" min="1" max="31" placeholder="15"
                  value={form.dia_del_mes} onChange={e => set('dia_del_mes', e.target.value)}
                  className={inCls} />
              </div>
              {/* Rubro */}
              <div>
                <label className={lbCls}>Rubro</label>
                <select value={form.rubro_id} onChange={e => set('rubro_id', e.target.value)} className={selCls2}>
                  <option value="">— Sin rubro —</option>
                  {rubros.filter(r => r.activo).map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
              </div>
              {/* Obra */}
              <div>
                <label className={lbCls}>Obra</label>
                <select value={form.obra_id} onChange={e => set('obra_id', e.target.value)} className={selCls2}>
                  <option value="">— Sin obra —</option>
                  {obras.map(o => <option key={o.id} value={o.id}>{o.codigo} · {o.nombre}</option>)}
                </select>
              </div>
            </div>
            {error && (
              <p className="text-red-600 text-xs mb-3">{error}</p>
            )}
            <button type="submit" disabled={guardando}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700
                         disabled:opacity-50 text-white text-xs font-medium
                         px-4 py-2 rounded-lg transition-colors">
              {guardando && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {guardando ? 'Guardando…' : 'Guardar débito'}
            </button>
          </form>
        </div>
      )}

      {/* Tabla de débitos */}
      {todos.length === 0 ? (
        <p className="text-slate-400 text-sm py-4 text-center">
          No hay débitos automáticos configurados.
        </p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['Nombre', 'Monto estimado', 'Día', 'Rubro', 'Obra', 'Estado', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold
                                         text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {todos.map(d => (
                <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-slate-700 font-medium">{d.nombre}</td>
                  <td className="px-4 py-3 text-slate-600 tabular-nums">{fmtARS(d.monto_estimado)}</td>
                  <td className="px-4 py-3 text-slate-600">Día {d.dia_del_mes}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {rubros.find(r => r.id === d.rubro_id)?.nombre ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {obras.find(o => o.id === d.obra_id)?.nombre ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                      ${d.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {d.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {/* Toggle */}
                      {toggling === d.id ? (
                        <span className="w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                      ) : (
                        <button onClick={() => handleToggle(d)}
                          className={`text-xs font-medium text-white px-2.5 py-1 rounded-md transition-colors
                            ${d.activo ? 'bg-slate-400 hover:bg-slate-500' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                          {d.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      )}
                      {/* Eliminar */}
                      {eliminando === d.id ? (
                        <span className="w-4 h-4 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
                      ) : (
                        <button onClick={() => handleEliminar(d.id)}
                          className="text-xs font-medium bg-red-500 hover:bg-red-600
                                     text-white px-2.5 py-1 rounded-md transition-colors">
                          Eliminar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Helpers de clase para SeccionDebitos ──────────────────────
const lbCls   = 'block text-xs font-medium text-slate-600 mb-1.5'
const inCls   = `w-full px-2.5 py-2 text-sm rounded-lg border border-slate-200
  text-slate-900 placeholder:text-slate-400
  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`
const selCls2 = `w-full px-2.5 py-2 text-sm rounded-lg border border-slate-200
  text-slate-900 bg-white
  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`
