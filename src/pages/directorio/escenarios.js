// pages/directorio/escenarios.js
// Motor de escenarios del Directorio (simulación sobre el gráfico de Cash Flow).
//
// ES UNA SIMULACIÓN INDEPENDIENTE: lee los datos reales pero NUNCA escribe nada
// en la base. Los escenarios viven solo en este navegador (localStorage) y no
// afectan el cashflow real, las proyecciones de Finanzas, los movimientos ni el
// saldo real de ningún fondo.
//
// Los escenarios se guardan en la tabla escenarios_directorio (cada usuario ve solo
// los suyos) para que no se pierdan al cerrar la app o cambiar de dispositivo. Si la
// tabla no existe o no hay conexión, quedan guardados en este navegador.
//
// Un escenario es un conjunto de cambios sobre la proyección real:
//   cambios: { [movimientoId]: { accion: 'no_cumple' } | { accion: 'modificar', fecha?, monto? } }
//   nuevos:  [{ id, tipo: 'inversion' | 'rescate', fondoId, monto, fecha }]   (movimientos FIMA agregados)

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import { construirLedgerFima, normalizarFondos, perteneceAlFondo, saldoInicialDe } from '../../lib/fimaLedger'

export const DIAS_MAX = 365
const STORAGE_KEY = 'psdata_directorio_escenarios_v2'
const MIGRADO_KEY = 'psdata_directorio_escenarios_migrado_v2'
export const COLORES_ESCENARIO = ['#6366f1', '#f59e0b', '#0ea5e9', '#ec4899', '#14b8a6', '#a855f7']

// ─── Fechas y montos ──────────────────────────────────────────────────────────

export function isoDe(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function sumarDias(iso, n) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return isoDe(d)
}

// Acepta "30.000.000", "30000000", "30M" o "1,5M". El punto es separador de miles.
export function parseMonto(texto) {
  let t = String(texto ?? '').trim().replace(/\$/g, '').replace(/\s/g, '')
  if (!t) return NaN
  let mult = 1
  if (/m$/i.test(t)) { mult = 1e6; t = t.slice(0, -1) }
  t = t.replace(/\./g, '').replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? n * mult : NaN
}

export function nuevoId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const claveFondo = fondo => fondo.id ?? 'por-defecto'

// Efecto sobre el BANCO de un movimiento. En FIMA, lo que sale del banco entra al fondo y al revés.
const efectoMov = (tipo, monto) => (tipo === 'ingreso' ? monto : -monto)
const efectoNuevo = (tipo, monto) => (tipo === 'inversion' ? -monto : monto)

// ─── Datos de FIMA (solo lectura) ─────────────────────────────────────────────

