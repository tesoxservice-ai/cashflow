// src/lib/fimaLedger.js
//
// Libro del fondo FIMA (saldo propio del fondo, separado del banco). Lo usan
// tanto el módulo de Finanzas como las cards de Directorio, para que ambos
// muestren exactamente el mismo número.
//
// El saldo del fondo = saldo inicial (punto de partida con fecha de corte)
//   + suscripciones (entran al fondo)  - rescates (salen del fondo)
//   + rendimientos (ajustes que suben o bajan el fondo, sin mover el banco).
//
// Los movimientos y rendimientos ANTERIORES a la fecha de corte ya están
// "adentro" del saldo inicial: no se vuelven a sumar, se reconstruyen hacia
// atrás solo para mostrar el detalle. Los de esa fecha en adelante se suman
// hacia adelante.

// movimientos:  [{ tipo: 'egreso'|'ingreso', montoEfectivo, fecha_pago, estado_proyeccion, ... }]
//   egreso  = suscripción (banco -$, fondo +$) / ingreso = rescate (banco +$, fondo -$)
// rendimientos: [{ id, fecha, monto, nota, created_at }]  (monto con signo)
// Devuelve los ítems en orden cronológico, cada uno con su saldoFima (saldo
// del fondo inmediatamente después de ese ítem).
export function construirLedgerFima({ movimientos, rendimientos = [], saldoInicialMonto = 0, saldoInicialFecha = null }) {
  const itemsMov = movimientos.map(m => ({ ...m, _orden: 0 }))
  const itemsRend = rendimientos.map(r => ({
    id: `rend-${r.id}`,
    _rendimientoId: r.id,
    tipo: 'rendimiento',
    subtipo: 'rendimiento',
    fecha_pago: r.fecha,
    montoEfectivo: Number(r.monto),
    estado: 'ejecutado',
    estado_proyeccion: 'normal',
    proveedor_cliente: r.nota || null,
    concepto: null,
    created_at: r.created_at,
    _orden: 1, // a igualdad de fecha, el rendimiento va al final del día
  }))

  const todos = [...itemsMov, ...itemsRend].sort((a, b) => {
    const fa = a.fecha_pago ?? '', fb = b.fecha_pago ?? ''
    if (fa !== fb) return fa < fb ? -1 : 1
    return a._orden - b._orden
  })

  // "No se cumple" queda visible pero no mueve el saldo del fondo (mismo
  // criterio que el Cash Flow bancario para ese flag).
  const delta = m => {
    if (m.estado_proyeccion === 'no_cumple') return 0
    if (m.tipo === 'rendimiento') return m.montoEfectivo
    return m.tipo === 'egreso' ? m.montoEfectivo : -m.montoEfectivo
  }

  const corte = saldoInicialFecha
  const antes   = corte ? todos.filter(m => m.fecha_pago < corte) : []
  const despues = corte ? todos.filter(m => m.fecha_pago >= corte) : todos

  let cursorAdelante = saldoInicialMonto
  const despuesConSaldo = despues.map(m => {
    cursorAdelante += delta(m)
    return { ...m, saldoFima: cursorAdelante }
  })

  let cursorAtras = saldoInicialMonto
  const antesConSaldo = [...antes].reverse().map(m => {
    const saldoLuegoDeEste = cursorAtras
    cursorAtras -= delta(m)
    return { ...m, saldoFima: saldoLuegoDeEste }
  }).reverse()

  return [...antesConSaldo, ...despuesConSaldo]
}

// ── Varios fondos ───────────────────────────────────────────────────────────
// Cada fondo (FIMA Premium, otro FIMA, otro fondo de inversión) tiene su propio
// saldo inicial, rendimientos y movimientos, con la misma lógica de arriba. Las
// tablas FIMA indican el fondo con fondo_id.

// Fondo que se usa mientras la tabla fondos_inversion todavía no existe o está vacía.
export const FONDO_POR_DEFECTO = { id: null, nombre: 'FIMA Premium' }

// Lista de fondos a mostrar: los activos, o el fondo por defecto si no hay ninguno.
export function normalizarFondos(fondos) {
  const activos = (fondos ?? []).filter(f => f.activo !== false)
  return activos.length ? activos : [FONDO_POR_DEFECTO]
}

// ¿Este ítem (movimiento, rendimiento o saldo inicial) es de este fondo? Lo que
// no trae fondo_id (cargado antes de que existieran los fondos) es del primero.
export function perteneceAlFondo(item, fondo, fondos) {
  const dueno = item.fondo_id ?? fondos[0]?.id ?? null
  return dueno === fondo.id
}

// Saldo inicial vigente de un fondo: el de fecha más reciente (y, a igual
// fecha, el último cargado).
export function saldoInicialDe(saldos, fondo, fondos) {
  const propios = (saldos ?? []).filter(s => perteneceAlFondo(s, fondo, fondos))
  propios.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1
    return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
  })
  return propios[0] ?? null
}

// Saldo del fondo al cierre de `fechaLimite` (inclusive). Si todavía no hay
// ningún ítem hasta esa fecha, es el saldo inicial.
export function saldoFimaEn(ledger, saldoInicialMonto, fechaLimite) {
  let ultimo = saldoInicialMonto
  for (const m of ledger) {
    if (!m.fecha_pago || m.fecha_pago > fechaLimite) break
    ultimo = m.saldoFima
  }
  return ultimo
}
