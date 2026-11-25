// Pruebas de las retenciones estimadas por cliente (piloto). Correr con: npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { perfilDeCobro, desgloseDeCobro, PERFILES_RETENCION } from './retencionesClientes.js'


const HOY = new Date(2026, 10, 25)
const M = 1_000_000
const venta = (id, fecha, monto, extra = {}) => ({ id, tipo: 'ingreso', categoria: 'ingreso_cliente', estado: 'proyectado', estado_proyeccion: 'normal', fecha_pago: fecha, monto_bruto: monto, montoEfectivo: monto, proveedor_cliente: null, ...extra })
const por = (d, clave) => [...d.retenciones, ...d.banco].find(r => r.clave === clave)?.monto
const perfil = clave => PERFILES_RETENCION.find(p => p.clave === clave)

test('NEC sobre una factura de $ 121 M: IVA 80% del IVA, Ganancias 2% y IIBB sobre el importe sin IVA (la cuenta del ejemplo)', () => {
  const d = desgloseDeCobro(121 * M, perfil('nec'))
  assert.equal(d.neto, 100 * M)
  assert.equal(d.iva, 21 * M)
  assert.equal(por(d, 'iva'), 16.8 * M)        // 80% de 21
  assert.equal(por(d, 'ganancias'), 2 * M)      // 2% de 100
  assert.equal(por(d, 'iibb_caba'), 1 * M)      // 1% de 100
  assert.equal(por(d, 'iibb_sf'), 3.751 * M)    // 3,1% de 121
  assert.equal(d.totalRetenido, 23.551 * M)   // 16,8 + 2 + 1 + 3,751 (19,5% del total)
  assert.equal(d.alBanco, 97.449 * M)
  assert.equal(por(d, 'iibb_banco'), 2.92347 * M) // 3% de lo que acredita
  assert.equal(d.disponible, Math.round((d.alBanco - d.bancoImpuestos) * 100) / 100)
})

test('el recibo real de NEC del 17/9/2026 ($ 241,6 M) da retenciones del mismo orden que las estimadas', () => {
  // Real: IVA 33,544 / Ganancias 3,992 / IIBB Capital 1,997 / IIBB Santa Fe 7,987 (suma 47,52 = 19,7%).
  const d = desgloseDeCobro(241.6 * M, perfil('nec'))
  assert.ok(Math.abs(por(d, 'iva') - 33.544 * M) < 0.3 * M)
  assert.ok(Math.abs(por(d, 'ganancias') - 3.992 * M) < 0.2 * M)
  assert.ok(Math.abs(d.totalRetenido - 47.52 * M) < 2 * M)
})

test('solo NEC retiene IVA: ningún otro perfil trae retención de IVA', () => {
  PERFILES_RETENCION.filter(p => p.clave !== 'nec').forEach(p => assert.ok(!p.retenciones.some(r => r.esIVA), p.clave))
  assert.ok(perfil('nec').retenciones.some(r => r.esIVA))
})

test('Teledifusora: Ganancias 2% sin IVA e IIBB Santa Fe 4,5% del total; ARSAT, Silica y Gigared según su tabla', () => {
  const t = desgloseDeCobro(121 * M, perfil('teledifusora'))
  assert.equal(por(t, 'ganancias'), 2 * M)
  assert.equal(por(t, 'iibb_sf'), 5.445 * M)
  const s = desgloseDeCobro(121 * M, perfil('silica'))
  assert.equal(s.totalRetenido, 3 * M)          // Ganancias 2 + IIBB Capital 1 sobre 100
  const g = desgloseDeCobro(121 * M, perfil('gigared'))
  assert.equal(por(g, 'iibb_misiones'), 1.96 * M)
  assert.equal(g.totalRetenido, 4.96 * M)       // 2 + 1 + 1,96
  const e = desgloseDeCobro(121 * M, perfil('esinel'))
  assert.equal(por(e, 'suss'), 1.2 * M)
})

test('los porcentajes efectivos estimados coinciden con los medidos en los recibos de septiembre a noviembre (sobre el total)', () => {
  const pct = clave => desgloseDeCobro(121 * M, perfil(clave)).totalRetenido / (121 * M) * 100
  // medido: NEC 19,3 · ARSAT 6,3 · Teledifusora 6,2 · Gigared 4,0 · Silica 2,4 · CPS 2,5 · Ministerio 6,9 · BGH 3,5
  const medido = { nec: 19.3, arsat: 6.3, teledifusora: 6.2, gigared: 4.0, silica: 2.4, cps: 2.5, ministerio: 6.9, bgh: 3.5 }
  Object.entries(medido).forEach(([clave, esperado]) => assert.ok(Math.abs(pct(clave) - esperado) < 0.8, `${clave}: ${pct(clave).toFixed(2)} vs ${esperado}`))
})

test('perfilDeCobro: por el nombre del cliente, y si no por la obra; sin datos devuelve null', () => {
  assert.equal(perfilDeCobro({ proveedor_cliente: 'NEC ARGENTINA SOCIEDAD ANONIMA' }).clave, 'nec')
  assert.equal(perfilDeCobro({ proveedor_cliente: 'EMPRESA ARGENTINA DE SOLUCIONES SATELITALES' }).clave, 'arsat')
  assert.equal(perfilDeCobro({ proveedor_cliente: 'GIGARED S.A' }).clave, 'gigared')
  assert.equal(perfilDeCobro({ proveedor_cliente: null, obras: { codigo: '677' } }).clave, 'nec')
  assert.equal(perfilDeCobro({ proveedor_cliente: null, obras: { codigo: '681' } }).clave, 'teledifusora')
  assert.equal(perfilDeCobro({ proveedor_cliente: 'OTRO CLIENTE', obras: { codigo: '999' } }), null)
  assert.equal(perfilDeCobro({ proveedor_cliente: 'OTRO CLIENTE' }), null)
})

