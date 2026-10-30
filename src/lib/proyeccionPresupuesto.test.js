// Pruebas del gasto proyectado (reparto en miércoles y descuento por facturas). Correr con: npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularGastosProyectados } from './proyeccionPresupuesto.js'

const HOY = new Date(2026, 9, 30) // 30/10/2026
const OBRAS = ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8'].map(id => ({ id }))
const centavos = n => Math.round(n * 100)

// Presupuesto de octubre 2026 (se paga en los miércoles de noviembre: 4, 11, 18 y 25).
const PRES = [
  { obra_id: 'o1', rubro_id: 'r1', periodo: '2026-10-01', monto: 80_000_000 },
  { obra_id: 'o1', rubro_id: 'r2', periodo: '2026-10-01', monto: 30_000_000 },
  { obra_id: 'o2', rubro_id: 'r1', periodo: '2026-10-01', monto: 60_000_000 },
  { obra_id: 'o2', rubro_id: 'r3', periodo: '2026-10-01', monto: 20_000_000 },
  { obra_id: 'o3', rubro_id: 'r1', periodo: '2026-10-01', monto: 45_000_000 },
  { obra_id: 'o4', rubro_id: 'r2', periodo: '2026-10-01', monto: 25_000_000 },
  { obra_id: 'o5', rubro_id: 'r1', periodo: '2026-10-01', monto: 15_000_000 },
  { obra_id: 'o6', rubro_id: 'r1', periodo: '2026-10-01', monto: 10_000_000 },
  { obra_id: 'o7', rubro_id: 'r2', periodo: '2026-10-01', monto: 8_000_000 },
  { obra_id: 'o8', rubro_id: 'r1', periodo: '2026-10-01', monto: 5_000_000 },
]
const MIERCOLES_NOV = ['2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25']
const calcular = (movs = [], fechas = [], pres = PRES) => calcularGastosProyectados(pres, movs, fechas, OBRAS, HOY)
const porFecha = filas => {
  const o = {}
  filas.forEach(f => { o[f.fechaPago] = (o[f.fechaPago] ?? 0) + f.saldoProyectado })
  return o
}

test('cada línea cae entera en uno de los 4 miércoles del mes siguiente', () => {
  const filas = calcular()
  assert.equal(filas.length, PRES.length)
  filas.forEach(f => assert.ok(MIERCOLES_NOV.includes(f.fechaPago), `${f.fechaPago} no es un miércoles de pago`))
})

test('el reparto deja los 4 miércoles parejos y no cambia el total', () => {
  const filas = calcular()
  const total = PRES.reduce((s, p) => s + p.monto, 0)
  assert.equal(filas.reduce((s, f) => s + f.saldoProyectado, 0), total)
  const montos = MIERCOLES_NOV.map(f => porFecha(filas)[f] ?? 0)
  const mayorLinea = Math.max(...PRES.map(p => p.monto))
  assert.ok(Math.max(...montos) - Math.min(...montos) <= mayorLinea, `diferencia ${Math.max(...montos) - Math.min(...montos)} mayor que la línea más grande`)
  // con estas líneas (298 M en 4 miércoles) ninguno se aleja más de 10 M del promedio
  montos.forEach(m => assert.ok(Math.abs(m - total / 4) <= 10_000_000, `miércoles con ${m}`))
})

test('el reparto es siempre el mismo (no depende del orden en que llegan los datos)', () => {
  const a = calcular()
  const b = calcular([], [], [...PRES].reverse())
  const mapa = filas => Object.fromEntries(filas.map(f => [`${f.obra_id}|${f.rubro_id}`, f.fechaPago]))
  assert.deepEqual(mapa(a), mapa(b))
})

test('un miércoles que ya tiene pagos reales cargados recibe menos gasto proyectado', () => {
  // $ 120 M de facturas de otra obra con pago el 11/11: ese día no necesita más gasto proyectado
  const real = { categoria: 'factura', tipo: 'egreso', estado: 'proyectado', obra_id: 'o9', rubro_id: 'r9', periodo: '2026-09-01',
    monto_bruto: 120_000_000, fecha_pago: '2026-11-11', estado_proyeccion: 'normal' }
  const filas = calcular([real])
  const proy = porFecha(filas)
  assert.equal(filas.reduce((s, f) => s + f.saldoProyectado, 0), PRES.reduce((s, p) => s + p.monto, 0)) // el total no cambia
  assert.ok((proy['2026-11-11'] ?? 0) <= 10_000_000, `el 11/11 quedó con ${proy['2026-11-11']}`)
  const otros = ['2026-11-04', '2026-11-18', '2026-11-25'].map(f => proy[f] ?? 0)
  const prom = otros.reduce((s, x) => s + x, 0) / 3
  otros.forEach(m => assert.ok(Math.abs(m - prom) <= 10_000_000, `miércoles con ${m}`))
})

