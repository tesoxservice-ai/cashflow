// Pruebas del cobro en neto (retenciones e impuestos aplicados) y de los ajustes editables. Correr con: npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  desgloseDeCobro, PERFILES_RETENCION, RETENCIONES_POR_CLIENTE, claveAjusteVenta, claveAjusteCliente, normalizarItems, mapaDeAjustes,
} from './retencionesClientes.js'
import { calcularImpuestosDeCobros, combinarConProyeccion, aplicarRetencionesNetas } from './proyeccionPresupuesto.js'

const HOY = new Date(2026, 10, 25)
const M = 1_000_000
const venta = (id, fecha, monto, extra = {}) => ({ id, tipo: 'ingreso', categoria: 'ingreso_cliente', estado: 'proyectado', estado_proyeccion: 'normal', fecha_pago: fecha, monto_bruto: monto, montoEfectivo: monto, proveedor_cliente: null, ...extra })
const perfil = clave => PERFILES_RETENCION.find(p => p.clave === clave)
const netas = (filas, ajustes = []) => aplicarRetencionesNetas(filas, HOY, ajustes)
const necFC = (extra = {}) => venta('n', '2026-12-10', 121 * M, { proveedor_cliente: 'NEC ARGENTINA SOCIEDAD ANONIMA', ...extra })

test('una venta de NEC pasa a su neto: factura menos retenciones menos impuestos del banco, y guarda el bruto y el detalle', () => {
  const original = necFC()
  const [m] = netas([original])
  const d = desgloseDeCobro(121 * M, perfil('nec'))
  assert.equal(m.montoEfectivo, d.disponible)
  assert.equal(m._brutoFC, 121 * M)
  assert.equal(m._retenciones.perfil, 'NEC')
  assert.equal(m._retenciones.fuente, 'estandar')
  assert.equal(m._retenciones.totalRetenido, 23.551 * M)
  assert.equal(m._retenciones.retenciones.length, 4)
  assert.equal(original.montoEfectivo, 121 * M) // el original no se toca
  assert.equal(original._retenciones, undefined)
})

test('no se aplican retenciones a lo ya cobrado, a lo que ya pasó, a lo "no se cumple" ni a lo que no suma en el saldo: vuelve el mismo objeto', () => {
  const filas = [
    necFC({ id: 'a', estado: 'ejecutado' }), necFC({ id: 'b', fecha_pago: '2026-11-20' }),
    necFC({ id: 'c', estado_proyeccion: 'no_cumple' }), necFC({ id: 'd', _afectaCashflow: false }),
    necFC({ id: 'e', monto_bruto: 0, montoEfectivo: 0 }), { id: 'f', tipo: 'egreso', categoria: 'factura', fecha_pago: '2026-12-10', montoEfectivo: 5 },
  ]
  netas(filas).forEach((m, i) => assert.equal(m, filas[i]))
  assert.equal(netas([necFC({ id: 'g', fecha_pago: '2026-11-25' })])[0]._brutoFC, 121 * M) // hoy sí
})

test('un cliente sin perfil usa el general (Ganancias 2% y SUSS 2% del total) y una venta proyectada usa el perfil de su obra', () => {
  const [raro] = netas([venta('r', '2026-12-10', 100 * M, { proveedor_cliente: 'CLIENTE DESCONOCIDO' })])
  assert.equal(raro._retenciones.perfilClave, 'general')
  assert.equal(raro._retenciones.totalRetenido, 4 * M)
  const [proy] = netas([venta('p', '2026-12-10', 121 * M, { categoria: 'venta_proyectada', obras: { codigo: '681' }, _claveFecha: { obra_id: 'o681', periodo: '2026-11-01' } })])
  assert.equal(proy._retenciones.perfil, 'Teledifusora')
})

test('ajustes editables: el de la venta manda sobre el del cliente, y el del cliente sobre el estándar', () => {
  const m = necFC()
  const ajustes = [
    { clave: claveAjusteCliente(perfil('nec')), retenciones: [{ clave: 'iibb_sf', etiqueta: 'Retención IIBB Santa Fe', base: 'total', tasa: 0.05 }], banco: null },
    { clave: claveAjusteVenta(m), retenciones: [{ clave: 'ganancias', etiqueta: 'Ganancias', base: 'neto', tasa: 0.02 }], banco: null },
  ]
  assert.equal(netas([m])[0]._retenciones.fuente, 'estandar')
  const soloCliente = netas([m], [ajustes[0]])[0]
  assert.equal(soloCliente._retenciones.fuente, 'cliente')
  assert.equal(soloCliente._retenciones.totalRetenido, 6.05 * M) // 5% de 121
  const conVenta = netas([m], ajustes)[0]
  assert.equal(conVenta._retenciones.fuente, 'venta')
  assert.equal(conVenta._retenciones.totalRetenido, 2 * M)     // solo Ganancias: 2% de 100
  // otra venta de NEC no se ve afectada por el ajuste de la primera
  assert.equal(netas([necFC({ id: 'otra' })], ajustes)[0]._retenciones.fuente, 'cliente')
})

