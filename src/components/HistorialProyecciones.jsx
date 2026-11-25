// components/HistorialProyecciones.jsx
// Fotos de proyección: guarda cómo está la proyección de caja hoy y compara dos fotos entre sí
// (la idea es una foto cada 2 semanas).
//
// - "Guardar foto" es SIEMPRE manual (un botón). No hay nada automático.
// - Solo lo ven y lo usan el rol Directorio y Santiago Verdinelli (ver lib/permisos.js).
//   La restricción real está en sql/snapshots_proyeccion.sql (políticas de la tabla).
// - Una foto se puede RENOMBRAR (nombre y nota) y BORRAR; los números de una foto no se cambian nunca.
//   Eso lo habilita sql/snapshots_proyeccion_editar_borrar.sql.
// - Las ventas van en NETO: ya descontadas las retenciones del cliente y los impuestos del banco.
// Se usa en el Directorio (pestaña "Historial de proyecciones") y en Finanzas (/finanzas/historial-proyecciones).

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import useCajaBase from '../lib/useCajaBase'
import { puedeGuardarSnapshots } from '../lib/permisos'
import { armarSnapshot, compararSnapshots, alinearSeries, seguimientoDeLoEsperado, idsParaConsultar, CONCEPTOS } from '../lib/snapshots'
import GraficoCashflow from '../pages/directorio/GraficoCashflow'
import { fmtARS, fmtFecha, hoyISO, CARD } from '../pages/directorio/utilsDirectorio'

const DIAS_ENTRE_FOTOS = 14 // cada 2 semanas
const COLOR_FOTO_ANTERIOR = '#6366f1' // indigo-500

const CLASES_CAMBIO = {
  nueva:      { label: 'Nueva',            clase: 'bg-emerald-50 text-emerald-700' },
  sacada:     { label: 'Sacada',           clase: 'bg-rose-50 text-rose-700' },
  monto:      { label: 'Cambió el monto',  clase: 'bg-amber-50 text-amber-700' },
  fecha:      { label: 'Cambió la fecha',  clase: 'bg-sky-50 text-sky-700' },
  proyeccion: { label: 'Proyección',       clase: 'bg-violet-50 text-violet-700' },
}

