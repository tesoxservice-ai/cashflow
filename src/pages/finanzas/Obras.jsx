// pages/finanzas/Obras.jsx
// Módulo de gestión de obras. Accesible desde ambos roles:
//   - /finanzas/obras    (rol 'finanzas')
//   - /operaciones/obras (rol 'operaciones')

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatearMonto(monto, moneda) {
  if (monto === null || monto === undefined || monto === '') return '—'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: moneda ?? 'ARS', minimumFractionDigits: 2,
  }).format(monto)
}

function formatearFecha(fechaStr) {
  if (!fechaStr) return '—'
  return new Date(fechaStr + 'T00:00:00').toLocaleDateString('es-AR')
}

const FORM_VACIO = {
  codigo: '', nombre: '', cliente: '', numero_compra: '',
  fecha_inicio: '', fecha_fin_estimada: '', monto_contrato: '', moneda: 'ARS',
}

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

// ─── TopNav (igual que el dashboard) ─────────────────────────────────────────

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
            <div className="w-8 h-8 rounded-full flex items-center justify-center
                            text-xs font-bold text-white"
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
              <div className="absolute right-0 mt-3 w-48 bg-white rounded-xl
                              shadow-lg border border-slate-100 py-1.5 z-20">
                <div className="px-4 py-2.5 border-b border-slate-100">
                  <p className="text-slate-800 text-sm font-semibold truncate">
                    {perfil ? `${perfil.nombre} ${perfil.apellido}` : 'Usuario'}
                  </p>
                  <p className="text-slate-400 text-xs capitalize mt-0.5">
                    {perfil?.rol ?? 'Finanzas'}
                  </p>
                </div>
                <button
                  onClick={handleCerrarSesion}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm
                             text-red-600 hover:bg-red-50 transition-colors"
                >
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

