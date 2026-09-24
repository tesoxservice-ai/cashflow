// pages/operaciones/Presupuestos.jsx
// Rediseño visual coherente con el sistema de diseño PSDATA.

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'

function formatearPesos(valor) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', minimumFractionDigits: 2,
  }).format(valor ?? 0)
}

function formatearPeriodo(fechaStr) {
  if (!fechaStr) return '—'
  const fecha = new Date(fechaStr + 'T00:00:00')
  const label = fecha.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// Desde diciembre de 2024 (fijo) hasta 24 meses después de hoy
function generarOpcionesPeriodo() {
  const opciones = []
  const hoy = new Date()
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 24, 1)
  for (let fecha = new Date(2024, 11, 1); fecha <= fin; fecha.setMonth(fecha.getMonth() + 1)) {
    const value = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-01`
    const label = fecha.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    opciones.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return opciones
}

const PERIODOS = generarOpcionesPeriodo()
const FORM_VACIO = { rubro_id: '', concepto: '', periodo: PERIODOS[0].value, monto: '' }

// Rubros que puede ver/elegir Operaciones al cargar presupuestos.
// Es un filtro solo para esta pantalla: en Finanzas siguen apareciendo
// todos los rubros activos, sin este recorte.
const RUBROS_PERMITIDOS_OPERACIONES = [
  'Materiales',
  'Subcontratos',
  'MO directa con Carg Sociales',
  'Mano de obra indirecta con cargas',
  'Vehículos',
  'Otros Gastos Operativos',
  'Gastos Generales',
  'Impuestos',
]

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
              <p className="text-slate-400 text-xs mt-0.5 leading-none capitalize">{perfil?.rol ?? 'Operaciones'}</p>
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
                  <p className="text-slate-400 text-xs capitalize mt-0.5">{perfil?.rol ?? 'Operaciones'}</p>
                </div>
                <button onClick={async () => { setMenuAbierto(false); await logout() }}
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

export default function Presupuestos() {
  const { user, perfil } = useAuth()
  const navigate = useNavigate()

  const [obras,  setObras]  = useState([])
  const [rubros, setRubros] = useState([])
  const [obraSeleccionada,    setObraSeleccionada]    = useState('')
  const [presupuestos,        setPresupuestos]        = useState([])
  const [cargandoObras,       setCargandoObras]       = useState(true)
  const [cargandoPresupuestos,setCargandoPresupuestos]= useState(false)
  const [errorGlobal,         setErrorGlobal]         = useState('')
  const [form,                setForm]                = useState(FORM_VACIO)
  const [guardandoForm,       setGuardandoForm]       = useState(false)
  const [errorForm,           setErrorForm]           = useState('')
  const [filaEditando,        setFilaEditando]        = useState(null)
  const [valoresEdicion,      setValoresEdicion]      = useState({})
  const [guardandoEdicion,    setGuardandoEdicion]    = useState(false)
  const [errorEdicion,        setErrorEdicion]        = useState('')
  const [eliminando,          setEliminando]          = useState(null)

  useEffect(() => {
    async function cargarMaestros() {
      setCargandoObras(true); setErrorGlobal('')
      const { data: dataObras, error: errorObras } = await supabase
        .from('obras').select('id, codigo, nombre, cliente').eq('activa', true).order('codigo')
      if (errorObras) { setErrorGlobal('No se pudieron cargar las obras.'); setCargandoObras(false); return }

      const { data: dataRubros, error: errorRubros } = await supabase
        .from('rubros').select('id, nombre').eq('tipo', 'obra').eq('activo', true).order('nombre')
      if (errorRubros) { setErrorGlobal('No se pudieron cargar los rubros.'); setCargandoObras(false); return }

      const rubrosFiltrados = (dataRubros ?? []).filter(r => RUBROS_PERMITIDOS_OPERACIONES.includes(r.nombre))

      setObras(dataObras ?? [])
      setRubros(rubrosFiltrados)
      setCargandoObras(false)
    }
    cargarMaestros()
  }, [])

  const cargarPresupuestos = useCallback(async (obraId) => {
    if (!obraId) { setPresupuestos([]); return }
    setCargandoPresupuestos(true); setErrorGlobal('')
    const { data, error } = await supabase
      .from('presupuestos')
      .select('id, concepto, periodo, monto, rubro_id, rubros ( id, nombre )')
      .eq('obra_id', obraId)
      .order('rubros(nombre)', { ascending: true })
      .order('periodo',        { ascending: true })
    if (error) { setErrorGlobal('No se pudieron cargar los presupuestos.'); setCargandoPresupuestos(false); return }
    setPresupuestos(data ?? [])
    setCargandoPresupuestos(false)
  }, [])

  useEffect(() => {
    cargarPresupuestos(obraSeleccionada)
    setFilaEditando(null); setErrorEdicion(''); setErrorForm('')
  }, [obraSeleccionada, cargarPresupuestos])

  async function handleAgregar(e) {
    e.preventDefault(); setErrorForm('')
    if (!obraSeleccionada)         { setErrorForm('Seleccioná una obra primero.'); return }
    if (!form.rubro_id)            { setErrorForm('Seleccioná un rubro.'); return }
    if (!form.concepto.trim())     { setErrorForm('Ingresá un concepto.'); return }
    if (!form.monto || isNaN(Number(form.monto)) || Number(form.monto) <= 0) {
      setErrorForm('Ingresá un monto válido mayor a cero.'); return
    }
    setGuardandoForm(true)
    const { error } = await supabase.from('presupuestos').insert({
      obra_id: obraSeleccionada, rubro_id: form.rubro_id,
      concepto: form.concepto.trim(), periodo: form.periodo,
      monto: Number(form.monto), created_by: user.id,
    })
    if (error) { setErrorForm('Error al guardar. Intentá de nuevo.'); setGuardandoForm(false); return }
    setForm(FORM_VACIO); setGuardandoForm(false)
    await cargarPresupuestos(obraSeleccionada)
  }

  function handleIniciarEdicion(p) {
    setFilaEditando(p.id)
    setValoresEdicion({ rubro_id: p.rubro_id, concepto: p.concepto, periodo: p.periodo, monto: String(p.monto) })
    setErrorEdicion('')
  }

  async function handleGuardarEdicion(id) {
    setErrorEdicion('')
    if (!valoresEdicion.rubro_id)         { setErrorEdicion('Seleccioná un rubro.'); return }
    if (!valoresEdicion.concepto?.trim()) { setErrorEdicion('Ingresá un concepto.'); return }
    if (!valoresEdicion.monto || isNaN(Number(valoresEdicion.monto)) || Number(valoresEdicion.monto) <= 0) {
      setErrorEdicion('Ingresá un monto válido mayor a cero.'); return
    }
    setGuardandoEdicion(true)
    const { error } = await supabase.from('presupuestos').update({
      rubro_id: valoresEdicion.rubro_id, concepto: valoresEdicion.concepto.trim(),
      periodo: valoresEdicion.periodo, monto: Number(valoresEdicion.monto),
    }).eq('id', id)
    if (error) { setErrorEdicion('Error al guardar los cambios.'); setGuardandoEdicion(false); return }
    setFilaEditando(null); setValoresEdicion({}); setGuardandoEdicion(false)
    await cargarPresupuestos(obraSeleccionada)
  }

  async function handleEliminar(id) {
    setEliminando(id)
    const { error } = await supabase.from('presupuestos').delete().eq('id', id)
    if (error) { setErrorGlobal('No se pudo eliminar el presupuesto.'); setEliminando(null); return }
    setEliminando(null)
    await cargarPresupuestos(obraSeleccionada)
  }

  function agruparPorRubro(lista) {
    const mapa = new Map()
    lista.forEach(p => {
      const nombre = p.rubros?.nombre ?? 'Sin rubro'
      if (!mapa.has(nombre)) mapa.set(nombre, { nombreRubro: nombre, filas: [], subtotal: 0 })
      const grupo = mapa.get(nombre)
      grupo.filas.push(p)
      grupo.subtotal += Number(p.monto)
    })
    return Array.from(mapa.values()).sort((a, b) => a.nombreRubro.localeCompare(b.nombreRubro, 'es'))
  }

  const grupos       = agruparPorRubro(presupuestos)
  const totalGeneral = presupuestos.reduce((acc, p) => acc + Number(p.monto), 0)

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
            <IconBack />
            Panel de Operaciones
          </button>
          <h1 className="text-slate-900 text-2xl font-extrabold tracking-tight">Presupuestos</h1>
          <p className="text-slate-400 text-sm mt-0.5">Cargá y editá el presupuesto mensual por obra y rubro</p>
        </div>

        {errorGlobal && <MensajeError mensaje={errorGlobal} onCerrar={() => setErrorGlobal('')} />}

        {cargandoObras ? (
          <EstadoCarga mensaje="Cargando obras…" />
        ) : obras.length === 0 ? (
          <EstadoVacio titulo="No hay obras activas"
            descripcion="Para usar este módulo necesitás tener al menos una obra activa." />
        ) : (
          <>
            {/* Selector de obra */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 mb-6 shadow-sm">
              <label className="block text-xs font-semibold text-slate-500 mb-2">Obra</label>
              <select value={obraSeleccionada} onChange={e => setObraSeleccionada(e.target.value)}
                className={`${selCls} w-full sm:w-96`}>
                <option value="">— Seleccioná una obra —</option>
                {obras.map(o => (
                  <option key={o.id} value={o.id}>{o.codigo} · {o.nombre} ({o.cliente})</option>
                ))}
              </select>
            </div>

            {obraSeleccionada && (
              <>
                {/* Formulario */}
                <div className="bg-white border border-slate-100 rounded-2xl p-5 mb-6 shadow-sm">
                  <h2 className="text-slate-800 font-bold text-sm mb-4">Agregar presupuesto</h2>
                  <form onSubmit={handleAgregar} noValidate>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                      <div>
                        <label className={lbCls}>Rubro</label>
                        <select value={form.rubro_id}
                          onChange={e => setForm(f => ({ ...f, rubro_id: e.target.value }))}
                          className={selCls} required>
                          <option value="">— Seleccioná —</option>
                          {rubros.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={lbCls}>Concepto</label>
                        <input type="text" placeholder="Ej: Combustible YPF"
                          value={form.concepto}
                          onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))}
                          className={inCls} required />
                      </div>
                      <div>
                        <label className={lbCls}>Período</label>
                        <select value={form.periodo}
                          onChange={e => setForm(f => ({ ...f, periodo: e.target.value }))}
                          className={selCls}>
                          {PERIODOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={lbCls}>Monto ($)</label>
                        <input type="number" min="0.01" step="0.01" placeholder="0,00"
                          value={form.monto}
                          onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                          className={inCls} required />
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

                    <button type="submit" disabled={guardandoForm}
                      className="inline-flex items-center gap-2 text-white text-sm font-semibold
                                 px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50 shadow-sm"
                      style={{ backgroundColor: '#0e7490' }}
                      onMouseEnter={e => !guardandoForm && (e.currentTarget.style.backgroundColor = '#164e63')}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0e7490'}>
                      {guardandoForm && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      {guardandoForm ? 'Guardando…' : 'Agregar'}
                    </button>
                  </form>
                </div>

                {/* Tabla */}
                {cargandoPresupuestos ? (
                  <EstadoCarga mensaje="Cargando presupuestos…" />
                ) : presupuestos.length === 0 ? (
                  <EstadoVacio titulo="Sin presupuestos cargados"
                    descripcion="Esta obra todavía no tiene presupuestos. Usá el formulario de arriba para agregar el primero." />
                ) : (
                  <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                    {errorEdicion && (
                      <div className="px-5 pt-4">
                        <MensajeError mensaje={errorEdicion} onCerrar={() => setErrorEdicion('')} />
                      </div>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/80">
                            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide w-40">Rubro</th>
                            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Concepto</th>
                            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide w-44">Período</th>
                            <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide w-44">Monto</th>
                            <th className="px-5 py-3 w-36" />
                          </tr>
                        </thead>
                        <tbody>
                          {grupos.map((grupo, gi) => (
                            <GrupoRubro
                              key={grupo.nombreRubro}
                              grupo={grupo} rubros={rubros} periodos={PERIODOS}
                              esUltimo={gi === grupos.length - 1}
                              filaEditando={filaEditando} valoresEdicion={valoresEdicion}
                              guardandoEdicion={guardandoEdicion} eliminando={eliminando}
                              onIniciarEdicion={handleIniciarEdicion}
                              onCancelarEdicion={() => { setFilaEditando(null); setValoresEdicion({}); setErrorEdicion('') }}
                              onGuardarEdicion={handleGuardarEdicion}
                              onEliminar={handleEliminar}
                              onChangeEdicion={(campo, valor) => setValoresEdicion(v => ({ ...v, [campo]: valor }))}
                            />
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ backgroundColor: '#e0f2fe' }} className="border-t-2 border-cyan-100">
                            <td colSpan={3} className="px-5 py-3 text-sm font-bold" style={{ color: '#0e7490' }}>
                              Total general
                            </td>
                            <td className="px-5 py-3 text-right text-sm font-bold tabular-nums" style={{ color: '#0e7490' }}>
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

            {!obraSeleccionada && (
              <EstadoVacio titulo="Seleccioná una obra"
                descripcion="Elegí una obra del selector de arriba para ver y gestionar sus presupuestos." />
            )}
          </>
        )}
      </main>
    </div>
  )
}

// ─── GrupoRubro ───────────────────────────────────────────────────────────────

function GrupoRubro({ grupo, rubros, periodos, esUltimo, filaEditando, valoresEdicion,
  guardandoEdicion, eliminando, onIniciarEdicion, onCancelarEdicion,
  onGuardarEdicion, onEliminar, onChangeEdicion }) {
  return (
    <>
      {grupo.filas.map(p => (
        filaEditando === p.id
          ? <FilaEdicion key={p.id} presupuesto={p} rubros={rubros} periodos={periodos}
              valores={valoresEdicion} guardando={guardandoEdicion}
              onChange={onChangeEdicion}
              onGuardar={() => onGuardarEdicion(p.id)}
              onCancelar={onCancelarEdicion} />
          : <FilaNormal key={p.id} presupuesto={p} esEliminar={eliminando === p.id}
              onEditar={() => onIniciarEdicion(p)}
              onEliminar={() => onEliminar(p.id)} />
      ))}
      <tr style={{ backgroundColor: '#f0f9ff' }}
          className={`${!esUltimo ? 'border-b border-cyan-100' : ''}`}>
        <td colSpan={3} className="px-5 py-2.5 text-xs font-bold" style={{ color: '#0e7490' }}>
          Subtotal {grupo.nombreRubro}
        </td>
        <td className="px-5 py-2.5 text-right text-xs font-bold tabular-nums" style={{ color: '#0e7490' }}>
          {formatearPesos(grupo.subtotal)}
        </td>
        <td />
      </tr>
    </>
  )
}

// ─── FilaNormal ───────────────────────────────────────────────────────────────

function FilaNormal({ presupuesto: p, esEliminar, onEditar, onEliminar }) {
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
      <td className="px-5 py-3.5 text-slate-700 text-sm">{p.rubros?.nombre ?? '—'}</td>
      <td className="px-5 py-3.5 text-slate-700 text-sm">{p.concepto}</td>
      <td className="px-5 py-3.5 text-slate-500 text-sm">{formatearPeriodo(p.periodo)}</td>
      <td className="px-5 py-3.5 text-right font-semibold text-slate-800 tabular-nums text-sm">
        {formatearPesos(p.monto)}
      </td>
      <td className="px-5 py-3.5">
        <div className="flex items-center justify-end gap-2">
          <button onClick={onEditar} disabled={esEliminar}
            className="text-xs font-semibold text-white px-3 py-1.5 rounded-lg
                       transition-colors disabled:opacity-40 shadow-sm"
            style={{ backgroundColor: '#0e7490' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#164e63'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0e7490'}>
            Editar
          </button>
          {esEliminar ? (
            <span className="flex items-center gap-1.5 text-xs text-red-500 px-2">
              <span className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
              Eliminando…
            </span>
          ) : (
            <button onClick={onEliminar}
              className="text-xs font-semibold bg-red-500 hover:bg-red-600
                         text-white px-3 py-1.5 rounded-lg transition-colors">
              Eliminar
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── FilaEdicion ──────────────────────────────────────────────────────────────

function FilaEdicion({ rubros, periodos, valores, guardando, onChange, onGuardar, onCancelar }) {
  const inputCls = `w-full px-2.5 py-1.5 text-sm rounded-lg border text-slate-900
    focus:outline-none focus:ring-2 focus:border-transparent bg-white`
  return (
    <tr className="border-b border-cyan-200 bg-cyan-50/40">
      <td className="px-3 py-2.5 min-w-[140px]">
        <select value={valores.rubro_id ?? ''} onChange={e => onChange('rubro_id', e.target.value)}
          className={inputCls} style={{ borderColor: '#0e7490' }}>
          <option value="">— Rubro —</option>
          {rubros.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
      </td>
      <td className="px-3 py-2.5">
        <input type="text" value={valores.concepto ?? ''} onChange={e => onChange('concepto', e.target.value)}
          className={inputCls} style={{ borderColor: '#0e7490' }} />
      </td>
      <td className="px-3 py-2.5 min-w-[160px]">
        <select value={valores.periodo ?? ''} onChange={e => onChange('periodo', e.target.value)}
          className={inputCls} style={{ borderColor: '#0e7490' }}>
          {periodos.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </td>
      <td className="px-3 py-2.5 min-w-[120px]">
        <input type="number" min="0.01" step="0.01" value={valores.monto ?? ''}
          onChange={e => onChange('monto', e.target.value)}
          className={inputCls + ' text-right'} style={{ borderColor: '#0e7490' }} />
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-2">
          <button onClick={onGuardar} disabled={guardando}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white
                       px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
            style={{ backgroundColor: '#0e7490' }}
            onMouseEnter={e => !guardando && (e.currentTarget.style.backgroundColor = '#164e63')}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0e7490'}>
            {guardando && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          <button onClick={onCancelar} disabled={guardando}
            className="text-xs font-semibold bg-slate-200 hover:bg-slate-300
                       text-slate-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
            Cancelar
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

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
    <div className="flex flex-col items-center justify-center py-16 text-center
                    bg-white rounded-2xl border border-slate-100 shadow-sm">
      <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: '#e0f2fe', color: '#0e7490' }}>
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0
               0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5
               3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504
               1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      </div>
      <p className="text-slate-700 font-bold text-sm">{titulo}</p>
      <p className="text-slate-400 text-sm mt-1 max-w-xs">{descripcion}</p>
    </div>
  )
}

function MensajeError({ mensaje, onCerrar }) {
  return (
    <div className="flex items-start justify-between gap-3 bg-red-50 border border-red-100
                    text-red-700 text-sm rounded-xl px-4 py-3 mb-5">
      <div className="flex items-start gap-2.5">
        <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17
               2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10
               5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1
               1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        <span>{mensaje}</span>
      </div>
      <button onClick={onCerrar} className="text-red-400 hover:text-red-600 shrink-0 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

const lbCls = 'block text-xs font-semibold text-slate-500 mb-1.5'
const inCls = `w-full px-3 py-2 text-sm rounded-xl border border-slate-200
  text-slate-900 placeholder:text-slate-300 bg-white
  focus:outline-none focus:ring-2 focus:border-transparent`
const selCls = `px-3.5 py-2.5 text-sm rounded-xl border border-slate-200
  text-slate-900 bg-white focus:outline-none focus:ring-2 focus:border-transparent`