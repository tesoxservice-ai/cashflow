import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarSnapshot, compararSnapshots, alinearSeries, conceptoDe, cambiosDeLineas } from './snapshots.js'

// Arma un "base" mínimo como el de construirBase: fechas, banco, fondos e índice de líneas pendientes.
function baseDe({ hoy, dias = 5, banco0 = 1000, lineas = [] }) {
  const sumar = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  const fechas = Array.from({ length: dias }, (_, i) => sumar(hoy, i))
  const indice = new Map(lineas.map(l => [l.id, { numeroFactura: '', obra: '', rubro: '', periodo: null, etiqueta: l.id, esFima: l.categoria === 'fima', virtual: false, ...l }]))
  const banco = fechas.map(f => {
    let s = banco0
    for (const l of indice.values()) if (l.fecha <= f && !l.esFima) s += l.tipo === 'ingreso' ? l.monto : -l.monto
    return s
  })
  return { base: { fechas, banco, indice }, resultado: { banco, total: banco.map(v => v + 50) }, hoy }
}

test('conceptoDe clasifica cada línea', () => {
  assert.equal(conceptoDe({ tipo: 'egreso', categoria: 'factura' }), 'facturas_registradas')
  assert.equal(conceptoDe({ tipo: 'egreso', categoria: 'gasto_proyectado' }), 'gasto_proyectado')
  assert.equal(conceptoDe({ tipo: 'egreso', categoria: 'impuesto_venta_proyectado' }), 'impuestos_ventas')
  assert.equal(conceptoDe({ tipo: 'ingreso', categoria: 'venta_proyectada' }), 'ventas_proyectadas')
  assert.equal(conceptoDe({ tipo: 'ingreso', categoria: 'ingreso_cliente' }), 'cobros_registrados')
  assert.equal(conceptoDe({ tipo: 'egreso', categoria: 'sueldo' }), 'sueldos')
  assert.equal(conceptoDe({ tipo: 'egreso', categoria: 'impuesto' }), 'impuestos_registrados')
  assert.equal(conceptoDe({ tipo: 'egreso', categoria: 'debito_automatico' }), 'debitos_automaticos')
  assert.equal(conceptoDe({ tipo: 'egreso', categoria: 'otro' }), 'otros_egresos_registrados')
  assert.equal(conceptoDe({ tipo: 'ingreso', categoria: 'fima', esFima: true }), 'fima')
})

test('armarSnapshot: totales, meses y mínimo', () => {
  const { base, resultado, hoy } = baseDe({
    hoy: '2026-11-20', dias: 15, banco0: 1000,
    lineas: [
      { id: 'a', fecha: '2026-11-22', tipo: 'egreso', monto: 300, categoria: 'factura' },
      { id: 'b', fecha: '2026-11-25', tipo: 'egreso', monto: 200.5, categoria: 'gasto_proyectado', virtual: true },
      { id: 'c', fecha: '2026-12-02', tipo: 'ingreso', monto: 700, categoria: 'venta_proyectada', virtual: true },
      { id: 'd', fecha: '2026-11-28', tipo: 'egreso', monto: 100, categoria: 'fima' },
    ],
  })
  const s = armarSnapshot({ base, resultado, hoy })
  assert.equal(s.fecha_corte, '2026-11-20')
  assert.equal(s.resumen.egresos_pendientes, 500.5)
  assert.equal(s.resumen.ingresos_pendientes, 700)
  assert.equal(s.resumen.fima_neto, -100)
  assert.equal(s.resumen.por_concepto.facturas_registradas, 300)
  assert.equal(s.resumen.por_concepto.gasto_proyectado, 200.5)
  assert.equal(s.resumen.caja_hoy, 1000)
  assert.equal(s.resumen.caja_minima.valor, Math.min(...resultado.banco))
  assert.equal(s.mensual['2026-11'].facturas_registradas, 300)
  assert.equal(s.mensual['2026-11'].gasto_proyectado, 200.5)
  assert.equal(s.mensual['2026-12'].ventas_proyectadas, 700)
  assert.equal(s.mensual['2026-11'].fima, -100)
  assert.equal(s.filas.length, 4)
  assert.equal(s.serie.banco.length, 15)
  assert.equal(s.serie.desde, '2026-11-20')
})

test('armarSnapshot: caja negativa se detecta', () => {
  const { base, resultado, hoy } = baseDe({
    hoy: '2026-11-20', dias: 6, banco0: 100,
    lineas: [{ id: 'x', fecha: '2026-11-23', tipo: 'egreso', monto: 500, categoria: 'factura' }],
  })
  const s = armarSnapshot({ base, resultado, hoy })
  assert.equal(s.resumen.primer_dia_caja_negativa, '2026-11-23')
  assert.equal(s.resumen.caja_minima.valor, -400)
})

