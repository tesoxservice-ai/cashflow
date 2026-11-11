// Pruebas del gasto proyectado (reparto en miércoles y descuento por facturas). Correr con: npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularGastosProyectados, calcularVentasProyectadas, normalizarPartes } from './proyeccionPresupuesto.js'

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

// ─── División manual en partes (gasto y venta) ───────────────────────────────────────────────────

const LINEA = { obra_id: 'o1', rubro_id: 'r1', periodo: '2026-10-01' }
const presUna = [{ ...LINEA, monto: 100_000 }]
const dividida = partes => [{ ...LINEA, fecha_estimada: null, cerrado: false, partes }]
const suma = filas => filas.reduce((s, f) => s + f.saldoProyectado, 0)

test('gasto: una línea de 100.000 dividida 50 y 50 da dos filas de 50.000 en sus fechas', () => {
  const filas = calcularGastosProyectados(presUna, [], dividida([{ porcentaje: 50, fecha: '2026-11-18' }, { porcentaje: 50, fecha: '2026-12-02' }]), OBRAS, HOY)
  assert.deepEqual(filas.map(f => [f.fechaPago, f.saldoProyectado]), [['2026-11-18', 50_000], ['2026-12-02', 50_000]])
  assert.deepEqual(filas.map(f => [f.parte, f.partes]), [[1, 2], [2, 2]])
})

test('gasto: 25 / 25 / 25 / 25 y también partes desparejas (70 / 30)', () => {
  const cuatro = [4, 11, 18, 25].map(d => ({ porcentaje: 25, fecha: `2026-11-${String(d).padStart(2, '0')}` }))
  const f4 = calcularGastosProyectados(presUna, [], dividida(cuatro), OBRAS, HOY)
  assert.deepEqual(f4.map(f => f.saldoProyectado), [25_000, 25_000, 25_000, 25_000])
  const f2 = calcularGastosProyectados(presUna, [], dividida([{ porcentaje: 70, fecha: '2026-11-11' }, { porcentaje: 30, fecha: '2026-11-25' }]), OBRAS, HOY)
  assert.deepEqual(f2.map(f => f.saldoProyectado), [70_000, 30_000])
})

test('gasto: una factura sigue descontando y baja todas las partes en proporción', () => {
  const partes = [{ porcentaje: 50, fecha: '2026-11-18' }, { porcentaje: 50, fecha: '2026-12-02' }]
  const factura = { categoria: 'factura', tipo: 'egreso', ...LINEA, monto_bruto: 40_000, estado_proyeccion: 'normal' }
  const filas = calcularGastosProyectados(presUna, [factura], dividida(partes), OBRAS, HOY)
  assert.deepEqual(filas.map(f => f.saldoProyectado), [30_000, 30_000]) // 100.000 - 40.000 = 60.000 repartido 50 y 50
  assert.equal(filas[0].gastoReal, 40_000)
})

test('gasto: el reparto es exacto al centavo con porcentajes que no dividen parejo', () => {
  const tres = [{ porcentaje: 33.33, fecha: '2026-11-04' }, { porcentaje: 33.33, fecha: '2026-11-11' }, { porcentaje: 33.34, fecha: '2026-11-18' }]
  const pres = [{ ...LINEA, monto: 1_000_000.01 }]
  const factura = { categoria: 'factura', tipo: 'egreso', ...LINEA, monto_bruto: 123_456.78, estado_proyeccion: 'normal' }
  const filas = calcularGastosProyectados(pres, [factura], dividida(tres), OBRAS, HOY)
  assert.equal(centavos(suma(filas)), centavos(1_000_000.01 - 123_456.78))
})

test('gasto: si se factura toda la línea desaparecen todas las partes; cerrar la proyección también', () => {
  const partes = [{ porcentaje: 50, fecha: '2026-11-18' }, { porcentaje: 50, fecha: '2026-12-02' }]
  const entera = { categoria: 'factura', tipo: 'egreso', ...LINEA, monto_bruto: 100_000, estado_proyeccion: 'normal' }
  assert.equal(calcularGastosProyectados(presUna, [entera], dividida(partes), OBRAS, HOY).length, 0)
  assert.equal(calcularGastosProyectados(presUna, [], [{ ...dividida(partes)[0], cerrado: true }], OBRAS, HOY).length, 0)
})

