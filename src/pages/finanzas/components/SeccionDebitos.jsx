// pages/finanzas/components/SeccionDebitos.jsx
// Configuración de débitos automáticos (servicios recurrentes que después se
// eligen en Nuevo movimiento > Débito automático). Se muestra plegable al
// final del Cash Flow.
//
// Props:
//   debitos       → débitos activos (los que ve el formulario de movimiento)
//   rubros, obras → catálogos para los selects
//   userId        → id del usuario logueado
//   onActualizado → fn() — se llama tras alta/baja/activar/desactivar

import { useState, useEffect } from 'react'
import { supabase } from '../../../supabaseClient'

const DEBITO_VACIO = { nombre: '', monto_estimado: '', dia_del_mes: '', rubro_id: '', obra_id: '' }

export default function SeccionDebitos({ debitos, rubros, obras, userId, onActualizado }) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form,        setForm]        = useState(DEBITO_VACIO)
  const [guardando,   setGuardando]   = useState(false)
  const [toggling,    setToggling]    = useState(null)
  const [eliminando,  setEliminando]  = useState(null)
  const [error,       setError]       = useState('')
  const [todos,       setTodos]       = useState([])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const fmtARS = n => new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', minimumFractionDigits: 2,
  }).format(n ?? 0)

  useEffect(() => {
    supabase.from('debitos_automaticos_config')
      .select('id, nombre, monto_estimado, dia_del_mes, rubro_id, obra_id, activo')
      .order('nombre')
      .then(({ data }) => setTodos(data ?? []))
  }, [debitos])

  async function handleGuardar(e) {
    e.preventDefault()
    setError('')
    if (!form.nombre.trim()) { setError('El nombre es obligatorio.'); return }
    if (!form.dia_del_mes || Number(form.dia_del_mes) < 1 || Number(form.dia_del_mes) > 31) {
      setError('El día del mes debe ser entre 1 y 31.'); return
    }
    if (!form.monto_estimado || Number(form.monto_estimado) <= 0) {
      setError('Ingresá un monto estimado válido.'); return
    }
    setGuardando(true)
    const { error: err } = await supabase.from('debitos_automaticos_config').insert({
      nombre: form.nombre.trim(), monto_estimado: Number(form.monto_estimado),
      dia_del_mes: Number(form.dia_del_mes), rubro_id: form.rubro_id || null,
      obra_id: form.obra_id || null, activo: true, created_by: userId,
    })
    if (err) { setError('Error al guardar.'); setGuardando(false); return }
    setForm(DEBITO_VACIO); setMostrarForm(false); setGuardando(false); onActualizado()
  }

  async function handleToggle(d) {
    setToggling(d.id)
    await supabase.from('debitos_automaticos_config').update({ activo: !d.activo }).eq('id', d.id)
    setToggling(null); onActualizado()
  }

  async function handleEliminar(id) {
    setEliminando(id)
    await supabase.from('debitos_automaticos_config').delete().eq('id', id)
    setEliminando(null); onActualizado()
  }

  return (
    <div className="mt-5">

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-slate-800 font-bold text-sm">Configuración de débitos</h2>
          <p className="text-slate-400 text-xs mt-0.5">
            Servicios recurrentes pre-cargados como movimientos proyectados
          </p>
        </div>
        <button
          onClick={() => { setMostrarForm(v => !v); setError('') }}
          className="inline-flex items-center gap-1.5 text-white text-xs font-semibold
                     px-3.5 py-2 rounded-xl transition-colors shadow-sm"
          style={{ backgroundColor: '#0e7490' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#164e63'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0e7490'}>
          {mostrarForm ? 'Cancelar' : '+ Agregar débito'}
        </button>
      </div>

      {mostrarForm && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 mb-5 shadow-sm">
          <form onSubmit={handleGuardar} noValidate>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
              <div className="col-span-2 sm:col-span-1">
                <label className={lbCls}>Nombre *</label>
                <input type="text" placeholder="Ej: Movistar" value={form.nombre}
                  onChange={e => set('nombre', e.target.value)} className={inCls} />
              </div>
              <div>
                <label className={lbCls}>Monto estimado *</label>
                <input type="number" min="0.01" step="0.01" placeholder="0,00"
                  value={form.monto_estimado} onChange={e => set('monto_estimado', e.target.value)}
                  className={inCls + ' text-right'} />
              </div>
              <div>
                <label className={lbCls}>Día del mes *</label>
                <input type="number" min="1" max="31" placeholder="15"
                  value={form.dia_del_mes} onChange={e => set('dia_del_mes', e.target.value)}
                  className={inCls} />
              </div>
              <div>
                <label className={lbCls}>Rubro</label>
                <select value={form.rubro_id} onChange={e => set('rubro_id', e.target.value)} className={selCls2}>
                  <option value="">— Sin rubro —</option>
                  {rubros.filter(r => r.activo).map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className={lbCls}>Obra</label>
                <select value={form.obra_id} onChange={e => set('obra_id', e.target.value)} className={selCls2}>
                  <option value="">— Sin obra —</option>
                  {obras.map(o => <option key={o.id} value={o.id}>{o.codigo} · {o.nombre}</option>)}
                </select>
              </div>
            </div>
            {error && <p className="text-red-600 text-xs mb-3">{error}</p>}
            <button type="submit" disabled={guardando}
              className="inline-flex items-center gap-2 text-white text-xs font-semibold
                         px-4 py-2 rounded-xl transition-colors disabled:opacity-50 shadow-sm"
              style={{ backgroundColor: '#0e7490' }}
              onMouseEnter={e => !guardando && (e.currentTarget.style.backgroundColor = '#164e63')}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0e7490'}>
              {guardando && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {guardando ? 'Guardando…' : 'Guardar débito'}
            </button>
          </form>
        </div>
      )}

      {todos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center
                        bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
            style={{ backgroundColor: '#e0f2fe', color: '#0e7490' }}>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875
                   1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
          </div>
          <p className="text-slate-600 font-bold text-sm">Sin débitos configurados</p>
          <p className="text-slate-400 text-xs mt-1">Usá el botón de arriba para agregar el primero.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                {['Nombre', 'Monto estimado', 'Día', 'Rubro', 'Obra', 'Estado', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {todos.map(d => (
                <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 text-slate-800 font-semibold">{d.nombre}</td>
                  <td className="px-4 py-3 text-slate-600 tabular-nums">{fmtARS(d.monto_estimado)}</td>
                  <td className="px-4 py-3 text-slate-500">Día {d.dia_del_mes}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{rubros.find(r => r.id === d.rubro_id)?.nombre ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{obras.find(o => o.id === d.obra_id)?.nombre ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full
                      ${d.activo
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        : 'bg-slate-100 text-slate-400'}`}>
                      {d.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {toggling === d.id ? (
                        <span className="w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                      ) : (
                        <button onClick={() => handleToggle(d)}
                          className={`text-xs font-semibold text-white px-2.5 py-1.5 rounded-lg transition-colors
                            ${d.activo ? 'bg-slate-400 hover:bg-slate-500' : ''}`}
                          style={!d.activo ? { backgroundColor: '#0e7490' } : {}}
                          onMouseEnter={e => !d.activo && (e.currentTarget.style.backgroundColor = '#164e63')}
                          onMouseLeave={e => !d.activo && (e.currentTarget.style.backgroundColor = '#0e7490')}>
                          {d.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      )}
                      {eliminando === d.id ? (
                        <span className="w-4 h-4 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
                      ) : (
                        <button onClick={() => handleEliminar(d.id)}
                          className="text-xs font-semibold bg-red-500 hover:bg-red-600
                                     text-white px-2.5 py-1.5 rounded-lg transition-colors">
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

// ─── Clases de formulario ─────────────────────────────────────────────────────
const lbCls   = 'block text-xs font-semibold text-slate-500 mb-1.5'
const inCls   = `w-full px-3 py-2 text-sm rounded-xl border border-slate-200
  text-slate-900 placeholder:text-slate-300 bg-white
  focus:outline-none focus:ring-2 focus:border-transparent`
const selCls2 = `w-full px-3 py-2 text-sm rounded-xl border border-slate-200
  text-slate-900 bg-white focus:outline-none focus:ring-2 focus:border-transparent`