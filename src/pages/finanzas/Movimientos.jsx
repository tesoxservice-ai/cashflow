// pages/finanzas/Movimientos.jsx
// Módulo de movimientos para el rol 'finanzas'.
// Ruta: /finanzas/movimientos
// Rediseño visual coherente con el nuevo sistema de diseño PSDATA.

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import FormularioMovimiento from './components/FormularioMovimiento'
import TablaMovimientos     from './components/TablaMovimientos'
import ModalNotas           from './components/ModalNotas'

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
  const iniciales = perfil ? `${perfil.nombre?.[0] ?? ''}${perfil.apellido?.[0] ?? ''}` : 'U'

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

export default function Movimientos() {
  const navigate = useNavigate()
  const { user, perfil } = useAuth()

  const [obras,       setObras]       = useState([])
  const [rubros,      setRubros]      = useState([])
  const [cuentas,     setCuentas]     = useState([])
  const [debitos,     setDebitos]     = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [cargando,    setCargando]    = useState(true)
  const [errorGlobal, setErrorGlobal] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [modalNotas,  setModalNotas]  = useState(null)

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
          .eq('activo', true).order('nombre'),
      ])
      setObras(dataObras   ?? [])
      setRubros(dataRubros  ?? [])
      setCuentas(dataCuentas ?? [])
      setDebitos(dataDebitos ?? [])
    }
    cargarMaestros()
  }, [])

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

    if (error) { setErrorGlobal('No se pudieron cargar los movimientos.'); setCargando(false); return }

    const movIds = (data ?? []).map(m => m.id)
    let notasCount = {}
    if (movIds.length > 0) {
      const { data: notasData } = await supabase
        .from('notas').select('movimiento_id').in('movimiento_id', movIds)
      ;(notasData ?? []).forEach(n => {
        notasCount[n.movimiento_id] = (notasCount[n.movimiento_id] ?? 0) + 1
      })
    }
    setMovimientos((data ?? []).map(m => ({ ...m, notas_count: notasCount[m.id] ?? 0 })))
    setCargando(false)
  }, [])

  useEffect(() => { cargarMovimientos() }, [cargarMovimientos])

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
            <h1 className="text-slate-900 text-2xl font-extrabold tracking-tight">Movimientos</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Cargá acá los movimientos nuevos. Para editar o borrar uno ya cargado, usá el botón "Editar" en el Cash Flow.
            </p>
          </div>

          <button
            onClick={() => { setMostrarForm(v => !v); setErrorGlobal('') }}
            className="shrink-0 inline-flex items-center gap-2 text-white text-sm font-semibold
                       px-4 py-2.5 rounded-xl transition-colors shadow-sm"
            style={{ backgroundColor: '#0e7490' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#164e63'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0e7490'}>
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
                          text-red-700 text-sm rounded-xl px-4 py-3 mb-5">
            <span>{errorGlobal}</span>
            <button onClick={() => setErrorGlobal('')} className="text-red-400 hover:text-red-600 shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Formulario de alta */}
        {mostrarForm && (
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm mb-6 overflow-hidden">
            <FormularioMovimiento
              obras={obras} rubros={rubros} cuentas={cuentas} debitos={debitos}
              userId={user.id}
              onGuardado={async () => { setMostrarForm(false); await cargarMovimientos() }}
              onCancelar={() => setMostrarForm(false)}
            />
          </div>
        )}

        {/* Tabla de movimientos */}
        <TablaMovimientos
          movimientos={movimientos} obras={obras} cargando={cargando}
          userId={user.id}
          onEjecutado={cargarMovimientos}
          onNota={mov => setModalNotas(mov)}
        />

        {/* Sección débitos automáticos */}
        <SeccionDebitos
          debitos={debitos} rubros={rubros} obras={obras} userId={user.id}
          onActualizado={async () => {
            const { data } = await supabase
              .from('debitos_automaticos_config')
              .select('id, nombre, monto_estimado, dia_del_mes, rubro_id, obra_id, activo')
              .order('nombre')
            setDebitos(data ?? [])
          }}
        />
      </main>

      {modalNotas && (
        <ModalNotas
          movimiento={modalNotas} userId={user.id}
          onCerrar={() => { setModalNotas(null); cargarMovimientos() }}
        />
      )}
    </div>
  )
}

// ─── SeccionDebitos ───────────────────────────────────────────────────────────

const DEBITO_VACIO = { nombre: '', monto_estimado: '', dia_del_mes: '', rubro_id: '', obra_id: '' }

function SeccionDebitos({ debitos, rubros, obras, userId, onActualizado }) {
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
    <div className="mt-10">
      {/* Separador */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-slate-400 text-xs font-semibold tracking-widest uppercase">
          Débitos automáticos
        </span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

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