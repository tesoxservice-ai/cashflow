// Pruebas de la nivelación diaria del gasto proyectado (tope por día) y del movimiento de partes. Correr con: npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularGastosProyectados, combinarConProyeccion, normalizarPartes, NIVELACION_DIARIA } from './proyeccionPresupuesto.js'

const HOY = new Date(2026, 9, 30) // viernes 30/10/2026
const HOY_ISO = '2026-10-30'
const TOPE_MIE = NIVELACION_DIARIA.topeMiercoles
const TOPE_OTRO = NIVELACION_DIARIA.topeOtroDia
const M = 1_000_000
const centavos = n => Math.round(n * 100)
const IDS_OBRA = Array.from({ length: 40 }, (_, i) => `o${i + 1}`)
const OBRAS = IDS_OBRA.map(id => ({ id }))
const diaSemana = f => new Date(`${f}T00:00:00`).getDay()

// Presupuestos de octubre (se pagan en noviembre) para una lista de montos, uno por obra, todos con el rubro r1.
const presDe = (montos, periodo = '2026-10-01') => montos.map((monto, i) => ({ obra_id: IDS_OBRA[i], rubro_id: 'r1', periodo, monto }))
const calcular = (pres, movs = [], fechas = [], hoy = HOY) => calcularGastosProyectados(pres, movs, fechas, OBRAS, hoy)
const total = filas => filas.reduce((s, f) => s + centavos(f.saldoProyectado), 0)
const porDia = filas => {
  const d = {}
  filas.forEach(f => { d[f.fechaPago] = (d[f.fechaPago] ?? 0) + centavos(f.saldoProyectado) })
  return d
}
const factura = (id, fecha, monto, extra = {}) => ({ id, tipo: 'egreso', categoria: 'factura', estado: 'proyectado', estado_proyeccion: 'normal', fecha_pago: fecha, monto_bruto: monto, ...extra })

test('el total proyectado no cambia: solo cambia el día en que sale cada línea', () => {
  const montos = [90 * M, 40 * M, 33.33 * M, 7 * M, 3.5 * M, 0.9 * M, 55.55 * M, 12 * M, 1 * M, 20.01 * M]
  const filas = calcular(presDe(montos))
  assert.equal(total(filas), montos.reduce((s, m) => s + centavos(m), 0))
})

test('ningún día pasa del tope: $ 60 M los miércoles y $ 5 M los otros días hábiles; sábado y domingo, nada', () => {
  const montos = Array.from({ length: 30 }, (_, i) => (i % 5 === 0 ? 4 : i % 3 === 0 ? 25 : 12) * M + i * 1000)
  const dias = porDia(calcular(presDe(montos)))
  Object.entries(dias).forEach(([f, c]) => {
    const dia = diaSemana(f)
    assert.ok(dia !== 0 && dia !== 6, `no debería haber proyectado un fin de semana (${f})`)
    assert.ok(c <= centavos(dia === 3 ? TOPE_MIE : TOPE_OTRO), `${f} pasó del tope: ${c / 100}`)
  })
})

test('las líneas que caben se acomodan enteras (sin partirse) y los miércoles se llenan hasta el tope', () => {
  const filas = calcular(presDe(Array(12).fill(20 * M)))
  assert.equal(filas.length, 12)                       // ninguna se partió
  assert.ok(filas.every(f => f.partes === undefined))
  const dias = porDia(filas)
  assert.equal(dias['2026-11-04'], centavos(3 * 20 * M)) // 3 líneas de 20 = 60
  assert.equal(dias['2026-11-11'], centavos(3 * 20 * M))
})

test('las facturas ya cargadas ocupan lugar y no se mueven: el proyectado completa solo lo que falta', () => {
  const movs = [factura('f1', '2026-11-04', 40 * M)]
  const dias = porDia(calcular(presDe(Array(6).fill(10 * M)), movs))
  assert.equal(dias['2026-11-04'], centavos(20 * M)) // 40 de factura + 20 de proyectado = 60
})

test('una factura que ya pasa del tope deja ese día sin proyectado y el proyectado sigue en otros días', () => {
  const movs = [factura('f1', '2026-11-04', 75 * M)]
  const filas = calcular(presDe(Array(6).fill(10 * M)), movs)
  const dias = porDia(filas)
  assert.equal(dias['2026-11-04'], undefined)
  assert.equal(total(filas), centavos(60 * M)) // no se pierde nada
})