// Dos fotos con 7 días de diferencia, como el ejemplo "baja de 900M a 300M".
function dosFotos() {
  const a = baseDe({
    hoy: '2026-02-18', dias: 20, banco0: 5000,
    lineas: [
      { id: 'f1', fecha: '2026-02-20', tipo: 'egreso', monto: 100, categoria: 'factura', obra: '659' },
      { id: 'f2', fecha: '2026-03-04', tipo: 'egreso', monto: 50, categoria: 'factura', obra: '659' },
      { id: 'g1', fecha: '2026-02-26', tipo: 'egreso', monto: 400, categoria: 'gasto_proyectado', virtual: true, obra: '659', rubro: 'Materiales', periodo: '2026-02-01' },
      { id: 'v1', fecha: '2026-03-02', tipo: 'ingreso', monto: 900, categoria: 'venta_proyectada', virtual: true, obra: '659', periodo: '2026-02-01' },
    ],
  })
  const b = baseDe({
    hoy: '2026-02-25', dias: 13, banco0: 4800,
    lineas: [
      { id: 'f2', fecha: '2026-03-06', tipo: 'egreso', monto: 50, categoria: 'factura', obra: '659' }, // movida de fecha
      { id: 'f3', fecha: '2026-03-05', tipo: 'egreso', monto: 80, categoria: 'factura', obra: '659' }, // nueva
      { id: 'g2', fecha: '2026-03-04', tipo: 'egreso', monto: 150, categoria: 'gasto_proyectado', virtual: true, obra: '659', rubro: 'Materiales', periodo: '2026-02-01' },
      { id: 'v1', fecha: '2026-03-02', tipo: 'ingreso', monto: 900, categoria: 'venta_proyectada', virtual: true, obra: '659', periodo: '2026-02-01' },
    ],
  })
  return [armarSnapshot(a), armarSnapshot(b)]
}

test('compararSnapshots: el egreso pendiente se explica exacto (inicial - les tocó + ajustes = final)', () => {
  const [sa, sb] = dosFotos()
  const c = compararSnapshots(sb, sa) // a propósito al revés: se ordenan solas
  assert.equal(c.a.fecha_corte, '2026-02-18')
  assert.equal(c.diasEntreFotos, 7)
  assert.equal(c.egresos.inicial, 550)  // 100 + 50 + 400
  assert.equal(c.egresos.final, 280)    // 50 + 80 + 150
  assert.equal(c.egresos.lesToco, 100)  // solo f1 (20/02) cayó antes del 25/02
  assert.equal(c.egresos.ajustes, -170) // 280 - (550 - 100) = +80 nueva - 250 gasto proyectado
  assert.equal(c.egresos.inicial - c.egresos.lesToco + c.egresos.ajustes, c.egresos.final)
  assert.equal(c.ingresos.lesToco, 0)
  assert.equal(c.ingresos.ajustes, 0)
})

test('compararSnapshots: indicadores y diferencias por mes', () => {
  const [sa, sb] = dosFotos()
  const c = compararSnapshots(sa, sb)
  const ind = Object.fromEntries(c.indicadores.map(i => [i.clave, i]))
  assert.equal(ind.egresos_pendientes.dif, -270)
  assert.equal(ind.caja_hoy.dif, sb.resumen.caja_hoy - sa.resumen.caja_hoy)
  const marzoGasto = c.mensual.find(m => m.mes === '2026-03' && m.concepto === 'gasto_proyectado')
  assert.equal(marzoGasto.a, 0)
  assert.equal(marzoGasto.b, 150)
  const febGasto = c.mensual.find(m => m.mes === '2026-02' && m.concepto === 'gasto_proyectado')
  assert.equal(febGasto.a, 400)
  assert.equal(febGasto.b, 0)
})

test('cambiosDeLineas: nueva, movida, sacada y proyección agrupada', () => {
  const [sa, sb] = dosFotos()
  const cambios = cambiosDeLineas(sa, sb)
  const porClase = clase => cambios.filter(c => c.clase === clase)
  assert.equal(porClase('nueva').length, 1)
  assert.equal(porClase('nueva')[0].b, 80)
  assert.equal(porClase('fecha').length, 1)
  assert.equal(porClase('fecha')[0].fechaA, '2026-03-04')
  assert.equal(porClase('fecha')[0].fechaB, '2026-03-06')
  // f1 ya le tocó (20/02 < 25/02): no es un cambio
  assert.equal(porClase('sacada').length, 0)
  // el gasto proyectado: en A, g1 (26/02 ≥ 25/02) cuenta 400; en B hay 150 → baja 250
  const proy = porClase('proyeccion').find(c => c.concepto === 'gasto_proyectado')
  assert.equal(proy.a, 400)
  assert.equal(proy.b, 150)
  assert.equal(proy.dif, -250)
  // la venta proyectada no cambió: no aparece
  assert.equal(porClase('proyeccion').find(c => c.concepto === 'ventas_proyectadas'), undefined)
})

test('alinearSeries: recorta al período en común', () => {
  const [sa, sb] = dosFotos()
  const al = alinearSeries(sa, sb, 'banco')
  assert.equal(al.fechas[0], '2026-02-25')
  assert.equal(al.fechas.length, 13) // sb cubre 13 días desde el 25/02; sa llega hasta el 09/03
  assert.equal(al.fechas.length, al.a.length)
  assert.equal(al.a[0], sa.serie.banco[7]) // el 25/02 es el día 7 de A
  assert.equal(al.b[0], sb.serie.banco[0])
})

test('alinearSeries: sin tramo en común devuelve vacío', () => {
  const sa = { serie: { desde: '2026-01-01', banco: [1, 2] } }
  const sb = { serie: { desde: '2026-03-01', banco: [1, 2] } }
  assert.deepEqual(alinearSeries(sa, sb), { fechas: [], a: [], b: [] })
})