test('los pagos reales ejecutados, sueldos o de otro mes también cuentan como carga del día; los echeqs de FIMA no', () => {
  const base = { tipo: 'egreso', estado: 'proyectado', monto_bruto: 120_000_000, fecha_pago: '2026-11-11', estado_proyeccion: 'normal' }
  const proy11 = movs => porFecha(calcular(movs))['2026-11-11'] ?? 0
  assert.ok(proy11([{ ...base, categoria: 'sueldo' }]) <= 10_000_000)
  assert.ok(proy11([{ ...base, categoria: 'impuesto' }]) <= 10_000_000)
  assert.ok(proy11([{ ...base, categoria: 'fima' }]) > 50_000_000) // una suscripción a FIMA no es un gasto
  assert.ok(proy11([{ ...base, categoria: 'sueldo', estado_proyeccion: 'no_cumple' }]) > 50_000_000)
})

test('una factura descuenta del saldo de su misma obra + rubro + período', () => {
  const factura = { categoria: 'factura', tipo: 'egreso', obra_id: 'o1', rubro_id: 'r1', periodo: '2026-10-01', monto_bruto: 30_000_000, estado_proyeccion: 'normal' }
  const filas = calcular([factura])
  const linea = filas.find(f => f.obra_id === 'o1' && f.rubro_id === 'r1')
  assert.equal(linea.saldoProyectado, 50_000_000)
  assert.equal(linea.gastoReal, 30_000_000)
  // las otras líneas no se tocan
  const otras = filas.filter(f => !(f.obra_id === 'o1' && f.rubro_id === 'r1'))
  assert.equal(otras.reduce((s, f) => s + f.saldoProyectado, 0), PRES.reduce((s, p) => s + p.monto, 0) - 80_000_000)
})

test('varias facturas de la misma línea se suman y el saldo nunca baja de cero', () => {
  const f = (monto, extra = {}) => ({ categoria: 'factura', tipo: 'egreso', obra_id: 'o6', rubro_id: 'r1', periodo: '2026-10-01', monto_bruto: monto, estado_proyeccion: 'normal', ...extra })
  const parcial = calcular([f(4_000_000), f(3_000_000)]).find(x => x.obra_id === 'o6')
  assert.equal(parcial.saldoProyectado, 3_000_000)
  const excedida = calcular([f(9_000_000), f(5_000_000)])
  assert.equal(excedida.find(x => x.obra_id === 'o6'), undefined) // gastó más de lo presupuestado: no queda saldo
})

test('una factura de otro período, otro rubro u otra obra no descuenta', () => {
  const base = { categoria: 'factura', tipo: 'egreso', obra_id: 'o3', rubro_id: 'r1', periodo: '2026-10-01', monto_bruto: 5_000_000, estado_proyeccion: 'normal' }
  const saldoO3 = movs => calcular(movs).find(f => f.obra_id === 'o3').saldoProyectado
  assert.equal(saldoO3([{ ...base, periodo: '2026-09-01' }]), 45_000_000)
  assert.equal(saldoO3([{ ...base, rubro_id: 'r9' }]), 45_000_000)
  assert.equal(saldoO3([{ ...base, obra_id: 'o9' }]), 45_000_000)
  assert.equal(saldoO3([{ ...base, tipo: 'ingreso' }]), 45_000_000)
})

test('una factura marcada "no cumple" no descuenta', () => {
  const noCumple = { categoria: 'factura', tipo: 'egreso', obra_id: 'o3', rubro_id: 'r1', periodo: '2026-10-01', monto_bruto: 5_000_000, estado_proyeccion: 'no_cumple' }
  assert.equal(calcular([noCumple]).find(f => f.obra_id === 'o3').saldoProyectado, 45_000_000)
})