test('una factura "no cumple" o ejecutada se cuenta bien: ejecutada pesa por su neto, no cumple no ocupa lugar', () => {
  const movs = [
    factura('f1', '2026-11-04', 40 * M, { estado_proyeccion: 'no_cumple' }),
    factura('f2', '2026-11-11', 50 * M, { estado: 'ejecutado', monto_neto: 30 * M }),
  ]
  const dias = porDia(calcular(presDe(Array(12).fill(10 * M)), movs))
  assert.equal(dias['2026-11-04'], centavos(60 * M)) // la "no cumple" no ocupa
  assert.equal(dias['2026-11-11'], centavos(30 * M)) // 60 - 30 de neto
})

test('el pago es a 30 días: octubre no sale antes de noviembre y noviembre no sale antes de diciembre', () => {
  const pres = [...presDe([10 * M, 10 * M], '2026-10-01'), ...presDe([10 * M, 10 * M], '2026-11-01').map((p, i) => ({ ...p, obra_id: IDS_OBRA[i + 10] }))]
  const filas = calcular(pres)
  filas.filter(f => f.periodo === '2026-10-01').forEach(f => assert.ok(f.fechaPago >= '2026-11-01', f.fechaPago))
  filas.filter(f => f.periodo === '2026-11-01').forEach(f => assert.ok(f.fechaPago >= '2026-12-01', f.fechaPago))
})

test('nunca se proyecta un pago en el pasado ni hoy', () => {
  const filas = calcular(presDe(Array(8).fill(5 * M)), [], [], new Date(2026, 10, 25)) // hoy = miércoles 25/11
  filas.forEach(f => assert.ok(f.fechaPago > '2026-11-25', f.fechaPago))
})

test('los períodos más viejos se pagan primero (llegan antes que los nuevos)', () => {
  const pres = [{ obra_id: 'o1', rubro_id: 'r1', periodo: '2026-11-01', monto: 50 * M }, { obra_id: 'o2', rubro_id: 'r1', periodo: '2026-10-01', monto: 50 * M }]
  const filas = calcular(pres)
  const oct = filas.find(f => f.periodo === '2026-10-01')
  const nov = filas.find(f => f.periodo === '2026-11-01')
  assert.ok(oct.fechaPago < nov.fechaPago)
})

test('una línea más grande que un miércoles se parte solo en miércoles, exacta al centavo, y su división es válida', () => {
  const filas = calcular(presDe([150.55 * M]))
  assert.ok(filas.length >= 3)
  filas.forEach(f => assert.equal(diaSemana(f.fechaPago), 3))
  assert.equal(total(filas), centavos(150.55 * M))
  filas.forEach((f, i) => { assert.equal(f.parte, i + 1); assert.equal(f.partes, filas.length) })
  assert.ok(filas.slice(0, -1).every(f => f.saldoProyectado >= M)) // sin migas
  const division = filas[0].division
  assert.equal(division.length, filas.length)
  assert.ok(normalizarPartes(division), 'la división tiene que ser aceptada por normalizarPartes (suma 100)')
  assert.equal(Math.round(division.reduce((s, p) => s + p.porcentaje, 0) * 100) / 100, 100)
})

test('el resultado es siempre el mismo, sin importar el orden en que llegan los presupuestos', () => {
  const pres = presDe([35 * M, 20 * M, 20 * M, 14 * M, 8 * M, 90 * M, 5 * M, 5 * M])
  const a = calcular(pres), b = calcular([...pres].reverse())
  const clave = f => `${f.obra_id}|${f.fechaPago}|${f.saldoProyectado}`
  assert.deepEqual(a.map(clave).sort(), b.map(clave).sort())
})

test('la fecha que Finanzas pone a mano manda: esa línea queda fija y el resto se acomoda alrededor', () => {
  const pres = presDe(Array(8).fill(10 * M))
  const fechas = [{ obra_id: 'o1', rubro_id: 'r1', periodo: '2026-10-01', fecha_estimada: '2026-11-04', cerrado: false },
                  { obra_id: 'o2', rubro_id: 'r1', periodo: '2026-10-01', fecha_estimada: '2026-11-04', cerrado: false }]
  const filas = calcular(pres, [], fechas)
  assert.equal(filas.find(f => f.obra_id === 'o1').fechaPago, '2026-11-04')
  assert.equal(filas.find(f => f.obra_id === 'o2').fechaPago, '2026-11-04')
  assert.equal(porDia(filas)['2026-11-04'], centavos(60 * M)) // 2 fijas (20) + 4 automáticas (40) = 60
  assert.equal(total(filas), centavos(80 * M))
})

