// components/HistorialProyecciones.jsx
// Historial de proyecciones ("fotos"): guarda cómo está la proyección de caja hoy y compara
// dos fotos entre sí (la idea es una foto cada 2 semanas).
//
// - "Guardar foto" es SIEMPRE manual (un botón). No hay nada automático.
// - Solo lo ven y lo usan el rol Directorio y Santiago Verdinelli (ver lib/permisos.js).
//   La restricción real está en sql/snapshots_proyeccion.sql (políticas de la tabla).
// - Una foto guardada no se edita ni se borra.
// Se usa en el Directorio (pestaña "Historial de proyecciones") y en Finanzas (/finanzas/historial-proyecciones).

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import useCajaBase from '../lib/useCajaBase'
import { puedeGuardarSnapshots } from '../lib/permisos'
import { armarSnapshot, compararSnapshots, alinearSeries, CONCEPTOS } from '../lib/snapshots'
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

function diasDesde(isoFecha) {
  return Math.round((new Date(hoyISO() + 'T00:00:00') - new Date(isoFecha + 'T00:00:00')) / 86400000)
}

export default function HistorialProyecciones() {
  const { user, perfil } = useAuth()
  const permitido = puedeGuardarSnapshots(user, perfil)

  if (!permitido) {
    return (
      <div className={`${CARD} p-6 text-sm text-slate-500`}>
        El historial de proyecciones es solo para el Directorio y Santiago Verdinelli.
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
        <p className="font-semibold text-slate-800 mb-1">Falta crear la tabla del historial.</p>
        <p>Hay que correr una vez el script <code className="bg-slate-100 px-1 rounded">sql/snapshots_proyeccion.sql</code> en Supabase.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <GuardarFoto base={base} resultado={resultado} cargando={cargando} error={error} perfil={perfil}
        lista={lista} onGuardada={cargarLista} />
      {errorLista && <p className="text-red-600 text-sm">{errorLista}</p>}
      <ListaYComparador lista={lista} />
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
          <h2 className="text-slate-900 font-bold text-base">Guardar foto de la proyección</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Congela la proyección tal como está hoy ({fmtFecha(hoy)}) para poder compararla más adelante. Se guarda solo al tocar el botón.
            Una foto guardada no se puede editar ni borrar.
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

// ─── Lista y comparador ───────────────────────────────────────────────────────

function ListaYComparador({ lista }) {
  const [idA, setIdA] = useState(null)
  const [idB, setIdB] = useState(null)
  const [completas, setCompletas] = useState(null) // { a, b } con todo el contenido
  const [errorComp, setErrorComp] = useState('')
  const [cargandoComp, setCargandoComp] = useState(false)

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
  }, [idA, idB])

  const comparacion = useMemo(() => (completas ? compararSnapshots(completas.a, completas.b) : null), [completas])

  if (lista === null) return <p className="text-slate-400 text-sm">Cargando historial…</p>
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
            Elegí cuál es la foto anterior (A) y cuál la más nueva (B) para compararlas.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="px-4 py-2 font-semibold w-16 text-center">A</th>
                <th className="px-4 py-2 font-semibold w-16 text-center">B</th>
                <th className="px-4 py-2 font-semibold">Foto</th>
                <th className="px-4 py-2 font-semibold text-right">Caja ese día</th>
                <th className="px-4 py-2 font-semibold text-right">Egresos pendientes</th>
                <th className="px-4 py-2 font-semibold text-right">Ingresos pendientes</th>
                <th className="px-4 py-2 font-semibold text-right">Caja más baja</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(f => (
                <tr key={f.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 text-center">
                    <input type="radio" name="foto-a" checked={idA === f.id} onChange={() => setIdA(f.id)} aria-label={`Foto A: ${f.nombre}`} />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <input type="radio" name="foto-b" checked={idB === f.id} onChange={() => setIdB(f.id)} aria-label={`Foto B: ${f.nombre}`} />
                  </td>
                  <td className="px-4 py-2.5 min-w-[14rem]">
                    <div className="font-semibold text-slate-800">{f.nombre}</div>
                    <div className="text-xs text-slate-400">
                      {fmtFecha(f.fecha_corte)} · guardada {fmtCreada(f.created_at)}{f.creado_por ? ` por ${f.creado_por}` : ''}
                    </div>
                    {f.nota && <div className="text-xs text-slate-500 mt-0.5">{f.nota}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtARS(f.resumen?.caja_hoy)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtARS(f.resumen?.egresos_pendientes)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtARS(f.resumen?.ingresos_pendientes)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {fmtARS(f.resumen?.caja_minima?.valor)}
                    <div className="text-[11px] text-slate-400">{f.resumen?.caja_minima?.fecha ? fmtFecha(f.resumen.caja_minima.fecha) : ''}</div>
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
      {lista.length >= 2 && idA === idB && idA && (
        <p className="text-amber-700 text-sm">Elegiste la misma foto en A y en B. Elegí dos distintas.</p>
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
        <div className="grid gap-4 mt-4 md:grid-cols-2">
          <ExplicacionTotal titulo="Egresos pendientes" e={c.egresos} etiquetaLesToco="ya les tocó pagar" tono="rose" />
          <ExplicacionTotal titulo="Ingresos pendientes" e={c.ingresos} etiquetaLesToco="ya les tocó cobrar" tono="emerald" />
        </div>
        <p className="text-slate-400 text-xs mt-3">
          "Ya les tocó" es lo que estaba fechado entre ambas fotos. Los ajustes son todo lo que se agregó, subió, bajó o se sacó
          (por ejemplo, un presupuesto que se bajó o facturas nuevas que reemplazan lo proyectado).
        </p>
      </div>

      <GraficoComparado c={c} />
      <TablaIndicadores c={c} />
      <TablaMensual c={c} />
      <TablaPorObra c={c} />
      <TablaCambios c={c} />
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
          <h2 className="text-slate-900 font-bold text-base">Cómo cambió la curva</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Línea verde/roja: foto nueva (B). Línea violeta: foto anterior (A). Desde el {al.fechas.length ? fmtFecha(al.fechas[0]) : '—'}.
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
          extras={[{ id: 'foto-a', nombre: `A · ${c.a.nombre}`, color: COLOR_FOTO_ANTERIOR, valores: al.a }]} />
      </div>
    </div>
  )
}

function Celda({ children, className = '' }) {
  return <td className={`px-4 py-2 text-right tabular-nums whitespace-nowrap ${className}`}>{children}</td>
}

function TablaIndicadores({ c }) {
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-5 sm:px-6 py-4 border-b border-slate-100">
        <h2 className="text-slate-900 font-bold text-base">Números clave</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="px-4 py-2 font-semibold">Indicador</th>
              <th className="px-4 py-2 font-semibold text-right">Foto A</th>
              <th className="px-4 py-2 font-semibold text-right">Foto B</th>
              <th className="px-4 py-2 font-semibold text-right">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {c.indicadores.map(i => (
              <tr key={i.clave} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2 text-slate-700">{i.label}</td>
                <Celda>{fmtARS(i.a)}</Celda>
                <Celda>{fmtARS(i.b)}</Celda>
                <Celda className={`font-semibold ${Math.abs(i.dif) < 0.005 ? 'text-slate-400' : ''}`}>{fmtDif(i.dif)}</Celda>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
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
          <h2 className="text-slate-900 font-bold text-base">Por mes</h2>
          <p className="text-slate-400 text-sm mt-0.5">Lo pendiente de cada mes en cada foto (sin FIMA).</p>
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
              <th className="px-4 py-2 font-semibold text-right">Egresos A</th>
              <th className="px-4 py-2 font-semibold text-right">Egresos B</th>
              <th className="px-4 py-2 font-semibold text-right">Dif.</th>
              <th className="px-4 py-2 font-semibold text-right">Ingresos A</th>
              <th className="px-4 py-2 font-semibold text-right">Ingresos B</th>
              <th className="px-4 py-2 font-semibold text-right">Dif.</th>
            </tr>
          </thead>
          <tbody>
            {meses.map(m => {
              const dEg = Math.round((m.egB - m.egA) * 100) / 100
              const dIn = Math.round((m.inB - m.inA) * 100) / 100
              return (
                <MesFilas key={m.mes} m={m} dEg={dEg} dIn={dIn} detalle={detalle} />
              )
            })}
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
          La foto A incluye lo que después "les tocó", así que parte de la baja es simplemente tiempo que pasó.
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
                <th className="px-4 py-2 font-semibold text-right">Egresos A</th>
                <th className="px-4 py-2 font-semibold text-right">Egresos B</th>
                <th className="px-4 py-2 font-semibold text-right">Dif.</th>
                <th className="px-4 py-2 font-semibold text-right">Ingresos A</th>
                <th className="px-4 py-2 font-semibold text-right">Ingresos B</th>
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

const LIMITE_CAMBIOS = 40

function TablaCambios({ c }) {
  const [verTodos, setVerTodos] = useState(false)
  const [clase, setClase] = useState('')
  const filtrados = useMemo(() => c.cambios.filter(x => !clase || x.clase === clase), [c, clase])
  const visibles = verTodos ? filtrados : filtrados.slice(0, LIMITE_CAMBIOS)
  const presentes = [...new Set(c.cambios.map(x => x.clase))]

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-slate-900 font-bold text-base">Qué cambió, línea por línea</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Ordenado por el monto que cambió. Las líneas proyectadas se comparan sumadas por obra, rubro y período.
          </p>
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
                <th className="px-4 py-2 font-semibold">Línea</th>
                <th className="px-4 py-2 font-semibold">Obra</th>
                <th className="px-4 py-2 font-semibold text-right">Antes</th>
                <th className="px-4 py-2 font-semibold text-right">Ahora</th>
                <th className="px-4 py-2 font-semibold text-right">Dif.</th>
                <th className="px-4 py-2 font-semibold">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((x, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0 align-top">
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${CLASES_CAMBIO[x.clase].clase}`}>{CLASES_CAMBIO[x.clase].label}</span>
                  </td>
                  <td className="px-4 py-2 min-w-[14rem]">
                    <div className="text-slate-800">{x.etiqueta || CONCEPTOS[x.concepto].label}</div>
                    <div className="text-[11px] text-slate-400">
                      {CONCEPTOS[x.concepto].label}{x.rubro ? ` · ${x.rubro}` : ''}{x.periodo ? ` · ${fmtMes(x.periodo.slice(0, 7))}` : ''}{x.factura ? ` · FC ${x.factura}` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-600">{x.obra || '—'}</td>
                  <Celda>{fmtARS(x.a)}</Celda><Celda>{fmtARS(x.b)}</Celda>
                  <Celda className={`font-semibold ${Math.abs(x.dif) < 0.005 ? 'text-slate-400' : ''}`}>{x.clase === 'fecha' ? '—' : fmtDif(x.dif)}</Celda>
                  <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-500">
                    {x.fechaA || x.fechaB ? `${x.fechaA ? fmtFecha(x.fechaA) : '—'} → ${x.fechaB ? fmtFecha(x.fechaB) : '—'}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filtrados.length > LIMITE_CAMBIOS && (
        <div className="px-5 sm:px-6 py-3 border-t border-slate-100">
          <button onClick={() => setVerTodos(v => !v)} className="text-xs font-semibold text-cyan-700 hover:underline">
            {verTodos ? 'Ver solo los mayores' : `Ver todos (${filtrados.length})`}
          </button>
        </div>
      )}
    </div>
  )
}