test('claves de los ajustes: factura real por id, venta proyectada por obra + período, cliente por perfil', () => {
  assert.equal(claveAjusteVenta({ id: 'abc', categoria: 'ingreso_cliente' }), 'venta:fc:abc')
  assert.equal(claveAjusteVenta({ id: 'virtual-x|parte-2', categoria: 'venta_proyectada', _claveFecha: { obra_id: 'o1', periodo: '2026-11-01' } }), 'venta:vp:o1|2026-11-01')
  assert.equal(claveAjusteCliente(perfil('arsat')), 'cliente:arsat')
})

test('se puede agregar una retención, usar un monto fijo, cambiar el IIBB del banco o sacar todas las retenciones', () => {
  const m = venta('v', '2026-12-10', 121 * M, { proveedor_cliente: 'SILICA NETWORKS ARGENTINA S.A' })
  const ajuste = retenciones => [{ clave: claveAjusteVenta(m), retenciones, banco: null }]
  assert.equal(netas([m])[0]._retenciones.totalRetenido, 3 * M) // Ganancias 2 + IIBB Capital 1
  const agregada = netas([m], ajuste([...perfil('silica').retenciones, { clave: 'x', etiqueta: 'IIBB Córdoba', base: 'neto', tasa: 0.02 }]))[0]
  assert.equal(agregada._retenciones.totalRetenido, 5 * M)
  const fija = netas([m], ajuste([{ clave: 'f', etiqueta: 'Retención especial', base: 'monto', monto: 750_000 }]))[0]
  assert.equal(fija._retenciones.totalRetenido, 750_000)
  const sinNinguna = netas([m], ajuste([]))[0]
  assert.equal(sinNinguna._retenciones.totalRetenido, 0)
  const banco = netas([m], [{ clave: claveAjusteVenta(m), retenciones: null, banco: [{ clave: 'iibb_banco', etiqueta: 'IIBB banco', tasa: 0.05 }] }])[0]
  assert.equal(banco._retenciones.banco.find(b => b.clave === 'iibb_banco').tasa, 0.05)
})

test('un ajuste mal guardado se ignora y se usan los valores estándar: nunca desaparece plata', () => {
  const m = necFC()
  const roto = [{ clave: claveAjusteVenta(m), retenciones: [{ foo: 1 }, { etiqueta: '', base: 'neto', tasa: 0.1 }, { etiqueta: 'X', base: 'neto', tasa: 7 }], banco: 'basura' }]
  assert.equal(netas([m], roto)[0]._retenciones.totalRetenido, 23.551 * M)
  assert.equal(normalizarItems('no es lista'), null)
  assert.deepEqual(normalizarItems([{ etiqueta: 'A', base: 'neto', tasa: 0.5 }, { etiqueta: 'B', base: 'monto', monto: -1 }]).map(i => i.etiqueta), ['A'])
  assert.equal(mapaDeAjustes([{ clave: 'cliente:nec', retenciones: [] }, {}]).size, 1)
})

test('combinarConProyeccion: sin filas grises, una fila por venta ya en neto; el saldo resta lo mismo que restaban las filas', () => {
  const nec = necFC()
  const filas = combinarConProyeccion([nec], [], [], [], [], [], [], HOY)
  assert.equal(filas.filter(m => m._impuestoVenta).length, 0)
  assert.equal(filas.length, 1)
  const m = filas[0]
  assert.equal(Math.round((m._brutoFC - m.montoEfectivo) * 100) / 100, Math.round((m._retenciones.totalRetenido + m._retenciones.bancoImpuestos) * 100) / 100)
})

test('combinarConProyeccion recibe los ajustes de la base y los aplica', () => {
  const nec = necFC()
  const filas = combinarConProyeccion([nec], [], [], [], [], [], [], HOY, [{ clave: claveAjusteVenta(nec), retenciones: [], banco: [] }])
  assert.equal(filas[0].montoEfectivo, 121 * M) // sin retenciones ni impuestos
})

test('con activa = false vuelven las filas grises generales (7,6% para cualquier cliente) y la venta queda en bruto', () => {
  RETENCIONES_POR_CLIENTE.activa = false
  try {
    const x = venta('x', '2026-12-10', 100 * M, { proveedor_cliente: 'GIGARED S.A' })
    const filas = combinarConProyeccion([x], [], [], [], [], [], [], HOY)
    assert.equal(filas.filter(m => m._impuestoVenta).length, 4)
    assert.equal(filas.find(m => m.id === 'x').montoEfectivo, 100 * M)
    assert.equal(Math.round(calcularImpuestosDeCobros([x], HOY).reduce((s, g) => s + g.monto, 0)), 7.6 * M)
  } finally { RETENCIONES_POR_CLIENTE.activa = true }
})