const fmtMes = ym => {
  const t = new Date(ym + '-01T00:00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}
const fmtDif = n => `${n > 0 ? '+' : ''}${fmtARS(n)}`
const fmtCreada = iso => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
const tablaFaltante = e => e && (e.code === '42P01' || e.code === 'PGRST205')
const redondear = n => Math.round((Number(n) || 0) * 100) / 100

function diasDesde(isoFecha) {
  return Math.round((new Date(hoyISO() + 'T00:00:00') - new Date(isoFecha + 'T00:00:00')) / 86400000)
}

export default function HistorialProyecciones() {
  const { user, perfil } = useAuth()
  const permitido = puedeGuardarSnapshots(user, perfil)

  if (!permitido) {
    return (
      <div className={`${CARD} p-6 text-sm text-slate-500`}>
        Las fotos de proyección son solo para el Directorio y Santiago Verdinelli.
      </div>
    )
  }
  return <Contenido perfil={perfil} />
}

function Contenido({ perfil }) {
  const { base, resultado, cargando, error } = useCajaBase()
  const [lista, setLista] = useState(null)
  const [errorLista, setErrorLista] = useState('')
  const [sinTabla, setSinTabla] = useState(false)

  const cargarLista = useCallback(async () => {
    const { data, error: e } = await supabase.from('snapshots_proyeccion')
      .select('id, created_at, creado_por, nombre, nota, fecha_corte, resumen')
      .order('created_at', { ascending: false })
    if (e) {
      if (tablaFaltante(e)) setSinTabla(true)
      else setErrorLista('No se pudo cargar el historial.')
      setLista([])
      return
    }
    setLista(data ?? [])
  }, [])

  useEffect(() => { cargarLista() }, [cargarLista])

  if (sinTabla) {
    return (
      <div className={`${CARD} p-6 text-sm text-slate-600`}>
        <p className="font-semibold text-slate-800 mb-1">Falta crear la tabla de las fotos.</p>
        <p>Hay que correr una vez el script <code className="bg-slate-100 px-1 rounded">sql/snapshots_proyeccion.sql</code> en Supabase.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <GuardarFoto base={base} resultado={resultado} cargando={cargando} error={error} perfil={perfil}
        lista={lista} onGuardada={cargarLista} />
      {errorLista && <p className="text-red-600 text-sm">{errorLista}</p>}
      <ListaYComparador lista={lista} onCambio={cargarLista} />
    </div>
  )
}

// ─── Guardar foto ─────────────────────────────────────────────────────────────

function GuardarFoto({ base, resultado, cargando, error, perfil, lista, onGuardada }) {
  const hoy = hoyISO()
  const [nombre, setNombre] = useState('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState(null) // { ok, texto }

  const ultima = lista?.[0] ?? null
  const dias = ultima ? diasDesde(ultima.fecha_corte) : null
  const toca = lista && (ultima === null || dias >= DIAS_ENTRE_FOTOS)
  const yaHoy = ultima && ultima.fecha_corte === hoy

  async function guardar() {
    if (!base || !resultado || guardando) return
    const nombreFinal = nombre.trim() || `Foto del ${fmtFecha(hoy)}`
    setGuardando(true); setMensaje(null)
    try {
      const snap = armarSnapshot({ base, resultado, hoy })
      const { error: e } = await supabase.from('snapshots_proyeccion').insert({
        nombre: nombreFinal,
        nota: nota.trim() || null,
        fecha_corte: snap.fecha_corte,
        creado_por: [perfil?.nombre, perfil?.apellido].filter(Boolean).join(' ') || null,
        version: snap.version,
        resumen: snap.resumen, mensual: snap.mensual, serie: snap.serie, filas: snap.filas,
      })
      if (e) throw e
      setNombre(''); setNota('')
      setMensaje({ ok: true, texto: `Foto guardada: "${nombreFinal}".` })
      await onGuardada()
    } catch (err) {
      console.error('[Guardar foto]', err)
      setMensaje({ ok: false, texto: 'No se pudo guardar la foto. Probá de nuevo en un momento.' })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className={`${CARD} p-5 sm:p-6`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-slate-900 font-bold text-base">Guardar una foto</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Una foto guarda cómo está la proyección hoy ({fmtFecha(hoy)}), para compararla con otra más adelante. Se guarda solo al tocar el botón.
          </p>
        </div>
        {lista && (
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${toca ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {ultima === null
              ? 'Todavía no hay fotos'
              : toca
                ? `Última foto hace ${dias} días: toca una nueva`
                : dias === 0 ? 'Última foto: hoy' : `Última foto hace ${dias} ${dias === 1 ? 'día' : 'días'}`}
          </span>
        )}
      </div>

      <div className="grid gap-3 mt-4 sm:grid-cols-[1fr_2fr_auto] items-end">
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Nombre</span>
          <input value={nombre} onChange={e => setNombre(e.target.value)} maxLength={80}
            placeholder={`Foto del ${fmtFecha(hoy)}`}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600/30" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Nota (opcional)</span>
          <input value={nota} onChange={e => setNota(e.target.value)} maxLength={300}
            placeholder="Ej.: después de mover las ventas de la 659"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600/30" />
        </label>
        <button onClick={guardar} disabled={!base || guardando}
          className="text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm disabled:opacity-50 transition-colors"
          style={{ backgroundColor: '#0e7490' }}>
          {guardando ? 'Guardando…' : cargando ? 'Cargando datos…' : 'Guardar foto ahora'}
        </button>
      </div>

      {yaHoy && !mensaje && (
        <p className="text-amber-700 text-xs mt-2">Ya hay una foto de hoy. Podés guardar otra, pero van a quedar las dos.</p>
      )}
      {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
      {mensaje && <p className={`text-xs mt-2 ${mensaje.ok ? 'text-emerald-700' : 'text-red-600'}`}>{mensaje.texto}</p>}
    </div>
  )
}

// ─── Lista (renombrar y borrar) y comparador ──────────────────────────────────

const TEXTO_FALTA_SCRIPT = 'No se pudo. Falta habilitar el cambio de fotos: correr el script sql/snapshots_proyeccion_editar_borrar.sql.'

function ListaYComparador({ lista, onCambio }) {
  const [idA, setIdA] = useState(null)
  const [idB, setIdB] = useState(null)
  const [completas, setCompletas] = useState(null) // { a, b } con todo el contenido
  const [errorComp, setErrorComp] = useState('')
  const [cargandoComp, setCargandoComp] = useState(false)
  const [refresco, setRefresco] = useState(0) // se sube para volver a cargar las fotos que se comparan (por ejemplo, tras renombrar)

  const [editando, setEditando] = useState(null)   // { id, nombre, nota }
  const [trabajando, setTrabajando] = useState(false)
  const [errorAccion, setErrorAccion] = useState('')
  const [confirmando, setConfirmando] = useState(null) // id de la foto que se está por borrar (pide confirmación en la pantalla)

  // Por defecto: las dos últimas (la anterior contra la más nueva).
  useEffect(() => {
    if (!lista || lista.length < 2) return
    setIdB(prev => (prev && lista.some(f => f.id === prev)) ? prev : lista[0].id)
    setIdA(prev => (prev && lista.some(f => f.id === prev)) ? prev : lista[1].id)
  }, [lista])

  useEffect(() => {
    if (!idA || !idB || idA === idB) { setCompletas(null); return }
    let vivo = true
    setCargandoComp(true); setErrorComp('')
    supabase.from('snapshots_proyeccion').select('*').in('id', [idA, idB]).then(({ data, error: e }) => {
      if (!vivo) return
      setCargandoComp(false)
      if (e || !data || data.length < 2) { setErrorComp('No se pudieron cargar las fotos para comparar.'); setCompletas(null); return }
      setCompletas({ a: data.find(f => f.id === idA), b: data.find(f => f.id === idB) })
    })
    return () => { vivo = false }
  }, [idA, idB, refresco])

  const comparacion = useMemo(() => (completas ? compararSnapshots(completas.a, completas.b) : null), [completas])

  async function guardarNombre() {
    const nombre = editando.nombre.trim()
    if (!nombre) { setErrorAccion('El nombre no puede quedar vacío.'); return }
    setTrabajando(true); setErrorAccion('')
    const { data, error: e } = await supabase.from('snapshots_proyeccion')
      .update({ nombre, nota: editando.nota.trim() || null }).eq('id', editando.id).select('id')
    setTrabajando(false)
    if (e || !data || data.length === 0) { setErrorAccion(TEXTO_FALTA_SCRIPT); return }
    setEditando(null)
    await onCambio()
    setRefresco(n => n + 1) // vuelve a cargar la comparación con el nombre nuevo
  }

  async function borrar(f) {
    setTrabajando(true); setErrorAccion('')
    const { data, error: e } = await supabase.from('snapshots_proyeccion').delete().eq('id', f.id).select('id')
    setTrabajando(false)
    setConfirmando(null)
    if (e || !data || data.length === 0) { setErrorAccion(TEXTO_FALTA_SCRIPT); return }
    if (idA === f.id) setIdA(null)
    if (idB === f.id) setIdB(null)
    setCompletas(null)
    await onCambio()
  }

  if (lista === null) return <p className="text-slate-400 text-sm">Cargando fotos…</p>
  if (lista.length === 0) {
    return (
      <div className={`${CARD} p-6 text-sm text-slate-500`}>
        Todavía no se guardó ninguna foto. Guardá la primera con el botón de arriba; a partir de la segunda se pueden comparar.
      </div>
    )
  }

  return (
    <>
      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100">
          <h2 className="text-slate-900 font-bold text-base">Fotos guardadas</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Marcá cuál es la <b>anterior</b> y cuál la <b>nueva</b> para ver cuánto cambió la caja. Podés cambiarles el nombre o borrarlas.
          </p>
        </div>
        {errorAccion && <p className="px-5 sm:px-6 pt-3 text-sm text-red-600">{errorAccion}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="px-4 py-2 font-semibold w-20 text-center">Anterior</th>
                <th className="px-4 py-2 font-semibold w-20 text-center">Nueva</th>
                <th className="px-4 py-2 font-semibold">Foto</th>
                <th className="px-4 py-2 font-semibold text-right">Caja ese día</th>
                <th className="px-4 py-2 font-semibold text-right">Caja más baja</th>
                <th className="px-4 py-2 font-semibold text-right"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map(f => (
                <tr key={f.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 align-top">
                  <td className="px-4 py-2.5 text-center">
                    <input type="radio" name="foto-a" checked={idA === f.id} onChange={() => setIdA(f.id)} aria-label={`Foto anterior: ${f.nombre}`} />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <input type="radio" name="foto-b" checked={idB === f.id} onChange={() => setIdB(f.id)} aria-label={`Foto nueva: ${f.nombre}`} />
                  </td>
                  <td className="px-4 py-2.5 min-w-[14rem]">
                    {editando?.id === f.id ? (
                      <div className="space-y-1.5">
                        <input value={editando.nombre} onChange={e => setEditando(x => ({ ...x, nombre: e.target.value }))} maxLength={80} autoFocus
                          className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600/30" placeholder="Nombre" />
                        <input value={editando.nota} onChange={e => setEditando(x => ({ ...x, nota: e.target.value }))} maxLength={300}
                          className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-600/30" placeholder="Nota (opcional)" />
                        <div className="flex items-center gap-3 text-xs">
                          <button onClick={guardarNombre} disabled={trabajando} className="font-semibold text-white px-3 py-1 rounded-lg disabled:opacity-50" style={{ backgroundColor: '#0e7490' }}>
                            {trabajando ? 'Guardando…' : 'Guardar'}
                          </button>
                          <button onClick={() => { setEditando(null); setErrorAccion('') }} disabled={trabajando} className="font-semibold text-slate-500 hover:text-slate-800">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="font-semibold text-slate-800">{f.nombre}</div>
                        <div className="text-xs text-slate-400">
                          {fmtFecha(f.fecha_corte)} · guardada {fmtCreada(f.created_at)}{f.creado_por ? ` por ${f.creado_por}` : ''}
                        </div>
                        {f.nota && <div className="text-xs text-slate-500 mt-0.5">{f.nota}</div>}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtARS(f.resumen?.caja_hoy)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {fmtARS(f.resumen?.caja_minima?.valor)}
                    <div className="text-[11px] text-slate-400">{f.resumen?.caja_minima?.fecha ? fmtFecha(f.resumen.caja_minima.fecha) : ''}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {editando?.id !== f.id && (
                      <div className="flex items-center justify-end gap-3 text-xs font-semibold">
                        <button onClick={() => { setEditando({ id: f.id, nombre: f.nombre, nota: f.nota ?? '' }); setErrorAccion('') }} disabled={trabajando}
                          className="hover:underline disabled:opacity-40" style={{ color: '#0e7490' }}>Renombrar</button>
                        {confirmando === f.id ? (
                          <span className="flex items-center gap-2">
                            <span className="text-slate-500 font-normal">¿Borrar? No se puede deshacer.</span>
                            <button onClick={() => borrar(f)} disabled={trabajando} className="text-white px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50">
                              {trabajando ? 'Borrando…' : 'Sí, borrar'}
                            </button>
                            <button onClick={() => setConfirmando(null)} disabled={trabajando} className="text-slate-500 hover:text-slate-800">No</button>
                          </span>
                        ) : (
                          <button onClick={() => { setConfirmando(f.id); setErrorAccion('') }} disabled={trabajando} className="text-red-600 hover:underline disabled:opacity-40">Borrar</button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {lista.length < 2 && (
        <p className="text-slate-400 text-sm">Con una sola foto no hay nada para comparar todavía. Guardá otra más adelante (por ejemplo en 2 semanas).</p>
      )}
      {lista.length >= 2 && idA && idA === idB && (
        <p className="text-amber-700 text-sm">Marcaste la misma foto como anterior y como nueva. Elegí dos distintas.</p>
      )}
      {errorComp && <p className="text-red-600 text-sm">{errorComp}</p>}
      {cargandoComp && <p className="text-slate-400 text-sm">Comparando…</p>}
      {comparacion && !cargandoComp && <Comparacion c={comparacion} />}
    </>
  )
}

// ─── Comparación ──────────────────────────────────────────────────────────────

function Comparacion({ c }) {
  const { a, b } = c
  const [masDetalle, setMasDetalle] = useState(false)
  const notas = useNotas(a.id, b.id)
  const ind = clave => c.indicadores.find(i => i.clave === clave)
  const cajaFinal = ind('caja_final')
  const mejora = cajaFinal.dif >= 0

  return (
    <div className="space-y-6">
      <div className={`${CARD} p-5 sm:p-6`}>
        <h2 className="text-slate-900 font-bold text-base">
          {a.nombre} <span className="text-slate-300 mx-1">→</span> {b.nombre}
        </h2>
        <p className="text-slate-400 text-sm mt-0.5">
          Del {fmtFecha(a.fecha_corte)} al {fmtFecha(b.fecha_corte)}
          {c.diasEntreFotos > 0 ? ` (${c.diasEntreFotos} ${c.diasEntreFotos === 1 ? 'día' : 'días'} entre fotos)` : ' (mismo día)'}.
        </p>
        <p className="text-slate-700 text-sm mt-3">
          Al final del período proyectado, la caja pasó de <b>{fmtARS(cajaFinal.a)}</b> a <b>{fmtARS(cajaFinal.b)}</b>:{' '}
          <b className={mejora ? 'text-emerald-700' : 'text-rose-700'}>{Math.abs(cajaFinal.dif) < 0.005 ? 'no cambió' : `${mejora ? 'subió' : 'bajó'} ${fmtARS(Math.abs(cajaFinal.dif))}`}</b>.
        </p>
        <div className="grid gap-3 mt-4 sm:grid-cols-2 lg:grid-cols-4">
          <TarjetaCambio titulo="Caja del día de la foto" i={ind('caja_hoy')} />
          <TarjetaCambio titulo="Caja más baja" i={ind('caja_minima')} />
          <TarjetaCambio titulo="Caja al final" i={cajaFinal} />
          <TarjetaCambio titulo="Caja + FIMA al final" i={ind('total_final')} />
        </div>
      </div>

      {c.ventasEnNeto && <VentasEnNeto v={c.ventasEnNeto} />}

      <SeguimientoEsperado c={c} notas={notas} />
      <TablaCambios c={c} notas={notas} />

      <GraficoComparado c={c} />
      <TablaMensual c={c} />

      <div className="text-center">
        <button onClick={() => setMasDetalle(d => !d)} className="text-sm font-semibold text-cyan-700 hover:underline">
          {masDetalle ? 'Ocultar el detalle' : 'Ver más detalle (cuánto cambió lo pendiente y por obra)'}
        </button>
      </div>

      {masDetalle && (
        <>
          <div className={`${CARD} p-5 sm:p-6`}>
            <h2 className="text-slate-900 font-bold text-base">Cuánto cambió lo pendiente</h2>
            <div className="grid gap-4 mt-3 md:grid-cols-2">
              <ExplicacionTotal titulo="Pagos pendientes" e={c.egresos} etiquetaLesToco="ya les tocó pagar" tono="rose" />
              <ExplicacionTotal titulo="Cobros pendientes (neto)" e={c.ingresos} etiquetaLesToco="ya les tocó cobrar" tono="emerald" />
            </div>
            <p className="text-slate-400 text-xs mt-3">
              "Ya les tocó" es lo que estaba fechado entre ambas fotos. Los ajustes son todo lo que se agregó, subió, bajó o se sacó
              (por ejemplo, un presupuesto que se bajó o facturas nuevas que reemplazan lo proyectado).
            </p>
          </div>
          <TablaPorObra c={c} />
        </>
      )}
    </div>
  )
}

// Un número clave de la foto anterior a la nueva. En la caja, que suba es bueno (verde) y que baje es malo (rojo).
function TarjetaCambio({ titulo, i }) {
  const igual = Math.abs(i.dif) < 0.005
  return (
    <div className="rounded-xl border border-slate-100 p-3.5">
      <div className="text-xs font-semibold text-slate-500">{titulo}</div>
      <div className="flex items-baseline gap-2 flex-wrap mt-1">
        <span className="text-slate-400 text-xs tabular-nums">{fmtARS(i.a)}</span>
        <span className="text-slate-300 text-xs">→</span>
        <span className="text-base font-extrabold tabular-nums text-slate-900">{fmtARS(i.b)}</span>
      </div>
      <div className={`text-xs font-semibold tabular-nums mt-0.5 ${igual ? 'text-slate-400' : i.dif > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
        {igual ? 'Sin cambios' : fmtDif(i.dif)}
      </div>
    </div>
  )
}

// Las ventas pendientes en neto: de la factura se restan las retenciones y los impuestos del banco.
function VentasEnNeto({ v }) {
  const filas = [
    { etiqueta: 'Ventas pendientes (importe de las facturas)', a: v.a.bruto, b: v.b.bruto },
    { etiqueta: '− Retenciones estimadas de los clientes', a: -v.a.retenciones, b: -v.b.retenciones },
    { etiqueta: '− Impuestos del banco', a: -v.a.banco, b: -v.b.banco },
    { etiqueta: 'Neto que se espera que entre', a: v.a.neto, b: v.b.neto, fuerte: true },
  ]
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-5 sm:px-6 py-4 border-b border-slate-100">
        <h2 className="text-slate-900 font-bold text-base">Ventas en neto</h2>
        <p className="text-slate-400 text-sm mt-0.5">
          Los cobros de las dos fotos ya están descontados de retenciones e impuestos del banco: es lo que se espera que entre al banco.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="px-4 py-2 font-semibold"></th>
              <th className="px-4 py-2 font-semibold text-right">Foto anterior</th>
              <th className="px-4 py-2 font-semibold text-right">Foto nueva</th>
              <th className="px-4 py-2 font-semibold text-right">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.etiqueta} className={`border-b border-slate-50 last:border-0 ${f.fuerte ? 'bg-slate-50/60' : ''}`}>
                <td className={`px-4 py-2 ${f.fuerte ? 'font-bold text-slate-900' : 'text-slate-700'}`}>{f.etiqueta}</td>
                <Celda className={f.fuerte ? 'font-bold' : ''}>{fmtARS(f.a)}</Celda>
                <Celda className={f.fuerte ? 'font-bold' : ''}>{fmtARS(f.b)}</Celda>
                <Celda className={`font-semibold ${Math.abs(f.b - f.a) < 0.005 ? 'text-slate-400' : ''}`}>{fmtDif(redondear(f.b - f.a))}</Celda>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ExplicacionTotal({ titulo, e, etiquetaLesToco, tono }) {
  const dif = Math.round((e.final - e.inicial) * 100) / 100
  const color = tono === 'rose' ? 'text-rose-700' : 'text-emerald-700'
  return (
    <div className="rounded-xl border border-slate-100 p-4">
      <div className="text-xs font-semibold text-slate-500">{titulo}</div>
      <div className="flex items-baseline gap-2 flex-wrap mt-1">
        <span className="text-slate-500 text-sm tabular-nums">{fmtARS(e.inicial)}</span>
        <span className="text-slate-300">→</span>
        <span className={`text-lg font-extrabold tabular-nums ${color}`}>{fmtARS(e.final)}</span>
      </div>
      <div className="text-xs text-slate-500 mt-0.5 tabular-nums">Diferencia: {fmtDif(dif)}</div>
      <dl className="mt-3 space-y-1 text-xs">
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Estaba en la foto anterior</dt><dd className="tabular-nums">{fmtARS(e.inicial)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Menos lo que {etiquetaLesToco}</dt><dd className="tabular-nums">−{fmtARS(e.lesToco)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Ajustes (altas, bajas y cambios)</dt><dd className="tabular-nums">{fmtDif(e.ajustes)}</dd></div>
        <div className="flex justify-between gap-3 border-t border-slate-100 pt-1 font-semibold"><dt>Queda en la foto nueva</dt><dd className="tabular-nums">{fmtARS(e.final)}</dd></div>
      </dl>
    </div>
  )
}

function GraficoComparado({ c }) {
  const [cual, setCual] = useState('banco')
  const al = useMemo(() => alinearSeries(c.a, c.b, cual), [c, cual])
  return (
    <div className={`${CARD} p-5 sm:p-6`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-slate-900 font-bold text-base">Cómo cambió la curva de la caja</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Línea verde/roja: foto nueva. Línea violeta: foto anterior. Desde el {al.fechas.length ? fmtFecha(al.fechas[0]) : '—'}.
          </p>
        </div>
        <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden text-xs font-semibold">
          {[['banco', 'Caja'], ['total', 'Caja + FIMA']].map(([k, label]) => (
            <button key={k} onClick={() => setCual(k)}
              className={`px-3 py-1.5 ${cual === k ? 'bg-cyan-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3">
        <GraficoCashflow fechas={al.fechas} actual={al.b}
          extras={[{ id: 'foto-a', nombre: `Anterior · ${c.a.nombre}`, color: COLOR_FOTO_ANTERIOR, valores: al.a }]} />
      </div>
    </div>
  )
}

function Celda({ children, className = '' }) {
  return <td className={`px-4 py-2 text-right tabular-nums whitespace-nowrap ${className}`}>{children}</td>
}

function TablaMensual({ c }) {
  const [detalle, setDetalle] = useState(false)
  const meses = useMemo(() => {
    const m = new Map()
    for (const f of c.mensual) {
      const tipo = CONCEPTOS[f.concepto].tipo
      const r = m.get(f.mes) ?? { mes: f.mes, egA: 0, egB: 0, inA: 0, inB: 0, conceptos: [] }
      if (tipo === 'egreso') { r.egA += f.a; r.egB += f.b }
      if (tipo === 'ingreso') { r.inA += f.a; r.inB += f.b }
      r.conceptos.push(f)
      m.set(f.mes, r)
    }
    return [...m.values()]
  }, [c])

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-slate-900 font-bold text-base">Mes por mes</h2>
          <p className="text-slate-400 text-sm mt-0.5">Lo que se espera que entre (en neto) y que salga cada mes, en cada foto. Sin FIMA.</p>
        </div>
        <button onClick={() => setDetalle(d => !d)} className="text-xs font-semibold text-cyan-700 hover:underline">
          {detalle ? 'Ocultar detalle por concepto' : 'Ver detalle por concepto'}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="px-4 py-2 font-semibold">Mes</th>
              <th className="px-4 py-2 font-semibold text-right">Sale antes</th>
              <th className="px-4 py-2 font-semibold text-right">Sale ahora</th>
              <th className="px-4 py-2 font-semibold text-right">Dif.</th>
              <th className="px-4 py-2 font-semibold text-right">Entra antes</th>
              <th className="px-4 py-2 font-semibold text-right">Entra ahora</th>
              <th className="px-4 py-2 font-semibold text-right">Dif.</th>
            </tr>
          </thead>
          <tbody>
            {meses.map(m => (
              <MesFilas key={m.mes} m={m} dEg={Math.round((m.egB - m.egA) * 100) / 100} dIn={Math.round((m.inB - m.inA) * 100) / 100} detalle={detalle} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MesFilas({ m, dEg, dIn, detalle }) {
  const tenue = d => (Math.abs(d) < 0.005 ? 'text-slate-400' : '')
  return (
    <>
      <tr className="border-b border-slate-50">
        <td className="px-4 py-2 font-semibold text-slate-800">{fmtMes(m.mes)}</td>
        <Celda>{fmtARS(m.egA)}</Celda><Celda>{fmtARS(m.egB)}</Celda><Celda className={`font-semibold ${tenue(dEg)}`}>{fmtDif(dEg)}</Celda>
        <Celda>{fmtARS(m.inA)}</Celda><Celda>{fmtARS(m.inB)}</Celda><Celda className={`font-semibold ${tenue(dIn)}`}>{fmtDif(dIn)}</Celda>
      </tr>
      {detalle && m.conceptos.filter(f => CONCEPTOS[f.concepto].tipo !== 'fima').map(f => {
        const esEg = CONCEPTOS[f.concepto].tipo === 'egreso'
        return (
          <tr key={f.concepto} className="border-b border-slate-50 bg-slate-50/50 text-xs">
            <td className="pl-8 pr-4 py-1.5 text-slate-500">{CONCEPTOS[f.concepto].label}</td>
            {esEg ? <><Celda>{fmtARS(f.a)}</Celda><Celda>{fmtARS(f.b)}</Celda><Celda className={tenue(f.dif)}>{fmtDif(f.dif)}</Celda><td /><td /><td /></>
                  : <><td /><td /><td /><Celda>{fmtARS(f.a)}</Celda><Celda>{fmtARS(f.b)}</Celda><Celda className={tenue(f.dif)}>{fmtDif(f.dif)}</Celda></>}
          </tr>
        )
      })}
    </>
  )
}

function TablaPorObra({ c }) {
  const filas = useMemo(() => c.porObra
    .map(o => ({ ...o, dEg: Math.round((o.egresoB - o.egresoA) * 100) / 100, dIn: Math.round((o.ingresoB - o.ingresoA) * 100) / 100 }))
    .filter(o => Math.abs(o.dEg) >= 0.005 || Math.abs(o.dIn) >= 0.005)
    .sort((x, y) => Math.abs(y.dEg) + Math.abs(y.dIn) - Math.abs(x.dEg) - Math.abs(x.dIn)), [c])

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-5 sm:px-6 py-4 border-b border-slate-100">
        <h2 className="text-slate-900 font-bold text-base">Por obra</h2>
        <p className="text-slate-400 text-sm mt-0.5">
          Total pendiente de cada obra en cada foto; solo las obras que cambiaron.
          La foto anterior incluye lo que después "les tocó", así que parte de la baja es simplemente tiempo que pasó.
        </p>
      </div>
      {filas.length === 0 ? (
        <p className="px-5 sm:px-6 py-4 text-sm text-slate-400">Ninguna obra cambió.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="px-4 py-2 font-semibold">Obra</th>
                <th className="px-4 py-2 font-semibold text-right">Sale antes</th>
                <th className="px-4 py-2 font-semibold text-right">Sale ahora</th>
                <th className="px-4 py-2 font-semibold text-right">Dif.</th>
                <th className="px-4 py-2 font-semibold text-right">Entra antes</th>
                <th className="px-4 py-2 font-semibold text-right">Entra ahora</th>
                <th className="px-4 py-2 font-semibold text-right">Dif.</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(o => (
                <tr key={o.obra} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2 font-semibold text-slate-800">{o.obra}</td>
                  <Celda>{fmtARS(o.egresoA)}</Celda><Celda>{fmtARS(o.egresoB)}</Celda>
                  <Celda className={`font-semibold ${Math.abs(o.dEg) < 0.005 ? 'text-slate-400' : ''}`}>{fmtDif(o.dEg)}</Celda>
                  <Celda>{fmtARS(o.ingresoA)}</Celda><Celda>{fmtARS(o.ingresoB)}</Celda>
                  <Celda className={`font-semibold ${Math.abs(o.dIn) < 0.005 ? 'text-slate-400' : ''}`}>{fmtDif(o.dIn)}</Celda>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Notas a mano sobre cada diferencia (tabla snapshots_notas) ───────────────────────────────

// Las notas de ESTA comparación (foto anterior + foto nueva): clave de la diferencia -> { id, texto }.
function useNotas(idA, idB) {
  const [mapa, setMapa] = useState(() => new Map())
  const [disponible, setDisponible] = useState(true)

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from('snapshots_notas').select('id, clave, texto').eq('foto_a', idA).eq('foto_b', idB)
    if (e) { setDisponible(false); setMapa(new Map()); return }
    setDisponible(true)
    setMapa(new Map((data ?? []).map(n => [n.clave, n])))
  }, [idA, idB])
  useEffect(() => { cargar() }, [cargar])

  // Devuelve un texto de error, o null si salió bien. Un texto vacío borra la nota.
  const guardar = useCallback(async (clave, texto) => {
    const t = texto.trim()
    const res = t
      ? await supabase.from('snapshots_notas').upsert({ foto_a: idA, foto_b: idB, clave, texto: t }, { onConflict: 'foto_a,foto_b,clave' })
      : await supabase.from('snapshots_notas').delete().eq('foto_a', idA).eq('foto_b', idB).eq('clave', clave)
    if (res.error) return 'No se pudo guardar la nota. Probá de nuevo.'
    await cargar()
    return null
  }, [idA, idB, cargar])

  return { mapa, disponible, guardar }
}

// Nota de una diferencia: muestra la que hay, o un link para agregar una.
function NotaDe({ clave, notas }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  if (!notas.disponible) return null
  const actual = notas.mapa.get(clave)

  async function guardar() {
    setGuardando(true); setError('')
    const e = await notas.guardar(clave, texto)
    setGuardando(false)
    if (e) setError(e); else setEditando(false)
  }

  if (editando) {
    return (
      <div className="mt-1.5 space-y-1">
        <input value={texto} onChange={e => setTexto(e.target.value)} maxLength={300} autoFocus placeholder="Por qué pasó (ej.: NEC pagó tarde)"
          onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') setEditando(false) }}
          className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-600/30" />
        <div className="flex items-center gap-3 text-xs">
          <button onClick={guardar} disabled={guardando} className="font-semibold text-white px-2.5 py-1 rounded-lg disabled:opacity-50" style={{ backgroundColor: '#0e7490' }}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          <button onClick={() => { setEditando(false); setError('') }} className="font-semibold text-slate-500 hover:text-slate-800">Cancelar</button>
          {actual && <span className="text-slate-400">Dejá vacío para borrar la nota.</span>}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    )
  }
  if (actual) {
    return (
      <div className="mt-1.5 text-xs text-slate-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
        <span className="font-semibold">Nota:</span> {actual.texto}{' '}
        <button onClick={() => { setTexto(actual.texto); setEditando(true) }} className="font-semibold text-cyan-700 hover:underline">Editar</button>
      </div>
    )
  }
  return <button onClick={() => { setTexto(''); setEditando(true) }} className="mt-1 text-[11px] font-semibold text-cyan-700 hover:underline">+ Agregar nota</button>
}

// ─── Qué pasó con lo que se esperaba entre las dos fotos ─────────────────────────────────────────

const RESULTADOS = {
  cumplido:          { label: 'Se cumplió',               clase: 'bg-emerald-50 text-emerald-700' },
  cumplido_distinto: { label: 'Otro importe',             clase: 'bg-amber-50 text-amber-700' },
  no_cumplido:       { label: 'Venció y no se cumplió',   clase: 'bg-rose-50 text-rose-700' },
  reprogramado:      { label: 'Se corrió de fecha',       clase: 'bg-sky-50 text-sky-700' },
  no_cumple:         { label: 'Marcada "no se cumple"',   clase: 'bg-slate-100 text-slate-600' },
  sin_dato:          { label: 'Sin dato',                 clase: 'bg-slate-100 text-slate-500' },
}
const FALLAN = ['no_cumplido', 'cumplido_distinto', 'reprogramado', 'no_cumple', 'sin_dato'] // lo que no salió como se esperaba
const LIMITE_ESPERADO = 10

function SeguimientoEsperado({ c, notas }) {
  const { a, b } = c
  const ids = useMemo(() => idsParaConsultar(a, b), [a, b])
  const [estados, setEstados] = useState(null) // null = consultando
  const [errorEst, setErrorEst] = useState('')
  const [verTodas, setVerTodas] = useState(false)

  // Cómo está hoy cada factura que se esperaba entre las dos fotos (en tandas, por el largo del pedido).
  useEffect(() => {
    let vivo = true
    setEstados(null); setErrorEst('')
    async function consultar() {
      const mapa = new Map()
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error: e } = await supabase.from('movimientos').select('id, estado, estado_proyeccion, fecha_pago, monto_bruto, monto_neto').in('id', ids.slice(i, i + 100))
        if (e) { if (vivo) { setErrorEst('No se pudo ver cómo quedó cada factura.'); setEstados(new Map()) } return }
        ;(data ?? []).forEach(m => mapa.set(String(m.id), {
          estado: m.estado, estado_proyeccion: m.estado_proyeccion, fecha_pago: m.fecha_pago,
          monto: Number(m.estado === 'ejecutado' ? (m.monto_neto ?? m.monto_bruto ?? 0) : (m.monto_bruto ?? 0)),
        }))
      }
      if (vivo) setEstados(mapa)
    }
    consultar()
    return () => { vivo = false }
  }, [ids])

  const seg = useMemo(() => (estados ? seguimientoDeLoEsperado(a, b, estados) : null), [a, b, estados])
  const falladas = useMemo(() => (seg ? seg.lineas.filter(l => FALLAN.includes(l.resultado)).sort((x, y) => Math.abs(y.esperado) - Math.abs(x.esperado)) : []), [seg])
  const visibles = verTodas ? falladas : falladas.slice(0, LIMITE_ESPERADO)

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-5 sm:px-6 py-4 border-b border-slate-100">
        <h2 className="text-slate-900 font-bold text-base">Qué pasó con lo que esperábamos</h2>
        <p className="text-slate-400 text-sm mt-0.5">
          Facturas registradas que se esperaba cobrar o pagar entre el {fmtFecha(a.fecha_corte)} y el {fmtFecha(b.fecha_corte)}, y cómo están hoy.
          El gasto proyectado que se mueve solo entre fechas no entra acá.
        </p>
      </div>
      {estados === null && <p className="px-5 sm:px-6 py-4 text-sm text-slate-400">Viendo cómo quedó cada una…</p>}
      {errorEst && <p className="px-5 sm:px-6 py-3 text-sm text-red-600">{errorEst}</p>}
      {seg && seg.cantidad === 0 && <p className="px-5 sm:px-6 py-4 text-sm text-slate-400">No había facturas registradas con fecha entre las dos fotos.</p>}
      {seg && seg.cantidad > 0 && (
        <>
          <div className="px-5 sm:px-6 py-4 grid gap-3 grid-cols-2 lg:grid-cols-6">
            {Object.keys(RESULTADOS).map(k => {
              const t = seg.totales[k]
              return (
                <div key={k} className={`rounded-xl border border-slate-100 p-3 ${t ? '' : 'opacity-50'}`}>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${RESULTADOS[k].clase}`}>{RESULTADOS[k].label}</span>
                  <div className="text-lg font-extrabold tabular-nums text-slate-900 mt-1.5">{t?.cantidad ?? 0}</div>
                  <div className="text-[11px] text-slate-400 tabular-nums">{t ? `esperado ${fmtARS(t.esperado)}` : '—'}</div>
                </div>
              )
            })}
          </div>
          {falladas.length === 0 ? (
            <p className="px-5 sm:px-6 pb-4 text-sm text-emerald-700 font-semibold">Todo lo que se esperaba se cumplió como estaba previsto.</p>
          ) : (
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="px-4 py-2 font-semibold">Qué pasó</th>
                    <th className="px-4 py-2 font-semibold">Línea</th>
                    <th className="px-4 py-2 font-semibold">Obra</th>
                    <th className="px-4 py-2 font-semibold text-right">Se esperaba</th>
                    <th className="px-4 py-2 font-semibold text-right">Pasó</th>
                    <th className="px-4 py-2 font-semibold">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(l => (
                    <tr key={l.clave} className="border-b border-slate-50 last:border-0 align-top">
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${RESULTADOS[l.resultado].clase}`}>{RESULTADOS[l.resultado].label}</span>
                      </td>
                      <td className="px-4 py-2 min-w-[16rem]">
                        <div className="text-slate-800">{l.etiqueta || CONCEPTOS[l.concepto].label}{l.factura ? <span className="text-slate-400"> · FC {l.factura}</span> : null}</div>
                        <div className="text-xs text-slate-500">{l.motivo}</div>
                        <NotaDe clave={l.clave} notas={notas} />
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-slate-600">{l.obra || '—'}</td>
                      <Celda>{fmtARS(l.esperado)}</Celda>
                      <Celda>{l.real != null ? fmtARS(l.real) : '—'}{l.real != null && Math.abs(l.dif) >= 0.005 && <div className={`text-[11px] font-semibold ${l.dif < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{fmtDif(l.dif)}</div>}</Celda>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-500">
                        {fmtFecha(l.fechaEsperada)}{l.resultado === 'reprogramado' && l.fechaReal ? ` → ${fmtFecha(l.fechaReal)}` : ''}
                        {l.resultado === 'no_cumplido' && l.diasAtraso > 0 && <div className="text-rose-600 font-semibold">{l.diasAtraso} {l.diasAtraso === 1 ? 'día' : 'días'} de atraso</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {falladas.length > LIMITE_ESPERADO && (
            <div className="px-5 sm:px-6 py-3 border-t border-slate-100">
              <button onClick={() => setVerTodas(v => !v)} className="text-xs font-semibold text-cyan-700 hover:underline">
                {verTodas ? 'Ver solo las más grandes' : `Ver todas (${falladas.length})`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Qué cambió y por qué ─────────────────────────────────────────────────────────────────────────

const LIMITE_CAMBIOS = 10
const MINIMO_CAMBIO = 1_000_000 // lo que cambió en menos de esto se junta en "otros cambios menores"
const pesoDe = x => (x.clase === 'fecha' ? Math.max(x.a, x.b) : Math.abs(x.dif)) // un cambio de fecha pesa por el monto que se movió

function FilaCambio({ x, notas }) {
  return (
    <tr className="border-b border-slate-50 last:border-0 align-top">
      <td className="px-4 py-2 whitespace-nowrap">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${CLASES_CAMBIO[x.clase].clase}`}>{CLASES_CAMBIO[x.clase].label}</span>
      </td>
      <td className="px-4 py-2 min-w-[16rem]">
        <div className="text-slate-800">{x.etiqueta || CONCEPTOS[x.concepto].label}</div>
        <div className="text-[11px] text-slate-400">
          {CONCEPTOS[x.concepto].label}{x.rubro ? ` · ${x.rubro}` : ''}{x.periodo ? ` · ${fmtMes(x.periodo.slice(0, 7))}` : ''}{x.factura ? ` · FC ${x.factura}` : ''}
        </div>
        {x.motivo && <div className="text-xs text-slate-600 mt-0.5">{x.motivo}</div>}
        <NotaDe clave={x.clave} notas={notas} />
      </td>
      <td className="px-4 py-2 whitespace-nowrap text-slate-600">{x.obra || '—'}</td>
      <Celda>{fmtARS(x.a)}</Celda><Celda>{fmtARS(x.b)}</Celda>
      <Celda className={`font-semibold ${Math.abs(x.dif) < 0.005 ? 'text-slate-400' : ''}`}>{x.clase === 'fecha' ? '—' : fmtDif(x.dif)}</Celda>
      <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-500">
        {x.fechaA || x.fechaB ? `${x.fechaA ? fmtFecha(x.fechaA) : '—'} → ${x.fechaB ? fmtFecha(x.fechaB) : '—'}` : ''}
      </td>
    </tr>
  )
}

function TablaCambios({ c, notas }) {
  const [verTodos, setVerTodos] = useState(false)
  const [verMenores, setVerMenores] = useState(false)
  const [clase, setClase] = useState('')
  const filtrados = useMemo(() => c.cambios.filter(x => !clase || x.clase === clase), [c, clase])
  const grandes = useMemo(() => filtrados.filter(x => pesoDe(x) >= MINIMO_CAMBIO), [filtrados])
  const menores = useMemo(() => filtrados.filter(x => pesoDe(x) < MINIMO_CAMBIO), [filtrados])
  const visibles = verTodos ? grandes : grandes.slice(0, LIMITE_CAMBIOS)
  const presentes = [...new Set(c.cambios.map(x => x.clase))]
  const totalMenores = Math.round(menores.reduce((s, x) => s + (x.clase === 'fecha' ? 0 : x.dif), 0) * 100) / 100

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-slate-900 font-bold text-base">Qué cambió y por qué</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Las diferencias más grandes entre las dos fotos, con el posible porqué. Podés escribir tu propia explicación en cada una.
            Un gasto proyectado que solo se movió de fecha no figura: se compara por su total.
          </p>
          {!notas.disponible && <p className="text-amber-700 text-xs mt-1">Para poder escribir notas hay que correr el script sql/snapshots_notas.sql.</p>}
        </div>
        <select value={clase} onChange={e => { setClase(e.target.value); setVerTodos(false) }}
          className="text-xs rounded-lg border border-slate-200 px-2 py-1.5 bg-white">
          <option value="">Todos los cambios ({c.cambios.length})</option>
          {presentes.map(k => <option key={k} value={k}>{CLASES_CAMBIO[k].label} ({c.cambios.filter(x => x.clase === k).length})</option>)}
        </select>
      </div>
      {filtrados.length === 0 ? (
        <p className="px-5 sm:px-6 py-4 text-sm text-slate-400">No hay cambios.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="px-4 py-2 font-semibold">Cambio</th>
                <th className="px-4 py-2 font-semibold">Línea y porqué</th>
                <th className="px-4 py-2 font-semibold">Obra</th>
                <th className="px-4 py-2 font-semibold text-right">Antes</th>
                <th className="px-4 py-2 font-semibold text-right">Ahora</th>
                <th className="px-4 py-2 font-semibold text-right">Dif.</th>
                <th className="px-4 py-2 font-semibold">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(x => <FilaCambio key={x.clave} x={x} notas={notas} />)}
              {grandes.length === 0 && <tr><td colSpan={7} className="px-4 py-3 text-sm text-slate-400">No hay diferencias de {fmtARS(MINIMO_CAMBIO)} o más.</td></tr>}
              {verMenores && menores.map(x => <FilaCambio key={x.clave} x={x} notas={notas} />)}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-5 sm:px-6 py-3 border-t border-slate-100 flex items-center gap-5 flex-wrap">
        {grandes.length > LIMITE_CAMBIOS && (
          <button onClick={() => setVerTodos(v => !v)} className="text-xs font-semibold text-cyan-700 hover:underline">
            {verTodos ? 'Ver solo las 10 más grandes' : `Ver todas las grandes (${grandes.length})`}
          </button>
        )}
        {menores.length > 0 && (
          <button onClick={() => setVerMenores(v => !v)} className="text-xs font-semibold text-slate-500 hover:underline">
            {verMenores ? 'Ocultar los cambios menores' : `Otros cambios menores (${menores.length}, de menos de ${fmtARS(MINIMO_CAMBIO)} cada uno${totalMenores ? `: suman ${fmtDif(totalMenores)}` : ''})`}
          </button>
        )}
      </div>
    </div>
  )
}
