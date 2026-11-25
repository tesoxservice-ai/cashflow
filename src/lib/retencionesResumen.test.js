// Pruebas de las retenciones a favor (saldo, proyección por mes y cuánto se paga). Correr con: npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TIPOS, GRUPOS, tipoDeRetencion, proyectarRetenciones, sumaHastaMes, resumenPorTipo, resumenImpuestos, ordenarSaldos, proximosMeses, grupoDeTipo,
} from './retencionesResumen.js'
import { PERFILES_RETENCION } from './retencionesClientes.js'
import { combinarConProyeccion } from './proyeccionPresupuesto.js'

const HOY = new Date(2026, 10, 25)
const M = 1_000_000
const venta = (id, fecha, monto, extra = {}) => ({ id, tipo: 'ingreso', categoria: 'ingreso_cliente', estado: 'proyectado', estado_proyeccion: 'normal', fecha_pago: fecha, monto_bruto: monto, montoEfectivo: monto, proveedor_cliente: null, ...extra })

test('tipoDeRetencion reconoce cada retención de los perfiles por su clave o su nombre', () => {
  const esperado = { iva: 'iva', ganancias: 'ganancias', iibb_caba: 'iibb_caba', iibb_sf: 'iibb_sf', iibb_otras: 'iibb_otras', iibb_misiones: 'iibb_otras', iibb_pba: 'iibb_pba', suss: 'suss' }
  PERFILES_RETENCION.flatMap(p => p.retenciones).forEach(it => assert.equal(tipoDeRetencion(it), esperado[it.clave], it.clave))
  assert.equal(tipoDeRetencion({ clave: 'x', etiqueta: 'IIBB Córdoba' }), 'iibb_otras')
  assert.equal(tipoDeRetencion({ clave: 'x', etiqueta: 'Retención de IVA especial' }), 'iva')
  assert.equal(tipoDeRetencion({ clave: 'x', etiqueta: 'Retención IIBB Santa Fe' }), 'iibb_sf')
  assert.equal(tipoDeRetencion({ clave: 'x', etiqueta: 'Ganancias extra', esIVA: false }), 'ganancias')
  assert.equal(tipoDeRetencion({ clave: 'x', etiqueta: 'Sellos' }), 'otras')
  assert.equal(tipoDeRetencion({ clave: 'x', etiqueta: 'Retención X', esIVA: true }), 'iva')
})

test('cada tipo pertenece a un impuesto que se paga: todas las IIBB juntas, y todos los tipos tienen grupo', () => {
  TIPOS.forEach(t => assert.ok(GRUPOS.some(g => g.clave === t.grupo), t.clave))
  assert.equal(grupoDeTipo('iibb_sf'), 'iibb')
  assert.equal(grupoDeTipo('iibb_caba'), 'iibb')
  assert.equal(grupoDeTipo('iva'), 'iva')
  assert.equal(grupoDeTipo('desconocido'), 'otras')
})

test('proyectarRetenciones junta por mes y por tipo lo que van a retener las ventas pendientes, y la suma coincide con el detalle de cada venta', () => {
  const filas = combinarConProyeccion([
    venta('a', '2026-12-10', 121 * M, { proveedor_cliente: 'NEC ARGENTINA SOCIEDAD ANONIMA' }),
    venta('b', '2026-12-20', 121 * M, { proveedor_cliente: 'NEC ARGENTINA SOCIEDAD ANONIMA' }),
    venta('c', '2027-01-15', 121 * M, { proveedor_cliente: 'TELEDIFUSORA SA' }),
    venta('d', '2026-12-05', 100 * M, { proveedor_cliente: 'NEC', estado: 'ejecutado' }), // ya cobrada: no cuenta
  ], [], [], [], [], [], [], HOY)
  const p = proyectarRetenciones(filas)
  assert.equal(p.ventas, 3)
  assert.deepEqual(Object.keys(p.meses).sort(), ['2026-12', '2027-01'])
  assert.equal(p.meses['2026-12'].iva, 33.6 * M)        // 2 ventas de NEC x 16,8
  assert.equal(p.meses['2026-12'].ganancias, 4 * M)     // 2 x 2
  assert.equal(p.meses['2027-01'].iibb_sf, 5.445 * M)   // Teledifusora: 4,5% de 121
  assert.equal(p.meses['2027-01'].iva, undefined)       // Teledifusora no retiene IVA
  const total = Object.values(p.meses).flatMap(t => Object.values(t)).reduce((s, v) => s + v, 0)
  const detalle = filas.filter(m => m._retenciones).reduce((s, m) => s + m._retenciones.totalRetenido, 0)
  assert.ok(Math.abs(total - detalle) < 0.05)
  assert.equal(Object.keys(p.porCliente).sort().join(), 'NEC,Teledifusora')
  assert.equal(p.porCliente.NEC.ventas, 2)
  assert.equal(p.porCliente.NEC.iva, 33.6 * M)
})