test('lo que Finanzas pone a mano TAMBIÉN respeta el tope: lo que no entra pasa en cadena al siguiente día con lugar', () => {
  const pres = presDe(Array(5).fill(30 * M))
  const fechas = ['o1', 'o2', 'o3', 'o4', 'o5'].map(o => ({ obra_id: o, rubro_id: 'r1', periodo: '2026-10-01', fecha_estimada: '2026-11-11', cerrado: false }))
  const filas = calcular(pres, [], fechas)
  const dias = porDia(filas)
  assert.equal(dias['2026-11-11'], centavos(60 * M)) // entran 2 de 30 = 60, no más
  assert.equal(dias['2026-11-18'], centavos(60 * M)) // las 2 siguientes, el miércoles siguiente
  assert.equal(dias['2026-11-25'], centavos(30 * M)) // la última, el otro miércoles
  assert.equal(total(filas), centavos(150 * M))
})

test('lo que Finanzas pone a mano tiene prioridad sobre lo automático en ese día', () => {
  const pres = presDe(Array(8).fill(30 * M))
  const fechas = [{ obra_id: 'o8', rubro_id: 'r1', periodo: '2026-10-01', fecha_estimada: '2026-11-11', cerrado: false }]
  const filas = calcular(pres, [], fechas)
  assert.equal(filas.find(f => f.obra_id === 'o8').fechaPago, '2026-11-11')
})

test('los días chicos (lunes, martes, jueves, viernes) admiten hasta $ 8 M', () => {
  assert.equal(TOPE_OTRO, 8 * M)
  const filas = calcular(presDe(Array(10).fill(8 * M)))
  const dias = porDia(filas)
  Object.entries(dias).forEach(([f, c]) => { if (diaSemana(f) !== 3) assert.ok(c <= centavos(8 * M), f) })
  assert.ok(Object.entries(dias).some(([f, c]) => diaSemana(f) !== 3 && c === centavos(8 * M)))
})

test('mover gasto a un miércoles lleno: lo automático de ese día se corre y el día queda en el tope', () => {
  const pres = presDe(Array(12).fill(10 * M)) // 120 M: llenan 2 miércoles
  const sin = calcular(pres)
  const fechas = [{ obra_id: 'o12', rubro_id: 'r1', periodo: '2026-10-01', fecha_estimada: '2026-11-04', cerrado: false }]
  const con = calcular(pres, [], fechas)
  assert.equal(porDia(con)['2026-11-04'], centavos(60 * M))
  assert.equal(porDia(sin)['2026-11-04'], centavos(60 * M))
  assert.equal(con.find(f => f.obra_id === 'o12').fechaPago, '2026-11-04')
  assert.equal(total(con), total(sin))
})

test('una división manual (partes): cada parte va a su fecha si hay lugar, y la división original se conserva', () => {
  const pres = presDe(Array(6).fill(10 * M))
  const fechas = [{ obra_id: 'o1', rubro_id: 'r1', periodo: '2026-10-01', fecha_estimada: null, cerrado: false,
    partes: [{ porcentaje: 50, fecha: '2026-11-04' }, { porcentaje: 50, fecha: '2026-11-11' }] }]
  const filas = calcular(pres, [], fechas)
  const o1 = filas.filter(f => f.obra_id === 'o1')
  assert.equal(o1.length, 2)
  assert.deepEqual(o1.map(f => f.fechaPago).sort(), ['2026-11-04', '2026-11-11'])
  assert.ok(o1.every(f => f.divisionManual && f.division.length === 2))
  assert.equal(porDia(filas)['2026-11-04'] <= centavos(TOPE_MIE), true)
})

test('una parte manual con fecha en el pasado no se pierde: va al primer día con lugar desde mañana', () => {
  const pres = presDe([20 * M])
  const fechas = [{ obra_id: 'o1', rubro_id: 'r1', periodo: '2026-10-01', fecha_estimada: null, cerrado: false,
    partes: [{ porcentaje: 50, fecha: '2026-10-14' }, { porcentaje: 50, fecha: '2026-11-11' }] }]
  const filas = calcular(pres, [], fechas)
  assert.equal(filas.length, 2)
  filas.forEach(f => assert.ok(f.fechaPago > HOY_ISO))
  assert.equal(total(filas), centavos(20 * M))
})

test('una línea cerrada por Finanzas no genera pago ni ocupa lugar', () => {
  const pres = presDe(Array(6).fill(10 * M))
  const fechas = [{ obra_id: 'o1', rubro_id: 'r1', periodo: '2026-10-01', fecha_estimada: null, cerrado: true }]
  const filas = calcular(pres, [], fechas)
  assert.equal(filas.filter(f => f.obra_id === 'o1').length, 0)
  assert.equal(total(filas), centavos(50 * M))
})