test('gasto: la división manda sobre una fecha única guardada y sobre la división fija de la 678', () => {
  const partes = [{ porcentaje: 50, fecha: '2026-11-18' }, { porcentaje: 50, fecha: '2026-12-02' }]
  const conFecha = [{ ...dividida(partes)[0], fecha_estimada: '2026-12-30' }]
  assert.deepEqual(calcularGastosProyectados(presUna, [], conFecha, OBRAS, HOY).map(f => f.fechaPago), ['2026-11-18', '2026-12-02'])
  const o678 = '70be9f6d-fc01-423a-a978-24ec9f8cbe27', r678 = '9a94f4be-7ea9-49a3-ad21-823e72dedaab'
  const pres678 = [{ obra_id: o678, rubro_id: r678, periodo: '2026-10-01', monto: 200_000 }]
  const fechas = [{ obra_id: o678, rubro_id: r678, periodo: '2026-10-01', partes: [{ porcentaje: 60, fecha: '2026-11-11' }, { porcentaje: 40, fecha: '2026-11-25' }] }]
  const filas = calcularGastosProyectados(pres678, [], fechas, [{ id: o678 }], HOY)
  assert.deepEqual(filas.map(f => [f.fechaPago, f.saldoProyectado]), [['2026-11-11', 120_000], ['2026-11-25', 80_000]])
})

test('gasto: las partes cuentan como carga fija de su día y el resto se acomoda alrededor', () => {
  // $ 60 M del rubro dividido caen el 4/11: ese día recibe menos del resto de las líneas
  const pres = [{ ...LINEA, monto: 120_000_000 }, ...PRES.filter(p => !(p.obra_id === 'o1' && p.rubro_id === 'r1'))]
  const partes = [{ porcentaje: 50, fecha: '2026-11-04' }, { porcentaje: 50, fecha: '2026-12-16' }]
  const filas = calcularGastosProyectados(pres, [], dividida(partes), OBRAS, HOY).filter(f => !f.parte)
  const proy = porFecha(filas)
  assert.ok((proy['2026-11-04'] ?? 0) < (proy['2026-11-11'] ?? 0), `el 4/11 quedó con ${proy['2026-11-04']} y el 11/11 con ${proy['2026-11-11']}`)
})

test('una división mal formada se ignora: la línea sigue entera y no se pierde plata', () => {
  const malas = [
    [{ porcentaje: 50, fecha: '2026-11-18' }, { porcentaje: 40, fecha: '2026-12-02' }], // suma 90
    [{ porcentaje: 100, fecha: '2026-11-18' }], // una sola parte
    [{ porcentaje: 60, fecha: '2026-11-18' }, { porcentaje: 40, fecha: 'mañana' }], // fecha inválida
    [{ porcentaje: 120, fecha: '2026-11-18' }, { porcentaje: -20, fecha: '2026-12-02' }], // negativo
    'no es una lista',
  ]
  malas.forEach(partes => {
    assert.equal(normalizarPartes(partes), null)
    const filas = calcularGastosProyectados(presUna, [], dividida(partes), OBRAS, HOY)
    assert.equal(filas.length, 1)
    assert.equal(filas[0].saldoProyectado, 100_000)
  })
})

test('venta: la división se reparte por porcentaje, descuenta las ventas reales y cada parte tiene su fecha', () => {
  const ventas = [{ obra_id: 'o1', periodo: '2026-10-01', monto: 100_000 }]
  const fechas = [{ obra_id: 'o1', periodo: '2026-10-01', fecha_estimada: null, cerrado: false, concepto: 'Anticipo',
    partes: [{ porcentaje: 25, fecha: '2026-11-16' }, { porcentaje: 25, fecha: '2026-12-16' }, { porcentaje: 50, fecha: '2027-01-18' }] }]
  const filas = calcularVentasProyectadas(ventas, [], fechas, OBRAS, HOY)
  assert.deepEqual(filas.map(f => [f.fechaPago, f.saldoProyectado]), [['2026-11-16', 25_000], ['2026-12-16', 25_000], ['2027-01-18', 50_000]])
  assert.ok(filas.every(f => f.concepto === 'Anticipo' && f.afectaCashflow))
  // una venta real de 20.000 baja las tres partes en proporción
  const real = { categoria: 'ingreso_cliente', tipo: 'ingreso', obra_id: 'o1', periodo: '2026-10-01', monto_bruto: 20_000, estado_proyeccion: 'normal' }
  const conReal = calcularVentasProyectadas(ventas, [real], fechas, OBRAS, HOY)
  assert.deepEqual(conReal.map(f => f.saldoProyectado), [20_000, 20_000, 40_000])
  // si se cobra todo, desaparecen
  const todo = { ...real, monto_bruto: 100_000 }
  assert.equal(calcularVentasProyectadas(ventas, [todo], fechas, OBRAS, HOY).length, 0)
})

test('venta: la división manda sobre la fecha única; una parte vieja no afecta el saldo', () => {
  const ventas = [{ obra_id: 'o1', periodo: '2026-10-01', monto: 100_000 }]
  const fechas = [{ obra_id: 'o1', periodo: '2026-10-01', fecha_estimada: '2027-03-01',
    partes: [{ porcentaje: 50, fecha: '2026-09-15' }, { porcentaje: 50, fecha: '2026-11-16' }] }]
  const filas = calcularVentasProyectadas(ventas, [], fechas, OBRAS, HOY)
  assert.deepEqual(filas.map(f => [f.fechaPago, f.afectaCashflow]), [['2026-09-15', false], ['2026-11-16', true]])
})