test('sin ventas pendientes o sin filas no hay nada que proyectar y no se rompe', () => {
  assert.deepEqual(proyectarRetenciones([]), { meses: {}, porCliente: {}, ventas: 0 })
  assert.deepEqual(proyectarRetenciones(null), { meses: {}, porCliente: {}, ventas: 0 })
  assert.equal(proyectarRetenciones([{ tipo: 'egreso', fecha_pago: '2026-12-10' }]).ventas, 0)
})

test('sumaHastaMes suma hasta el mes elegido inclusive; sin mes, todo', () => {
  const meses = { '2026-12': { iva: 10, ganancias: 2 }, '2027-01': { iva: 5 }, '2027-02': { iva: 1 } }
  assert.deepEqual(sumaHastaMes(meses, '2026-12'), { iva: 10, ganancias: 2 })
  assert.deepEqual(sumaHastaMes(meses, '2027-01'), { iva: 15, ganancias: 2 })
  assert.deepEqual(sumaHastaMes(meses, null), { iva: 16, ganancias: 2 })
  assert.deepEqual(sumaHastaMes(meses, '2026-11'), {})
})

test('resumenPorTipo: hoy + lo que se suma = proyectado, para todos los tipos', () => {
  const meses = { '2026-12': { iva: 10 * M, iibb_sf: 3 * M }, '2027-01': { iva: 5 * M } }
  const r = resumenPorTipo({ iva: 700 * M, iibb_sf: 140 * M, ganancias: 142 * M }, meses, '2026-12')
  const iva = r.find(t => t.clave === 'iva'), sf = r.find(t => t.clave === 'iibb_sf'), gan = r.find(t => t.clave === 'ganancias')
  assert.equal(iva.proyectado, 710 * M)
  assert.equal(sf.proyectado, 143 * M)
  assert.equal(gan.seSuma, 0)
  assert.equal(gan.proyectado, 142 * M)
  assert.equal(r.length, TIPOS.length)
  assert.equal(resumenPorTipo({}, {}, null).every(t => t.hoy === 0 && t.proyectado === 0), true) // sin datos, todo en cero
})

test('resumenImpuestos: lo que se debe menos las retenciones del MISMO tipo; positivo = a pagar, negativo = sobra a favor', () => {
  const filas = resumenPorTipo({ iva: 100 * M, iibb_sf: 30 * M, iibb_caba: 10 * M, ganancias: 5 * M }, {}, null)
  const r = Object.fromEntries(resumenImpuestos(filas, { iva: 97.4 * M, iibb_sf: 49 * M, iibb_caba: 2 * M, ganancias: 20 * M }).map(x => [x.clave, x]))
  assert.equal(r.iva.resultado, -2.6 * M)      // tengo 100 a favor y debo 97,4: me sobran 2,6
  assert.equal(r.iva.estado, 'a_favor')
  assert.equal(r.iibb_sf.resultado, 19 * M)    // debo 49 en Santa Fe y tengo 30 a favor ahí: pago 19
  assert.equal(r.iibb_sf.estado, 'pagar')
  assert.equal(r.iibb_caba.resultado, -8 * M)  // lo de Capital NO se usa para pagar Santa Fe
  assert.equal(r.ganancias.resultado, 15 * M)
  assert.equal(r.suss.estado, 'parejo')
  assert.equal(Object.keys(r).length, TIPOS.length)
})

test('ordenarSaldos separa saldos y deudas, toma la fecha más nueva e ignora lo mal formado', () => {
  const o = ordenarSaldos([
    { clave: 'saldo:iva', monto: '729932441.66', fecha: '2026-11-24', nota: 'Mayor 113051' },
    { clave: 'saldo:ganancias', monto: 142746148.18, fecha: '2026-11-20' },
    { clave: 'pagar:iva', monto: 97407239.52, fecha: '2026-11-24' },
    { clave: 'pagar:iibb_sf', monto: 'no es número', fecha: '2026-11-24' },
    { clave: 'rarisimo', monto: 5 }, { clave: 'otro:x', monto: 5 }, null,
  ].filter(Boolean))
  assert.equal(o.saldos.iva, 729932441.66)
  assert.equal(o.saldos.ganancias, 142746148.18)
  assert.equal(o.pagar.iva, 97407239.52)
  assert.equal(o.pagar.iibb_sf, undefined)
  assert.equal(o.fechaDato, '2026-11-24')
  assert.equal(o.notas['saldo:iva'], 'Mayor 113051')
  assert.deepEqual(ordenarSaldos(null), { saldos: {}, pagar: {}, fechaDato: null, notas: {} })
})

test('proximosMeses arranca en el mes de hoy y pasa de año', () => {
  const m = proximosMeses(new Date(2026, 10, 25), 4)
  assert.deepEqual(m, ['2026-11', '2026-12', '2027-01', '2027-02'])
})