test('cargar una factura baja el proyectado de su línea exactamente por su monto y no cambia el total de las demás', () => {
  const pres = presDe([20 * M, 30 * M, 40 * M])
  const sin = calcular(pres)
  const con = calcular(pres, [factura('f1', '2026-12-20', 8 * M, { obra_id: 'o2', rubro_id: 'r1', periodo: '2026-10-01' })])
  assert.equal(total(sin) - total(con), centavos(8 * M))
  assert.equal(con.find(f => f.obra_id === 'o2').saldoProyectado, 22 * M)
})

test('una línea totalmente facturada desaparece', () => {
  const pres = presDe([20 * M, 30 * M])
  const con = calcular(pres, [factura('f1', '2026-12-20', 30 * M, { obra_id: 'o2', rubro_id: 'r1', periodo: '2026-10-01' })])
  assert.equal(con.filter(f => f.obra_id === 'o2').length, 0)
  assert.equal(total(con), centavos(20 * M))
})

test('un monto enorme no cuelga el cálculo ni pierde plata', () => {
  const t0 = Date.now()
  const filas = calcular(presDe([30_000 * M, 5 * M]))
  assert.ok(Date.now() - t0 < 2000, 'tardó demasiado')
  assert.equal(total(filas), centavos(30_005 * M))
})

test('montos con centavos raros suman exacto', () => {
  const montos = [123456789.01, 98765432.1, 33333333.33, 0.07, 999999.99, 61234567.89]
  const filas = calcular(presDe(montos))
  assert.equal(total(filas), montos.reduce((s, m) => s + centavos(m), 0))
})

test('sin presupuestos o con todo facturado no hay filas ni errores', () => {
  assert.deepEqual(calcular([]), [])
  assert.equal(calcular(presDe([10 * M]), [factura('f1', '2026-12-01', 10 * M, { obra_id: 'o1', rubro_id: 'r1', periodo: '2026-10-01' })]).length, 0)
})

test('mover UNA parte de una línea partida: las otras partes se quedan donde estaban', () => {
  // Misma cuenta que hace el panel "Mover gastos proyectados" al tildar una sola parte.
  const pres = presDe([150 * M])
  const filas = calcular(pres)
  const division = filas[0].division
  const partes = division.map((p, i) => ({ porcentaje: p.porcentaje, fecha: i === 0 ? '2026-12-02' : p.fecha }))
  const suma = partes.slice(0, -1).reduce((s, p) => s + p.porcentaje, 0)
  partes[partes.length - 1].porcentaje = Math.round((100 - suma) * 100) / 100
  assert.ok(normalizarPartes(partes))
  const despues = calcular(pres, [], [{ obra_id: 'o1', rubro_id: 'r1', periodo: '2026-10-01', fecha_estimada: null, cerrado: false, partes }])
  assert.equal(despues.length, filas.length)
  const parte = n => despues.find(f => f.parte === n)
  assert.equal(parte(1).fechaPago, '2026-12-02')
  for (let i = 1; i < filas.length; i++) assert.equal(parte(i + 1).fechaPago, division[i].fecha)
  assert.equal(total(despues), centavos(150 * M))
})

test('combinarConProyeccion: las filas niveladas llegan completas al Cash Flow (obra, rubro, período, fecha, monto)', () => {
  const filas = combinarConProyeccion([], presDe([30 * M, 12 * M]), [], [], [], OBRAS, [{ id: 'r1', nombre: 'Subcontratos' }], HOY)
    .filter(m => m._virtual && m.categoria === 'gasto_proyectado')
  assert.equal(filas.length, 2)
  filas.forEach(m => {
    assert.ok(m.fecha_pago > HOY_ISO)
    assert.equal(m.tipo, 'egreso')
    assert.equal(m.rubros?.nombre, 'Subcontratos')
    assert.equal(m.montoEfectivo, m.monto_bruto)
  })
})

test('con activa = false vuelve el reparto anterior (cada línea entera en un miércoles de noviembre)', () => {
  NIVELACION_DIARIA.activa = false
  try {
    const filas = calcular(presDe([10 * M, 10 * M, 10 * M, 10 * M]))
    const miercolesNov = ['2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25']
    filas.forEach(f => assert.ok(miercolesNov.includes(f.fechaPago) || diaSemana(f.fechaPago) === 4, f.fechaPago))
  } finally { NIVELACION_DIARIA.activa = true }
})