export function useFimaDatos() {
  const [datos, setDatos] = useState({ fondos: [], saldos: [], rendimientos: [], cargado: false })
  useEffect(() => {
    let vivo = true
    async function cargar() {
      // select('*'): tablas/columnas de fondos son nuevas; si faltaran, no se corta la pantalla.
      const [{ data: f, error: e1 }, { data: s, error: e2 }, { data: r, error: e3 }] = await Promise.all([
        supabase.from('fondos_inversion').select('*').order('created_at', { ascending: true }),
        supabase.from('fima_saldo_inicial').select('*')
          .order('fecha', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('fima_rendimientos').select('*')
          .order('fecha', { ascending: true }).order('created_at', { ascending: true }),
      ])
      if (!vivo) return
      setDatos({ fondos: e1 ? [] : (f ?? []), saldos: e2 ? [] : (s ?? []), rendimientos: e3 ? [] : (r ?? []), cargado: true })
    }
    cargar()
    return () => { vivo = false }
  }, [])
  return datos
}

// Nombre legible de un movimiento (las filas virtuales no tienen proveedor).
function etiquetaDe(m) {
  if (m.categoria === 'gasto_proyectado') return `${m.rubros?.nombre ?? 'Rubro'} — saldo sin facturar`
  if (m.categoria === 'venta_proyectada') {
    const mes = m.periodo ? new Date(m.periodo + 'T00:00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }) : ''
    return `Venta proyectada de ${mes}`
  }
  return m.proveedor_cliente ?? m.concepto ?? ''
}

// ─── Serie base (lo real) ─────────────────────────────────────────────────────

// movimientos: los combinados (reales + virtuales) con `saldoAcumulado`, en orden de fecha.
// Devuelve la caja por día y el saldo de cada fondo por día (hoy .. hoy + DIAS_MAX),
// y un índice de los movimientos que todavía no ocurrieron y mueven la caja.
export function construirBase({ hoy, movimientos, sumaBase, fondos, saldosFima, rendimientos }) {
  const fechas = Array.from({ length: DIAS_MAX + 1 }, (_, i) => sumarDias(hoy, i))

  const banco = []
  {
    let p = 0, ultimo = sumaBase
    for (const f of fechas) {
      while (p < movimientos.length && movimientos[p].fecha_pago && movimientos[p].fecha_pago <= f) {
        ultimo = movimientos[p].saldoAcumulado; p++
      }
      banco.push(ultimo)
    }
  }

  const fondosLista = normalizarFondos(fondos)
  const movsFima = movimientos.filter(m => m.categoria === 'fima')
  const fondosSerie = {}
  const sinSaldoInicial = []
  fondosLista.forEach(fondo => {
    const saldoIni = saldoInicialDe(saldosFima, fondo, fondosLista)
    if (!saldoIni) sinSaldoInicial.push(fondo.nombre)
    const monto = Number(saldoIni?.monto ?? 0)
    const ledger = construirLedgerFima({
      movimientos: movsFima.filter(m => perteneceAlFondo(m, fondo, fondosLista)),
      rendimientos: rendimientos.filter(r => perteneceAlFondo(r, fondo, fondosLista)),
      saldoInicialMonto: monto,
      saldoInicialFecha: saldoIni?.fecha ?? null,
    })
    const serie = []
    let p = 0, ultimo = monto
    for (const f of fechas) {
      while (p < ledger.length && ledger[p].fecha_pago && ledger[p].fecha_pago <= f) { ultimo = ledger[p].saldoFima; p++ }
      serie.push(ultimo)
    }
    fondosSerie[claveFondo(fondo)] = serie
  })

  // Movimientos simulables: todavía no ocurrieron y hoy mueven la caja.
  const indice = new Map()
  const porFecha = new Map()
  for (const m of movimientos) {
    if (!m.fecha_pago || m.fecha_pago < hoy) continue
    if (m.estado_proyeccion === 'no_cumple' || m._afectaCashflow === false) continue
    const esFima = m.categoria === 'fima'
    const fondo = esFima ? (fondosLista.find(f => perteneceAlFondo(m, f, fondosLista)) ?? fondosLista[0]) : null
    const item = {
      id: m.id, fecha: m.fecha_pago, tipo: m.tipo, monto: Number(m.montoEfectivo),
      categoria: m.categoria, esFima, fondoId: fondo ? claveFondo(fondo) : null,
      virtual: !!m._virtual,
      etiqueta: etiquetaDe(m),
      numeroFactura: m.numero_factura ?? '',
      obra: m.obras?.codigo ?? '',
      rubro: m.rubros?.nombre ?? '',
      periodo: m.periodo ?? null,
    }
    indice.set(m.id, item)
    if (!porFecha.has(item.fecha)) porFecha.set(item.fecha, [])
    porFecha.get(item.fecha).push(item)
  }

  return {
    fechas, banco, fondos: fondosSerie, fondoIds: fondosLista.map(claveFondo),
    fondosLista, sinSaldoInicial, indice, porFecha,
  }
}

// ─── Simulación (cálculo puro) ────────────────────────────────────────────────

// Aplica los cambios de un escenario sobre la base. Devuelve, por día: banco,
// fima (todos los fondos), total y el saldo de cada fondo.
export function simular(base, escenario) {
  const { fechas, fondoIds } = base
  const n = fechas.length
  const idx = new Map(fechas.map((f, i) => [f, i]))

  const deltaBanco = new Array(n).fill(0)
  const deltaFondo = {}
  fondoIds.forEach(id => { deltaFondo[id] = new Array(n).fill(0) })

  // `banco` es lo que cambia en el banco; si el movimiento es de un fondo, el fondo recibe lo opuesto.
  const aplicar = (fecha, fondoId, banco) => {
    const i = idx.get(fecha)
    if (i === undefined) return
    deltaBanco[i] += banco
    if (fondoId && deltaFondo[fondoId]) deltaFondo[fondoId][i] -= banco
  }

  if (escenario) {
    for (const [id, c] of Object.entries(escenario.cambios ?? {})) {
      const m = base.indice.get(id)
      if (!m) continue
      aplicar(m.fecha, m.fondoId, -efectoMov(m.tipo, m.monto)) // se deshace el efecto original
      if (c.accion === 'modificar') {
        aplicar(c.fecha ?? m.fecha, m.fondoId, efectoMov(m.tipo, c.monto ?? m.monto))
      }
    }
    for (const nv of escenario.nuevos ?? []) {
      aplicar(nv.fecha, nv.fondoId, efectoNuevo(nv.tipo, nv.monto))
    }
  }

  const banco = new Array(n), fima = new Array(n), total = new Array(n)
  const fondos = {}
  fondoIds.forEach(id => { fondos[id] = new Array(n) })
  let acB = 0
  const acF = {}
  fondoIds.forEach(id => { acF[id] = 0 })
  for (let i = 0; i < n; i++) {
    acB += deltaBanco[i]
    banco[i] = base.banco[i] + acB
    let sumaF = 0
    for (const id of fondoIds) {
      acF[id] += deltaFondo[id][i]
      fondos[id][i] = base.fondos[id][i] + acF[id]
      sumaF += fondos[id][i]
    }
    fima[i] = sumaF
    total[i] = banco[i] + sumaF
  }

  const alertas = []
  for (const id of fondoIds) {
    const i = fondos[id].findIndex(v => v < -0.005)
    const iBase = base.fondos[id].findIndex(v => v < -0.005)
    if (i >= 0 && (iBase < 0 || i < iBase)) alertas.push({ tipo: 'fondo', fondoId: id, fecha: fechas[i] })
  }
  const iNeg = banco.findIndex(v => v < -0.005)
  const iNegBase = base.banco.findIndex(v => v < -0.005)
  if (iNeg >= 0 && (iNegBase < 0 || iNeg < iNegBase)) alertas.push({ tipo: 'caja', fecha: fechas[iNeg] })

  return { banco, fima, total, fondos, alertas }
}

// Qué se puede graficar: la caja, cada fondo por separado y la posición total.
// Los fondos NUNCA se suman entre sí salvo en la posición total.
export function opcionesMetrica(base) {
  return [
    { id: 'banco', texto: 'Caja', titulo: 'Caja (bancos)' },
    ...base.fondosLista.map(f => ({ id: `f:${claveFondo(f)}`, texto: f.nombre, titulo: f.nombre })),
    { id: 'total', texto: 'Total', titulo: 'Posición total (caja + fondos)' },
  ]
}

// Serie diaria de un resultado de simulación para la métrica elegida.
export function serieMetrica(resultado, metrica) {
  if (metrica === 'banco') return resultado.banco
  if (metrica === 'total') return resultado.total
  return resultado.fondos[metrica.slice(2)] ?? resultado.banco
}

// Caja más baja dentro de las primeras `n` posiciones.
export function cajaMinima(resultado, fechas, n) {
  let mi = 0
  for (let i = 1; i < n; i++) if (resultado.banco[i] < resultado.banco[mi]) mi = i
  return { valor: resultado.banco[mi], fecha: fechas[mi] }
}

// ─── Escenarios guardados ─────────────────────────────────────────────────────

function leerGuardado() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    return Array.isArray(d.escenarios) ? d : null
  } catch { return null }
}

