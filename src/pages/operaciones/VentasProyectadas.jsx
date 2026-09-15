// pages/operaciones/VentasProyectadas.jsx
// Rediseño visual coherente con el sistema de diseño PSDATA.

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'

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

const FORM_VACIO = { rubro: '', periodo: periodoActual(), monto: '' }

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
  return (
    <header className="bg-white border-b border-slate-100 px-6 py-3 flex items-center justify-between sticky top-0 z-20">
      <img src="/logo-psdata.png" alt="PSDATA" className="h-11" />
      <div className="flex items-center gap-4">
        <button className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
          <IconBell />
        </button>
        <div className="w-px h-6 bg-slate-200" />
        <div className="relative">
          <button onClick={() => setMenuAbierto(v => !v)} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: '#0e7490' }}>
              {iniciales}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-slate-800 text-sm font-semibold leading-none">{perfil ? `${perfil.nombre} ${perfil.apellido}` : 'Usuario'}</p>
              <p className="text-slate-400 text-xs mt-0.5 leading-none capitalize">{perfil?.rol ?? 'Operaciones'}</p>
            </div>
            <span className={`transition-transform duration-200 ${menuAbierto ? 'rotate-180' : ''}`}><IconChevronDown /></span>
          </button>
          {menuAbierto && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuAbierto(false)} />
              <div className="absolute right-0 mt-3 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-1.5 z-20">
                <div className="px-4 py-2.5 border-b border-slate-100">
                  <p className="text-slate-800 text-sm font-semibold truncate">{perfil ? `${perfil.nombre} ${perfil.apellido}` : 'Usuario'}</p>
                  <p className="text-slate-400 text-xs capitalize mt-0.5">{perfil?.rol ?? 'Operaciones'}</p>
                </div>
                <button onClick={async () => { setMenuAbierto(false); await logout() }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                  <IconLogout />Cerrar sesión
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
export default function VentasProyectadas() {
  const { user, perfil } = useAuth()
  const navigate = useNavigate()

  const [obras,            setObras]            = useState([])
  const [obraSeleccionada, setObraSeleccionada] = useState('')
  const [ventas,           setVentas]           = useState([])
  const [cargandoObras,    setCargandoObras]    = useState(true)
  const [cargando,         setCargando]         = useState(false)
  const [error,            setError]            = useState('')
  const [form,             setForm]             = useState(FORM_VACIO)
  const [guardando,        setGuardando]        = useState(false)
  const [errorForm,        setErrorForm]        = useState('')
  const [eliminando,       setEliminando]       = useState(null)
  const [modalReplicar,    setModalReplicar]    = useState(null)
  const [mesesReplicar,    setMesesReplicar]    = useState(3)
  const [replicando,       setReplicando]       = useState(false)
  const [errorReplicar,    setErrorReplicar]    = useState('')

  useEffect(() => {
    async function cargarObras() {
      setCargandoObras(true)
      const { data, error } = await supabase.from('obras').select('id, codigo, nombre, cliente').eq('activa', true).order('codigo')
      if (error) setError('No se pudieron cargar las obras.')
      setObras(data ?? []); setCargandoObras(false)
    }
    cargarObras()
  }, [])

  const cargarVentas = useCallback(async (obraId) => {
    if (!obraId) { setVentas([]); return }
    setCargando(true)
    const { data, error } = await supabase.from('ventas_proyectadas')
      .select('id, rubro, periodo, monto, registrado').eq('obra_id', obraId)
      .order('periodo', { ascending: true }).order('rubro', { ascending: true })
    if (error) setError('No se pudieron cargar las ventas.')
    setVentas(data ?? []); setCargando(false)
  }, [])

  useEffect(() => { cargarVentas(obraSeleccionada); setErrorForm('') }, [obraSeleccionada, cargarVentas])

  async function handleAgregar(e) {
    e.preventDefault(); setErrorForm('')
    if (!obraSeleccionada)  { setErrorForm('Seleccioná una obra.'); return }
    if (!form.rubro)        { setErrorForm('Seleccioná un rubro.'); return }
    if (!form.monto || isNaN(Number(form.monto)) || Number(form.monto) <= 0) { setErrorForm('Ingresá un monto válido mayor a cero.'); return }
    setGuardando(true)
    const { error } = await supabase.from('ventas_proyectadas').insert({
      obra_id: obraSeleccionada, rubro: form.rubro, periodo: form.periodo, monto: Number(form.monto), created_by: user.id,
    })
    if (error) { setErrorForm('Error al guardar. Intentá de nuevo.'); setGuardando(false); return }
    setForm(FORM_VACIO); setGuardando(false); await cargarVentas(obraSeleccionada)
  }

  async function handleEliminar(id) {
    setEliminando(id)
    await supabase.from('ventas_proyectadas').delete().eq('id', id)
    setEliminando(null); await cargarVentas(obraSeleccionada)
  }

  async function handleReplicar() {
    if (!modalReplicar || mesesReplicar < 1) return
    setReplicando(true); setErrorReplicar('')
    const base = new Date(modalReplicar.periodo + 'T00:00:00')
    const inserts = []
    for (let i = 1; i <= mesesReplicar; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1)
      inserts.push({ obra_id: obraSeleccionada, rubro: modalReplicar.rubro,
        periodo: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
        monto: modalReplicar.monto, created_by: user.id })
    }
    const { error } = await supabase.from('ventas_proyectadas').insert(inserts)
    if (error) { setErrorReplicar('Error al replicar. Intentá de nuevo.'); setReplicando(false); return }
    setModalReplicar(null); setReplicando(false); await cargarVentas(obraSeleccionada)
  }

  function agruparPorPeriodo(lista) {
    const mapa = new Map()
    lista.forEach(v => { if (!mapa.has(v.periodo)) mapa.set(v.periodo, []); mapa.get(v.periodo).push(v) })
    return Array.from(mapa.entries()).sort(([a], [b]) => a.localeCompare(b))
  }

  const grupos       = agruparPorPeriodo(ventas)
  const totalGeneral = ventas.reduce((s, v) => s + Number(v.monto), 0)

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f0f7fa' }}>
      <TopNav perfil={perfil} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">

        {/* Encabezado */}
        <div className="mb-8">
          <button onClick={() => navigate('/operaciones')}
            className="text-sm font-medium flex items-center gap-1.5 mb-2 transition-colors"
            style={{ color: '#0e7490' }}
            onMouseEnter={e => e.currentTarget.style.color = '#164e63'}
            onMouseLeave={e => e.currentTarget.style.color = '#0e7490'}>
            <IconBack />Panel de Operaciones
          </button>
          <h1 className="text-slate-900 text-2xl font-extrabold tracking-tight">Ventas Proyectadas</h1>
          <p className="text-slate-400 text-sm mt-0.5">Cargá los ingresos esperados por obra, período y rubro</p>
        </div>

        {error && <MensajeError mensaje={error} onCerrar={() => setError('')} />}

        {cargandoObras ? <EstadoCarga mensaje="Cargando obras…" />
        : obras.length === 0 ? <EstadoVacio titulo="No hay obras activas" descripcion="Necesitás al menos una obra activa." />
        : (
          <>
            {/* Selector de obra */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 mb-6 shadow-sm">
              <label className={lbCls}>Obra</label>
              <select value={obraSeleccionada} onChange={e => setObraSeleccionada(e.target.value)} className={`${selCls} w-full sm:w-auto sm:min-w-96`}>
                <option value="">— Seleccioná una obra —</option>
                {obras.map(o => <option key={o.id} value={o.id}>{o.codigo} · {o.nombre} ({o.cliente})</option>)}
              </select>
            </div>

            {obraSeleccionada && (
              <>
                {/* Formulario */}
                <div className="bg-white border border-slate-100 rounded-2xl p-5 mb-6 shadow-sm">
                  <h2 className="text-slate-800 font-bold text-sm mb-4">Agregar venta proyectada</h2>
                  <form onSubmit={handleAgregar} noValidate>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className={lbCls}>Rubro</label>
                        <select value={form.rubro} onChange={e => setForm(f => ({ ...f, rubro: e.target.value }))} className={selCls}>
                          <option value="">— Seleccioná —</option>
                          {RUBROS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={lbCls}>Período</label>
                        <select value={form.periodo} onChange={e => setForm(f => ({ ...f, periodo: e.target.value }))} className={selCls}>
                          {PERIODOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={lbCls}>Monto ($)</label>
                        <input type="number" min="0.01" step="0.01" placeholder="0,00"
                          value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                          className={inCls} />
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
                    <button type="submit" disabled={guardando}
                      className="inline-flex items-center gap-2 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50 shadow-sm"
                      style={{ backgroundColor: '#0e7490' }}
                      onMouseEnter={e => !guardando && (e.currentTarget.style.backgroundColor = '#164e63')}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0e7490'}>
                      {guardando && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      {guardando ? 'Guardando…' : 'Agregar'}
                    </button>
                  </form>
                </div>

                {/* Tabla */}
                {cargando ? <EstadoCarga mensaje="Cargando ventas…" />
                : ventas.length === 0 ? <EstadoVacio titulo="Sin ventas cargadas" descripcion="Usá el formulario de arriba para agregar la primera." />
                : (
                  <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/80">
                            <Th>Período</Th><Th>Rubro</Th><Th align="right">Monto</Th>
                            <Th align="center">Estado</Th><Th>{/* acciones */}</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {grupos.map(([periodo, filas]) => filas.map((v, i) => (
                            <tr key={v.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
                              <td className="px-5 py-3.5 text-xs text-slate-700">
                                {i === 0 ? <span className="font-semibold text-slate-800">{labelPeriodo(periodo)}</span> : null}
                              </td>
                              <td className="px-5 py-3.5 text-xs text-slate-600">
                                {RUBROS.find(r => r.value === v.rubro)?.label ?? v.rubro}
                              </td>
                              <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-slate-800 text-xs">
                                {fmtARS(v.monto)}
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                {v.registrado
                                  ? <span className="text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-0.5 rounded-full">Registrado</span>
                                  : <span className="text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100 px-2.5 py-0.5 rounded-full">Pendiente</span>}
                              </td>
                              <td className="px-5 py-3.5">
                                <div className="flex items-center justify-end gap-2">
                                  {v.rubro === 'abono' && !v.registrado && (
                                    <button onClick={() => { setModalReplicar(v); setMesesReplicar(3); setErrorReplicar('') }}
                                      className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors border"
                                      style={{ backgroundColor: '#e0f2fe', color: '#0e7490', borderColor: '#a5f3fc' }}
                                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#cffafe'}
                                      onMouseLeave={e => e.currentTarget.style.backgroundColor = '#e0f2fe'}>
                                      Replicar
                                    </button>
                                  )}
                                  {!v.registrado && (
                                    eliminando === v.id
                                      ? <span className="flex items-center gap-1.5 text-xs text-red-500 px-2">
                                          <span className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
                                          Eliminando…
                                        </span>
                                      : <button onClick={() => handleEliminar(v.id)}
                                          className="text-xs font-semibold bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg transition-colors">
                                          Eliminar
                                        </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )))}
                        </tbody>
                        <tfoot>
                          <tr style={{ backgroundColor: '#e0f2fe' }} className="border-t-2 border-cyan-100">
                            <td colSpan={2} className="px-5 py-3 text-sm font-bold" style={{ color: '#0e7490' }}>Total general</td>
                            <td className="px-5 py-3 text-right text-sm font-bold tabular-nums" style={{ color: '#0e7490' }}>{fmtARS(totalGeneral)}</td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {!obraSeleccionada && <EstadoVacio titulo="Seleccioná una obra" descripcion="Elegí una obra para ver y gestionar sus ventas proyectadas." />}
          </>
        )}
      </main>

      {/* Modal replicar abono */}
      {modalReplicar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-slate-900 font-extrabold text-base">Replicar abono</h3>
                <p className="text-slate-400 text-sm mt-0.5">
                  {labelPeriodo(modalReplicar.periodo)} · {fmtARS(modalReplicar.monto)}
                </p>
              </div>
              <button onClick={() => setModalReplicar(null)} className="text-slate-300 hover:text-slate-500 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <label className={lbCls}>Cantidad de meses a replicar</label>
            <input type="number" min="1" max="24" value={mesesReplicar}
              onChange={e => setMesesReplicar(Number(e.target.value))}
              className={`${inCls} mb-4`} />
            {errorReplicar && <p className="text-red-600 text-xs mb-3">{errorReplicar}</p>}
            <div className="flex gap-3">
              <button onClick={handleReplicar} disabled={replicando}
                className="flex-1 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2 shadow-sm"
                style={{ backgroundColor: '#0e7490' }}
                onMouseEnter={e => !replicando && (e.currentTarget.style.backgroundColor = '#164e63')}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0e7490'}>
                {replicando && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {replicando ? 'Replicando…' : `Replicar ${mesesReplicar} ${mesesReplicar === 1 ? 'mes' : 'meses'}`}
              </button>
              <button onClick={() => setModalReplicar(null)} disabled={replicando}
                className="flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-sm font-semibold py-2.5 rounded-xl transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Th({ children, align = 'left' }) {
  return (
    <th className={`px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide
                    ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}>
      {children}
    </th>
  )
}

function EstadoCarga({ mensaje }) {
  return (
    <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
      <span className="w-5 h-5 border-2 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
      <span className="text-sm">{mensaje}</span>
    </div>
  )
}

function EstadoVacio({ titulo, descripcion }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-2xl border border-slate-100 shadow-sm">
      <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: '#e0f2fe', color: '#0e7490' }}>
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0
               0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
        </svg>
      </div>
      <p className="text-slate-700 font-bold text-sm">{titulo}</p>
      <p className="text-slate-400 text-sm mt-1 max-w-xs">{descripcion}</p>
    </div>
  )
}

function MensajeError({ mensaje, onCerrar }) {
  return (
    <div className="flex items-start justify-between gap-3 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3 mb-5">
      <span>{mensaje}</span>
      <button onClick={onCerrar} className="text-red-400 hover:text-red-600 shrink-0">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

const lbCls = 'block text-xs font-semibold text-slate-500 mb-1.5'
const inCls = `w-full px-3 py-2 text-sm rounded-xl border border-slate-200 text-slate-900 placeholder:text-slate-300 bg-white focus:outline-none focus:ring-2 focus:border-transparent`
const selCls = `w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:border-transparent`