test('cargar una factura no cambia la fecha de ninguna otra línea', () => {
  const antes = Object.fromEntries(calcular().map(f => [`${f.obra_id}|${f.rubro_id}`, f.fechaPago]))
  const facturas = PRES.slice(0, 6).map(p => ({ categoria: 'factura', tipo: 'egreso', obra_id: p.obra_id, rubro_id: p.rubro_id, periodo: p.periodo, monto_bruto: p.monto / 2, estado_proyeccion: 'normal' }))
  const despues = Object.fromEntries(calcular(facturas).map(f => [`${f.obra_id}|${f.rubro_id}`, f.fechaPago]))
  assert.deepEqual(despues, antes)
})

test('una línea totalmente facturada desaparece y el resto sigue en su día', () => {
  const total = { categoria: 'factura', tipo: 'egreso', obra_id: 'o2', rubro_id: 'r1', periodo: '2026-10-01', monto_bruto: 60_000_000, estado_proyeccion: 'normal' }
  const filas = calcular([total])
  assert.equal(filas.find(f => f.obra_id === 'o2' && f.rubro_id === 'r1'), undefined)
  assert.equal(filas.length, PRES.length - 1)
})

test('la fecha que Finanzas pone a mano manda y la línea no se reubica', () => {
  const fechas = [{ obra_id: 'o1', rubro_id: 'r1', periodo: '2026-10-01', fecha_estimada: '2026-12-15' }]
  const filas = calcular([], fechas)
  assert.equal(filas.find(f => f.obra_id === 'o1' && f.rubro_id === 'r1').fechaPago, '2026-12-15')
  // el resto sigue parejo en los 4 miércoles
  assert.equal(filas.filter(f => MIERCOLES_NOV.includes(f.fechaPago)).length, PRES.length - 1)
})

test('una línea cerrada por Finanzas no genera pago ni ocupa lugar', () => {
  const fechas = [{ obra_id: 'o1', rubro_id: 'r1', periodo: '2026-10-01', fecha_estimada: null, cerrado: true }]
  const filas = calcular([], fechas)
  assert.equal(filas.find(f => f.obra_id === 'o1' && f.rubro_id === 'r1'), undefined)
  const total = PRES.reduce((s, p) => s + p.monto, 0) - 80_000_000
  assert.equal(filas.reduce((s, f) => s + f.saldoProyectado, 0), total)
})

test('el pago a 30 días también corre para noviembre (se paga en los miércoles de diciembre)', () => {
  const pres = PRES.map(p => ({ ...p, periodo: '2026-11-01' }))
  const filas = calcular([], [], pres)
  const miercolesDic = ['2026-12-02', '2026-12-09', '2026-12-16', '2026-12-23']
  filas.forEach(f => assert.ok(miercolesDic.includes(f.fechaPago), `${f.fechaPago}`))
})

test('la obra 678 · Subcontratos de octubre sigue dividida en 5 partes iguales (4 miércoles de noviembre + 2/12)', () => {
  const obras = [...OBRAS, { id: '70be9f6d-fc01-423a-a978-24ec9f8cbe27' }]
  const pres = [
    { obra_id: '70be9f6d-fc01-423a-a978-24ec9f8cbe27', rubro_id: '9a94f4be-7ea9-49a3-ad21-823e72dedaab', periodo: '2026-10-01', monto: 241_412_500 },
    ...PRES,
  ]
  const filas = calcularGastosProyectados(pres, [], [], obras, HOY)
  const partes = filas.filter(f => f.partes === 5).sort((a, b) => a.parte - b.parte)
  assert.deepEqual(partes.map(f => f.fechaPago), [...MIERCOLES_NOV, '2026-12-02'])
  assert.equal(centavos(partes.reduce((s, f) => s + f.saldoProyectado, 0)), centavos(241_412_500))
  // el resto compensa: cada miércoles de noviembre sigue parejo contando esas partes
  const total = filas.reduce((s, f) => s + f.saldoProyectado, 0)
  const noviembre = MIERCOLES_NOV.map(d => porFecha(filas)[d] ?? 0)
  const promedio = noviembre.reduce((s, x) => s + x, 0) / 4
  noviembre.forEach(m => assert.ok(Math.abs(m - promedio) <= 12_000_000, `miércoles con ${m} (promedio ${promedio}, total ${total})`))
})