export function cantidadAcciones(e) {
  return Object.keys(e.cambios ?? {}).length + (e.nuevos ?? []).length
}

// Huella de un escenario: sirve para saber si cambió desde la última vez que se guardó.
const firma = e => JSON.stringify([e.nombre, e.cambios ?? {}, e.nuevos ?? []])

export function useEscenarios() {
  const [escenarios, setEscenarios] = useState(() => leerGuardado()?.escenarios ?? [])
  const [activoId, setActivoId] = useState(() => leerGuardado()?.activoId ?? 'actual')
  // Escenarios que además del activo se dibujan en el gráfico para comparar (por defecto, ninguno).
  const [visibles, setVisibles] = useState(() => leerGuardado()?.visibles ?? [])
  // 'cargando' | 'nube' (se guardan en la base) | 'local' (tabla no disponible: solo este navegador)
  const [destino, setDestino] = useState('cargando')
  // 'guardado' | 'guardando' | 'error'
  const [guardado, setGuardado] = useState('guardado')
  const [reintento, setReintento] = useState(0) // se incrementa para volver a intentar un guardado que falló
  const enNube = useRef(new Map()) // id -> huella de lo último que quedó guardado en la base

  // Copia local siempre (respaldo y preferencias de pantalla).
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ escenarios, activoId, visibles })) } catch { /* sin storage: sigue andando */ }
  }, [escenarios, activoId, visibles])

  // Carga inicial desde la base.
  useEffect(() => {
    let vivo = true
    async function cargar() {
      const { data, error } = await supabase.from('escenarios_directorio').select('*').order('created_at', { ascending: true })
      if (!vivo) return
      if (error) { setDestino('local'); return } // tabla inexistente o sin permiso
      const filas = (data ?? []).map(r => ({ id: r.id, nombre: r.nombre, cambios: r.datos?.cambios ?? {}, nuevos: r.datos?.nuevos ?? [] }))
      enNube.current = new Map(filas.map(f => [f.id, firma(f)]))

      // Una sola vez por navegador: los escenarios que ya había guardados acá se suben a la base.
      let locales = []
      try {
        if (!localStorage.getItem(MIGRADO_KEY)) {
          locales = (leerGuardado()?.escenarios ?? []).filter(l => !enNube.current.has(l.id))
          localStorage.setItem(MIGRADO_KEY, '1')
        }
      } catch { /* sin storage */ }

      setEscenarios([...filas, ...locales])
      setDestino('nube')
    }
    cargar()
    return () => { vivo = false }
  }, [])

  // Si el escenario activo ya no existe (por ejemplo, se borró desde otro dispositivo), se vuelve a lo real.
  useEffect(() => {
    if (destino === 'cargando') return
    if (activoId !== 'actual' && !escenarios.some(e => e.id === activoId)) setActivoId('actual')
    setVisibles(v => (v.every(id => escenarios.some(e => e.id === id)) ? v : v.filter(id => escenarios.some(e => e.id === id))))
  }, [destino, escenarios, activoId])

  // Guardado en la base: se agrupa lo que cambió y se manda un instante después de la última edición.
  useEffect(() => {
    if (destino !== 'nube') return
    const actuales = new Map(escenarios.map(e => [e.id, firma(e)]))
    const subir = escenarios.filter(e => enNube.current.get(e.id) !== actuales.get(e.id))
    const borrar = [...enNube.current.keys()].filter(id => !actuales.has(id))
    if (subir.length === 0 && borrar.length === 0) { setGuardado('guardado'); return }

    setGuardado('guardando')
    let reintentar
    const timer = setTimeout(async () => {
      let fallo = false
      if (subir.length) {
        const { error } = await supabase.from('escenarios_directorio').upsert(
          subir.map(e => ({ id: e.id, nombre: e.nombre, datos: { cambios: e.cambios ?? {}, nuevos: e.nuevos ?? [] }, updated_at: new Date().toISOString() })),
          { onConflict: 'id' })
        if (error) fallo = true
        else subir.forEach(e => enNube.current.set(e.id, actuales.get(e.id)))
      }
      if (borrar.length) {
        const { error } = await supabase.from('escenarios_directorio').delete().in('id', borrar)
        if (error) fallo = true
        else borrar.forEach(id => enNube.current.delete(id))
      }
      setGuardado(fallo ? 'error' : 'guardado')
      if (fallo) reintentar = setTimeout(() => setReintento(n => n + 1), 5000) // sin conexión: se vuelve a intentar solo
    }, 600)
    return () => { clearTimeout(timer); clearTimeout(reintentar) }
  }, [escenarios, destino, reintento])

  const activo = escenarios.find(e => e.id === activoId) ?? null

  const siguienteNombre = () => {
    const usados = escenarios.map(e => Number(/^Escenario (\d+)$/.exec(e.nombre)?.[1] ?? 0))
    return `Escenario ${Math.max(0, ...usados) + 1}`
  }

  function crear(copiaDe = null) {
    const nuevo = {
      id: nuevoId(),
      nombre: copiaDe ? `${copiaDe.nombre} (copia)` : siguienteNombre(),
      cambios: copiaDe ? JSON.parse(JSON.stringify(copiaDe.cambios ?? {})) : {},
      nuevos: copiaDe ? (copiaDe.nuevos ?? []).map(n => ({ ...n, id: nuevoId() })) : [],
    }
    setEscenarios(l => [...l, nuevo])
    setActivoId(nuevo.id)
    return nuevo
  }

  // Aplica un cambio al escenario activo; si estás en el escenario actual (real), crea uno nuevo.
  function aplicar(fn) {
    if (activo) {
      setEscenarios(l => l.map(e => (e.id === activo.id ? fn(e) : e)))
    } else {
      const base = { id: nuevoId(), nombre: siguienteNombre(), cambios: {}, nuevos: [] }
      setEscenarios(l => [...l, fn(base)])
      setActivoId(base.id)
    }
  }

  function renombrar(id, nombre) {
    setEscenarios(l => l.map(e => (e.id === id ? { ...e, nombre } : e)))
  }

  function eliminar(id) {
    setEscenarios(l => l.filter(e => e.id !== id))
    setVisibles(v => v.filter(x => x !== id))
    if (activoId === id) setActivoId('actual')
  }

  function alternarVisible(id) {
    setVisibles(v => (v.includes(id) ? v.filter(x => x !== id) : [...v, id]))
  }

  return { escenarios, activo, activoId, setActivoId, visibles, crear, aplicar, renombrar, eliminar, alternarVisible, destino, guardado }
}