export default function Obras() {
  const navigate = useNavigate()
  const { perfil } = useAuth()

  const esFinanzas      = perfil?.rol === 'finanzas'
  const breadcrumbLabel = esFinanzas ? 'Panel de Finanzas' : 'Panel de Operaciones'
  const breadcrumbRuta  = esFinanzas ? '/finanzas'         : '/operaciones'

  const [obras,            setObras]            = useState([])
  const [cargando,         setCargando]         = useState(true)
  const [errorGlobal,      setErrorGlobal]      = useState('')
  const [mostrarAlta,      setMostrarAlta]      = useState(false)
  const [form,             setForm]             = useState(FORM_VACIO)
  const [guardandoAlta,    setGuardandoAlta]    = useState(false)
  const [errorAlta,        setErrorAlta]        = useState('')
  const [filaEditando,     setFilaEditando]     = useState(null)
  const [valoresEdicion,   setValoresEdicion]   = useState({})
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [errorEdicion,     setErrorEdicion]     = useState('')
  const [toggling,         setToggling]         = useState(null)

  const cargarObras = useCallback(async () => {
    setCargando(true); setErrorGlobal('')
    const { data, error } = await supabase
      .from('obras')
      .select('id, codigo, nombre, cliente, numero_compra, fecha_inicio, fecha_fin_estimada, monto_contrato, moneda, activa')
      .order('codigo', { ascending: true })
    if (error) { setErrorGlobal('No se pudieron cargar las obras.'); setCargando(false); return }
    setObras(data ?? []); setCargando(false)
  }, [])

  useEffect(() => { cargarObras() }, [cargarObras])

  async function handleGuardarAlta(e) {
    e.preventDefault(); setErrorAlta('')
    if (!form.codigo.trim())  { setErrorAlta('El código es obligatorio.'); return }
    if (!form.nombre.trim())  { setErrorAlta('El nombre es obligatorio.'); return }
    if (!form.cliente.trim()) { setErrorAlta('El cliente es obligatorio.'); return }
    if (form.monto_contrato !== '' && (isNaN(Number(form.monto_contrato)) || Number(form.monto_contrato) < 0)) {
      setErrorAlta('El monto del contrato debe ser un número positivo.'); return
    }
    setGuardandoAlta(true)
    const payload = {
      codigo:             form.codigo.trim(),
      nombre:             form.nombre.trim(),
      cliente:            form.cliente.trim(),
      numero_compra:      form.numero_compra.trim() || null,
      fecha_inicio:       form.fecha_inicio       || null,
      fecha_fin_estimada: form.fecha_fin_estimada || null,
      monto_contrato:     form.monto_contrato !== '' ? Number(form.monto_contrato) : null,
      moneda:             form.moneda,
      activa:             true,
    }
    const { error } = await supabase.from('obras').insert(payload)
    if (error) {
      setErrorAlta(error.code === '23505' ? 'Ya existe una obra con ese código.' : 'Error al guardar. Intentá de nuevo.')
      setGuardandoAlta(false); return
    }
    setForm(FORM_VACIO); setMostrarAlta(false); setGuardandoAlta(false)
    await cargarObras()
  }

  function handleIniciarEdicion(obra) {
    setFilaEditando(obra.id)
    setValoresEdicion({
      codigo:             obra.codigo             ?? '',
      nombre:             obra.nombre             ?? '',
      cliente:            obra.cliente            ?? '',
      numero_compra:      obra.numero_compra      ?? '',
      fecha_inicio:       obra.fecha_inicio       ?? '',
      fecha_fin_estimada: obra.fecha_fin_estimada ?? '',
      monto_contrato:     obra.monto_contrato !== null && obra.monto_contrato !== undefined ? String(obra.monto_contrato) : '',
      moneda:             obra.moneda ?? 'ARS',
    })
    setErrorEdicion('')
  }

  function handleCancelarEdicion() {
    setFilaEditando(null); setValoresEdicion({}); setErrorEdicion('')
  }

  async function handleGuardarEdicion(id) {
    setErrorEdicion('')
    if (!valoresEdicion.codigo?.trim())  { setErrorEdicion('El código es obligatorio.'); return }
    if (!valoresEdicion.nombre?.trim())  { setErrorEdicion('El nombre es obligatorio.'); return }
    if (!valoresEdicion.cliente?.trim()) { setErrorEdicion('El cliente es obligatorio.'); return }
    setGuardandoEdicion(true)
    const payload = {
      codigo:             valoresEdicion.codigo.trim(),
      nombre:             valoresEdicion.nombre.trim(),
      cliente:            valoresEdicion.cliente.trim(),
      numero_compra:      valoresEdicion.numero_compra?.trim() || null,
      fecha_inicio:       valoresEdicion.fecha_inicio       || null,
      fecha_fin_estimada: valoresEdicion.fecha_fin_estimada || null,
      monto_contrato:     valoresEdicion.monto_contrato !== '' ? Number(valoresEdicion.monto_contrato) : null,
      moneda:             valoresEdicion.moneda,
    }
    const { error } = await supabase.from('obras').update(payload).eq('id', id)
    if (error) {
      setErrorEdicion(error.code === '23505' ? 'Ya existe una obra con ese código.' : 'Error al guardar los cambios.')
      setGuardandoEdicion(false); return
    }
    setFilaEditando(null); setValoresEdicion({}); setGuardandoEdicion(false)
    await cargarObras()
  }

  async function handleToggleActiva(obra) {
    setToggling(obra.id)
    const { error } = await supabase.from('obras').update({ activa: !obra.activa }).eq('id', obra.id)
    if (error) setErrorGlobal(`No se pudo ${obra.activa ? 'desactivar' : 'activar'} la obra.`)
    setToggling(null); await cargarObras()
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f0f7fa' }}>
      <TopNav perfil={perfil} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">

        {/* Encabezado */}
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <button
              onClick={() => navigate(breadcrumbRuta)}
              className="text-sm font-medium flex items-center gap-1.5 mb-2 transition-colors"
              style={{ color: '#0e7490' }}
              onMouseEnter={e => e.currentTarget.style.color = '#164e63'}
              onMouseLeave={e => e.currentTarget.style.color = '#0e7490'}
            >
              <IconBack />
              {breadcrumbLabel}
            </button>
            <h1 className="text-slate-900 text-2xl font-extrabold tracking-tight">Obras</h1>
            <p className="text-slate-400 text-sm mt-0.5">Administración del catálogo de obras de la empresa</p>
          </div>

          <button
            onClick={() => { setMostrarAlta(v => !v); setErrorAlta(''); if (mostrarAlta) setForm(FORM_VACIO) }}
            className="shrink-0 inline-flex items-center gap-2 text-white text-sm font-semibold
                       px-4 py-2.5 rounded-xl transition-colors shadow-sm"
            style={{ backgroundColor: '#0e7490' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#164e63'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0e7490'}
          >
            {mostrarAlta ? (
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
                Nueva obra
              </>
            )}
          </button>
        </div>

        {errorGlobal && <MensajeError mensaje={errorGlobal} onCerrar={() => setErrorGlobal('')} />}

        {/* Panel de alta */}
        {mostrarAlta && (
          <div className="bg-white border border-slate-100 rounded-2xl p-6 mb-6 shadow-sm">
            <h2 className="text-slate-800 font-bold text-sm mb-5">Nueva obra</h2>
            <form onSubmit={handleGuardarAlta} noValidate>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <CampoTexto label="Código *" placeholder="Ej: 677" value={form.codigo} onChange={v => setForm(f => ({ ...f, codigo: v }))} />
                <CampoTexto label="Nombre *" placeholder="Ej: NEC Rosario" value={form.nombre} onChange={v => setForm(f => ({ ...f, nombre: v }))} />
                <CampoTexto label="Cliente *" placeholder="Ej: NEC Argentina" value={form.cliente} onChange={v => setForm(f => ({ ...f, cliente: v }))} />
              </div>

              <div className="mb-4">
                <CampoTexto
                  label="Número de compra (uso interno)"
                  placeholder="Ej: OC-2026-0045"
                  value={form.numero_compra}
                  onChange={v => setForm(f => ({ ...f, numero_compra: v }))}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                <CampoFecha label="Fecha inicio" value={form.fecha_inicio} onChange={v => setForm(f => ({ ...f, fecha_inicio: v }))} />
                <CampoFecha label="Fecha fin estimada" value={form.fecha_fin_estimada} onChange={v => setForm(f => ({ ...f, fecha_fin_estimada: v }))} />
                <CampoNumero label="Monto contrato" placeholder="0,00" value={form.monto_contrato} onChange={v => setForm(f => ({ ...f, monto_contrato: v }))} />
                <CampoMoneda value={form.moneda} onChange={v => setForm(f => ({ ...f, moneda: v }))} />
              </div>

              {errorAlta && (
                <p className="text-red-600 text-sm mb-4 flex items-center gap-1.5">
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  {errorAlta}
                </p>
              )}

              <button type="submit" disabled={guardandoAlta}
                className="inline-flex items-center gap-2 text-white text-sm font-semibold
                           px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                style={{ backgroundColor: '#0e7490' }}
                onMouseEnter={e => !guardandoAlta && (e.currentTarget.style.backgroundColor = '#164e63')}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0e7490'}
              >
                {guardandoAlta && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {guardandoAlta ? 'Guardando…' : 'Guardar obra'}
              </button>
            </form>
          </div>
        )}

        {/* Tabla */}
        {cargando ? <EstadoCarga /> : obras.length === 0 ? <EstadoVacio /> : (
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
                    <Th>Código</Th>
                    <Th>Nombre</Th>
                    <Th>Cliente</Th>
                    <Th>Nº Compra</Th>
                    <Th>Inicio</Th>
                    <Th>Fin estimado</Th>
                    <Th align="right">Monto contrato</Th>
                    <Th>Moneda</Th>
                    <Th>Estado</Th>
                    <Th>{/* acciones */}</Th>
                  </tr>
                </thead>
                <tbody>
                  {obras.map(obra =>
                    filaEditando === obra.id
                      ? <FilaEdicion key={obra.id} obra={obra} valores={valoresEdicion} guardando={guardandoEdicion}
                          onChange={(campo, valor) => setValoresEdicion(v => ({ ...v, [campo]: valor }))}
                          onGuardar={() => handleGuardarEdicion(obra.id)} onCancelar={handleCancelarEdicion} />
                      : <FilaNormal key={obra.id} obra={obra} toggling={toggling === obra.id}
                          editandoOtra={filaEditando !== null}
                          onEditar={() => handleIniciarEdicion(obra)} onToggle={() => handleToggleActiva(obra)} />
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60">
              <p className="text-xs text-slate-400">
                {obras.length} obra{obras.length !== 1 ? 's' : ''} en total · {obras.filter(o => o.activa).length} activa{obras.filter(o => o.activa).length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// ─── Filas de tabla ───────────────────────────────────────────────────────────

function FilaNormal({ obra, toggling, editandoOtra, onEditar, onToggle }) {
  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
      <td className="px-5 py-3.5 font-semibold text-slate-800 whitespace-nowrap">{obra.codigo}</td>
      <td className="px-5 py-3.5 text-slate-700">{obra.nombre}</td>
      <td className="px-5 py-3.5 text-slate-600">{obra.cliente}</td>
      <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">
        {obra.numero_compra
          ? <span className="inline-block text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">{obra.numero_compra}</span>
          : <span className="text-slate-300 text-xs">—</span>}
      </td>
      <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">{formatearFecha(obra.fecha_inicio)}</td>
      <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">{formatearFecha(obra.fecha_fin_estimada)}</td>
      <td className="px-5 py-3.5 text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap">{formatearMonto(obra.monto_contrato, obra.moneda)}</td>
      <td className="px-5 py-3.5"><BadgeMoneda moneda={obra.moneda} /></td>
      <td className="px-5 py-3.5"><BadgeEstado activa={obra.activa} /></td>
      <td className="px-5 py-3.5">
        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
          <button onClick={onEditar} disabled={editandoOtra || toggling}
            className="text-xs font-semibold text-white px-3 py-1.5 rounded-lg transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#0e7490' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#164e63'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0e7490'}
          >
            Editar
          </button>
          {toggling ? (
            <span className="flex items-center gap-1.5 text-xs text-slate-500 px-2">
              <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
              {obra.activa ? 'Desactivando…' : 'Activando…'}
            </span>
          ) : (
            <button onClick={onToggle} disabled={editandoOtra}
              className={`text-xs font-semibold text-white px-3 py-1.5 rounded-lg transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed
                         ${obra.activa ? 'bg-slate-400 hover:bg-slate-500' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
              {obra.activa ? 'Desactivar' : 'Activar'}
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

function FilaEdicion({ obra, valores, guardando, onChange, onGuardar, onCancelar }) {
  const inputCls = `w-full px-2 py-1.5 text-sm rounded-lg border text-slate-900 focus:outline-none focus:ring-2 focus:border-transparent bg-white`
  const inputStyle = { borderColor: '#0e7490', '--tw-ring-color': '#0e7490' }
  return (
    <tr className="border-b border-slate-200 bg-cyan-50/40">
      <td className="px-3 py-2.5 min-w-[90px]">
        <input type="text" value={valores.codigo ?? ''} onChange={e => onChange('codigo', e.target.value)} className={inputCls} style={inputStyle} placeholder="Código" />
      </td>
      <td className="px-3 py-2.5 min-w-[160px]">
        <input type="text" value={valores.nombre ?? ''} onChange={e => onChange('nombre', e.target.value)} className={inputCls} style={inputStyle} placeholder="Nombre" />
      </td>
      <td className="px-3 py-2.5 min-w-[140px]">
        <input type="text" value={valores.cliente ?? ''} onChange={e => onChange('cliente', e.target.value)} className={inputCls} style={inputStyle} placeholder="Cliente" />
      </td>
      <td className="px-3 py-2.5 min-w-[140px]">
        <input type="text" value={valores.numero_compra ?? ''} onChange={e => onChange('numero_compra', e.target.value)} className={inputCls} style={inputStyle} placeholder="Nº compra" />
      </td>
      <td className="px-3 py-2.5 min-w-[140px]">
        <input type="date" value={valores.fecha_inicio ?? ''} onChange={e => onChange('fecha_inicio', e.target.value)} className={inputCls} style={inputStyle} />
      </td>
      <td className="px-3 py-2.5 min-w-[140px]">
        <input type="date" value={valores.fecha_fin_estimada ?? ''} onChange={e => onChange('fecha_fin_estimada', e.target.value)} className={inputCls} style={inputStyle} />
      </td>
      <td className="px-3 py-2.5 min-w-[130px]">
        <input type="number" min="0" step="0.01" value={valores.monto_contrato ?? ''} onChange={e => onChange('monto_contrato', e.target.value)} className={inputCls + ' text-right'} style={inputStyle} placeholder="0,00" />
      </td>
      <td className="px-3 py-2.5 min-w-[90px]">
        <select value={valores.moneda ?? 'ARS'} onChange={e => onChange('moneda', e.target.value)} className={inputCls} style={inputStyle}>
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>
      </td>
      <td className="px-3 py-2.5"><BadgeEstado activa={obra.activa} /></td>
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
          <button onClick={onGuardar} disabled={guardando}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white
                       px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#0e7490' }}
            onMouseEnter={e => !guardando && (e.currentTarget.style.backgroundColor = '#164e63')}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0e7490'}
          >
            {guardando && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          <button onClick={onCancelar} disabled={guardando}
            className="text-xs font-semibold bg-slate-200 hover:bg-slate-300 disabled:opacity-50
                       text-slate-700 px-3 py-1.5 rounded-lg transition-colors">
            Cancelar
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function Th({ children, align = 'left' }) {
  return (
    <th className={`px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function BadgeMoneda({ moneda }) {
  return moneda === 'USD'
    ? <span className="inline-block text-xs font-semibold text-yellow-700 bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded-full">USD</span>
    : <span className="inline-block text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">ARS</span>
}

function BadgeEstado({ activa }) {
  return activa
    ? <span className="inline-block text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-full">Activa</span>
    : <span className="inline-block text-xs font-semibold text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full">Inactiva</span>
}

function CampoTexto({ label, placeholder, value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</label>
      <input type="text" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 text-slate-900
                   placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:border-transparent bg-white"
        style={{ '--tw-ring-color': '#0e7490' }}
      />
    </div>
  )
}

function CampoFecha({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</label>
      <input type="date" value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 text-slate-900
                   focus:outline-none focus:ring-2 focus:border-transparent bg-white"
        style={{ '--tw-ring-color': '#0e7490' }}
      />
    </div>
  )
}

function CampoNumero({ label, placeholder, value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</label>
      <input type="number" min="0" step="0.01" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 text-slate-900
                   placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:border-transparent text-right bg-white"
        style={{ '--tw-ring-color': '#0e7490' }}
      />
    </div>
  )
}

function CampoMoneda({ value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5">Moneda</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 text-slate-900
                   bg-white focus:outline-none focus:ring-2 focus:border-transparent"
        style={{ '--tw-ring-color': '#0e7490' }}
      >
        <option value="ARS">ARS — Peso argentino</option>
        <option value="USD">USD — Dólar estadounidense</option>
      </select>
    </div>
  )
}

function EstadoCarga() {
  return (
    <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
      <span className="w-5 h-5 border-2 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
      <span className="text-sm">Cargando obras…</span>
    </div>
  )
}

function EstadoVacio() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-slate-100 shadow-sm">
      <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: '#e0f2fe', color: '#0e7490' }}>
        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75
               3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75
               21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504
               1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75
               3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0
               3h.008v.008h-.008v-.008z" />
        </svg>
      </div>
      <p className="text-slate-700 font-bold text-sm">Sin obras cargadas</p>
      <p className="text-slate-400 text-sm mt-1 max-w-xs">Usá el botón "Nueva obra" para agregar la primera.</p>
    </div>
  )
}

function MensajeError({ mensaje, onCerrar }) {
  return (
    <div className="flex items-start justify-between gap-3 bg-red-50 border border-red-100
                    text-red-700 text-sm rounded-xl px-4 py-3 mb-5">
      <div className="flex items-start gap-2.5">
        <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28
            10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485
            2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110
            5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
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