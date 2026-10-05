// pages/finanzas/Historial.jsx
// Historial completo de acciones: quién hizo qué y cuándo. Solo lectura.
//
// Los registros los escribe la base de datos automáticamente (triggers, ver
// historial.sql): acá solo se leen, se filtran y se explican en lenguaje claro,
// con el valor anterior y el nuevo cuando corresponde.
// Ruta: /finanzas/historial

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import TopNav from '../../components/TopNav'
import { describir, agrupar, MODULOS, ACCIONES } from '../../lib/historial'

const POR_PAGINA = 50
const FILTROS_VACIOS = { texto: '', usuario: '', rol: '', modulo: '', accion: '', obra: '', desde: '', hasta: '', registro: '' }

const ROLES = [
  { value: 'operaciones', label: 'Operaciones' },
  { value: 'finanzas', label: 'Finanzas' },
  { value: 'directorio', label: 'Directorio' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function sumarDias(iso, n) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return isoLocal(d)
}

const fechaCorta = iso => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const horaCorta = iso => `${new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })} hs`

function tituloDia(iso) {
  const t = new Date(iso).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Arma la consulta con los filtros elegidos (se filtra en la base, no en el navegador).
function construirConsulta(f) {
  let q = supabase.from('historial').select('*', { count: 'exact' })
  if (f.usuario === '__sistema') q = q.is('usuario_id', null)
  else if (f.usuario) q = q.eq('usuario_id', f.usuario)
  if (f.rol) q = q.eq('usuario_rol', f.rol)
  if (f.modulo) q = q.eq('tabla', f.modulo)
  if (f.accion) q = q.eq('accion', f.accion)
  if (f.obra) q = q.eq('obra_id', f.obra)
  if (f.registro) q = q.eq('registro_id', f.registro)
  if (f.desde) q = q.gte('creado_en', new Date(f.desde + 'T00:00:00').toISOString())
  if (f.hasta) q = q.lt('creado_en', new Date(sumarDias(f.hasta, 1) + 'T00:00:00').toISOString())
  f.texto.trim().toLowerCase().split(/\s+/).filter(Boolean).forEach(p => {
    q = q.ilike('busqueda', `%${p.replace(/[%_,()]/g, '')}%`)
  })
  return q.order('creado_en', { ascending: false }).order('id', { ascending: false })
}

// ─── Íconos ───────────────────────────────────────────────────────────────────

const Ico = ({ d, className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
)
const ICONO_ACCION = {
  crear: 'M12 4.5v15m7.5-7.5h-15',
  modificar: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10',
  eliminar: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
}
const IconBack = () => <Ico d="M15.75 19.5L8.25 12l7.5-7.5" className="w-3.5 h-3.5" />
const IconBuscar = () => <Ico d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />

const TONOS = {
  emerald: { fondo: 'bg-emerald-50', texto: 'text-emerald-700', icono: 'bg-emerald-100 text-emerald-700' },
  amber: { fondo: 'bg-amber-50', texto: 'text-amber-700', icono: 'bg-amber-100 text-amber-700' },
  rose: { fondo: 'bg-rose-50', texto: 'text-rose-700', icono: 'bg-rose-100 text-rose-700' },
}

const selCls = `w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 text-slate-900 bg-white
  transition-shadow focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:border-teal-400`
const lbCls = 'block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5'

// ══════════════════════════════════════════════════════════════
// Página
// ══════════════════════════════════════════════════════════════
export default function Historial() {
  const { perfil } = useAuth()
  const navigate = useNavigate()

  const [filtros, setFiltros] = useState(FILTROS_VACIOS)
  const [textoDebounce, setTextoDebounce] = useState('')
  const [entradas, setEntradas] = useState([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [error, setError] = useState('')
  const [noInstalado, setNoInstalado] = useState(false)
  const [obras, setObras] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const pedido = useRef(0) // descarta respuestas viejas si el filtro cambió mientras cargaba

  const set = (k, v) => setFiltros(f => ({ ...f, [k]: v }))

  // El buscador espera un instante después de tipear.
  useEffect(() => {
    const t = setTimeout(() => setTextoDebounce(filtros.texto), 350)
    return () => clearTimeout(t)
  }, [filtros.texto])

  const filtrosEfectivos = useMemo(() => ({ ...filtros, texto: textoDebounce }), [filtros, textoDebounce])

  // Listas para los filtros
  useEffect(() => {
    supabase.from('obras').select('id, codigo, nombre').order('codigo').then(({ data }) => setObras(data ?? []))
    supabase.from('historial').select('usuario_id, usuario_nombre, usuario_rol')
      .order('creado_en', { ascending: false }).limit(3000)
      .then(({ data }) => {
        const mapa = new Map()
        ;(data ?? []).forEach(r => {
          const k = r.usuario_id ?? '__sistema'
          if (!mapa.has(k)) mapa.set(k, { id: k, nombre: r.usuario_nombre, rol: r.usuario_rol })
        })
        setUsuarios([...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
      })
  }, [])

  const cargar = useCallback(async (offset) => {
    const mio = ++pedido.current
    if (offset === 0) setCargando(true); else setCargandoMas(true)
    setError('')
    const { data, error: err, count } = await construirConsulta(filtrosEfectivos).range(offset, offset + POR_PAGINA - 1)
    if (mio !== pedido.current) return
    if (err) {
      if (err.code === '42P01' || err.code === 'PGRST205' || /historial/.test(err.message ?? '')) setNoInstalado(true)
      else setError('No se pudo cargar el historial.')
      setCargando(false); setCargandoMas(false); return
    }
    setNoInstalado(false)
    setTotal(count ?? 0)
    setEntradas(prev => (offset === 0 ? (data ?? []) : [...prev, ...(data ?? [])]))
    setCargando(false); setCargandoMas(false)
  }, [filtrosEfectivos])

  useEffect(() => { cargar(0) }, [cargar])

  // Agrupado por día (y las altas/bajas hechas juntas, en un solo bloque)
  const dias = useMemo(() => {
    const mapa = new Map()
    agrupar(entradas).forEach(g => {
      const iso = g.items[0].creado_en
      const clave = isoLocal(new Date(iso))
      if (!mapa.has(clave)) mapa.set(clave, { clave, titulo: tituloDia(iso), grupos: [] })
      mapa.get(clave).grupos.push(g)
    })
    return [...mapa.values()]
  }, [entradas])

  const hayFiltros = Object.entries(filtros).some(([, v]) => v)

  function rangoRapido(dias) {
    const hoy = isoLocal(new Date())
    setFiltros(f => ({ ...f, desde: dias === 0 ? hoy : sumarDias(hoy, -dias), hasta: hoy }))
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f0f7fa' }}>
      <TopNav perfil={perfil} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8">
        {/* Encabezado */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <button onClick={() => navigate('/finanzas')}
              className="text-sm font-medium flex items-center gap-1.5 mb-2 transition-colors"
              style={{ color: '#0e7490' }}
              onMouseEnter={e => e.currentTarget.style.color = '#164e63'}
              onMouseLeave={e => e.currentTarget.style.color = '#0e7490'}>
              <IconBack />
              Panel de Finanzas
            </button>
            <h1 className="text-slate-900 text-2xl font-extrabold tracking-tight">Historial</h1>
            <p className="text-slate-400 text-sm mt-0.5 max-w-2xl">
              Todo lo que se carga, modifica o elimina en el sistema queda registrado automáticamente: quién lo hizo, cuándo,
              sobre qué obra y cuál era el valor anterior. Es solo lectura y no se puede editar ni borrar.
            </p>
          </div>
          <button onClick={() => cargar(0)}
            className="px-3.5 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            Actualizar
          </button>
        </div>

        {noInstalado ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-2xl px-5 py-4">
            El historial todavía no está activado en la base de datos. Hay que correr el script <b>historial.sql</b> en Supabase;
            a partir de ahí empieza a registrar solo.
          </div>
        ) : (
          <>
            {/* Filtros */}
            <div className="bg-white border border-slate-100 rounded-2xl p-4 sm:p-5 mb-6 shadow-sm space-y-4">
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none"><IconBuscar /></span>
                <input value={filtros.texto} onChange={e => set('texto', e.target.value)}
                  placeholder="Buscar por usuario, obra, rubro, concepto…" className={`${selCls} !pl-10`} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className={lbCls}>Usuario</label>
                  <select value={filtros.usuario} onChange={e => set('usuario', e.target.value)} className={selCls}>
                    <option value="">Todos</option>
                    {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}{u.rol ? ` · ${u.rol}` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbCls}>Área</label>
                  <select value={filtros.rol} onChange={e => set('rol', e.target.value)} className={selCls}>
                    <option value="">Todas</option>
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbCls}>Módulo</label>
                  <select value={filtros.modulo} onChange={e => set('modulo', e.target.value)} className={selCls}>
                    <option value="">Todos</option>
                    {MODULOS.map(m => <option key={m.tabla} value={m.tabla}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbCls}>Tipo de acción</label>
                  <select value={filtros.accion} onChange={e => set('accion', e.target.value)} className={selCls}>
                    <option value="">Todas</option>
                    {ACCIONES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={lbCls}>Obra</label>
                  <select value={filtros.obra} onChange={e => set('obra', e.target.value)} className={selCls}>
                    <option value="">Todas las obras</option>
                    {obras.map(o => <option key={o.id} value={o.id}>{o.codigo} · {o.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbCls}>Desde</label>
                  <input type="date" value={filtros.desde} onChange={e => set('desde', e.target.value)} className={selCls} />
                </div>
                <div>
                  <label className={lbCls}>Hasta</label>
                  <input type="date" value={filtros.hasta} onChange={e => set('hasta', e.target.value)} className={selCls} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400 mr-1">Rápido:</span>
                {[[0, 'Hoy'], [7, 'Últimos 7 días'], [30, 'Últimos 30 días']].map(([d, t]) => (
                  <button key={t} onClick={() => rangoRapido(d)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">
                    {t}
                  </button>
                ))}
                <button onClick={() => set('accion', 'modificar')}
                  className="px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-lg hover:bg-amber-100 transition-colors">
                  Solo modificaciones
                </button>
                <button onClick={() => set('modulo', 'presupuestos')}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">
                  Solo presupuestos
                </button>
                {hayFiltros && (
                  <button onClick={() => setFiltros(FILTROS_VACIOS)}
                    className="ml-auto px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                    Limpiar filtros
                  </button>
                )}
              </div>

              {filtros.registro && (
                <div className="flex items-center gap-2 rounded-xl bg-violet-50 border border-violet-100 px-3.5 py-2.5 text-sm text-violet-800">
                  Mostrando solo el historial de un registro puntual.
                  <button onClick={() => set('registro', '')} className="ml-auto text-xs font-semibold underline">Ver todo</button>
                </div>
              )}
            </div>

            {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">{error}</div>}

            {/* Resultado */}
            {cargando ? (
              <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
                <span className="w-5 h-5 border-2 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
                <span className="text-sm">Cargando historial…</span>
              </div>
            ) : entradas.length === 0 ? (
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm py-16 text-center">
                <p className="text-slate-700 font-bold text-sm">{hayFiltros ? 'No hay registros con esos filtros' : 'Todavía no hay registros'}</p>
                <p className="text-slate-400 text-xs mt-1 max-w-sm mx-auto">
                  {hayFiltros ? 'Probá sacando algún filtro.' : 'Apenas alguien cargue, modifique o elimine algo, va a aparecer acá.'}
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-400 mb-3">
                  {total.toLocaleString('es-AR')} registro{total !== 1 ? 's' : ''}{hayFiltros ? ' con estos filtros' : ''} · más recientes primero
                </p>
                <div className="space-y-6">
                  {dias.map(dia => (
                    <section key={dia.clave}>
                      <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">{dia.titulo}</h2>
                      <div className="space-y-3">
                        {dia.grupos.map(g => (
                          <Entrada key={g.items[0].id} grupo={g}
                            onVerRegistro={id => setFiltros({ ...FILTROS_VACIOS, registro: id })} />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>

                {entradas.length < total && (
                  <div className="text-center mt-8">
                    <button onClick={() => cargar(entradas.length)} disabled={cargandoMas}
                      className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50">
                      {cargandoMas ? 'Cargando…' : `Cargar más (${total - entradas.length} restantes)`}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Una entrada del historial (o un bloque de altas/bajas hechas juntas)
// ══════════════════════════════════════════════════════════════
function Entrada({ grupo, onVerRegistro }) {
  const primera = grupo.items[0]
  const d = describir(primera)
  const tono = TONOS[d.tono]
  const accion = ACCIONES.find(a => a.value === primera.accion)
  const varios = grupo.items.length > 1
  const rol = ROLES.find(r => r.value === primera.usuario_rol)?.label ?? (primera.usuario_id ? primera.usuario_rol : 'Base de datos')

  // Frase: "Laura modificó el presupuesto de Obra 678"
  const objeto = varios ? `${grupo.items.length} ${d.def.plural}` : d.objeto
  const verbo = varios ? (primera.accion === 'crear' ? 'creó' : 'eliminó') : d.verbo

  return (
    <article className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4 sm:p-5">
      <div className="flex items-start gap-3.5">
        <span className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${tono.icono}`}>
          <Ico d={ICONO_ACCION[primera.accion]} className="w-5 h-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <p className="text-[15px] text-slate-800 leading-snug">
              <b className="font-bold text-slate-900">{primera.usuario_nombre}</b> {verbo} {objeto}{d.conector === ':' && d.obra ? ':' : ''}
              {d.obra && (
                <> {d.conector === ':' ? '' : `${d.conector} `}<b className="font-bold text-slate-900">{d.obra}</b></>
              )}
            </p>
            <p className="text-xs text-slate-400 tabular-nums whitespace-nowrap">{fechaCorta(primera.creado_en)} – {horaCorta(primera.creado_en)}</p>
          </div>

          {/* Etiquetas */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <Chip cls="bg-slate-100 text-slate-600">{d.def.modulo}</Chip>
            <Chip cls={`${tono.fondo} ${tono.texto}`}>{accion?.corto ?? primera.accion}</Chip>
            <Chip cls="bg-sky-50 text-sky-700">{rol}</Chip>
            {!varios && d.chips.map(c => <Chip key={c} cls="bg-white text-amber-700 border border-amber-200">{c}</Chip>)}
          </div>

          {/* Detalle */}
          {varios ? (
            <ul className="mt-3 rounded-xl bg-slate-50/80 border border-slate-100 divide-y divide-slate-100">
              {grupo.items.map(it => {
                const di = describir(it)
                return (
                  <li key={it.id} className="px-3.5 py-2 text-sm text-slate-700">
                    {di.valores.map(v => `${v.label}: ${v.valor}`).join(' · ')}
                  </li>
                )
              })}
            </ul>
          ) : (
            (d.contexto.length > 0 || d.cambios.length > 0 || d.valores.length > 0) && (
              <div className="mt-3 rounded-xl bg-slate-50/80 border border-slate-100 px-4 py-3 space-y-1.5 text-sm">
                {d.contexto.map(c => (
                  <p key={c.label} className="text-slate-600"><span className="text-slate-400">{c.label}:</span> {c.valor}</p>
                ))}
                {d.cambios.map(c => (
                  <div key={c.label} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-slate-400">{c.label}:</span>
                    <span className="text-slate-400 text-xs">Anterior</span>
                    <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 line-through decoration-rose-300 tabular-nums">{c.antes}</span>
                    <span className="text-slate-300">→</span>
                    <span className="text-slate-400 text-xs">Nuevo</span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-semibold tabular-nums">{c.nuevo}</span>
                  </div>
                ))}
                {d.valores.map(v => (
                  <p key={v.label} className="text-slate-600"><span className="text-slate-400">{v.label}:</span> <span className="tabular-nums">{v.valor}</span></p>
                ))}
              </div>
            )
          )}

          {!varios && primera.registro_id && (
            <button onClick={() => onVerRegistro(primera.registro_id)}
              className="mt-2.5 text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors">
              Ver todo el historial de este registro
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

function Chip({ cls, children }) {
  return <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap ${cls}`}>{children}</span>
}
