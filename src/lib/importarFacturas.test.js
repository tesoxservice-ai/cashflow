// Pruebas del importador de facturas. Correr con: npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { parsearTSV, detectarColumnas, parseMonto, parseFecha, parsePeriodo, normalizarFila, mismoProveedor,
  mismoNro, analizarPegado, resumir, avisoPresupuesto, construirMovimiento } from './importarFacturas.js'

const HOY = '2026-10-20'
const ENC = ['FACTURA', 'Ingresó FC', 'NRO FC', 'RUBRO', 'Periodo Facturado ', 'FF', 'Importe', 'DIAS COMPROMISO', 'ESTADO PAGO', 'Forma de pago', 'Estado', 'F.COMP', 'cash flow ', 'OBRA', 'APROBADOR'].join('\t')
// proveedor, nro, rubro, periodo, FF, importe, plazo, estadoPago, forma, aprobación, F.COMP, cash flow, obra
const fila = (prov, nro, rubro, per, ff, imp, ep, forma, apr, cf, obra) =>
  [prov, 'Jonatan', nro, rubro, per, ff, imp, '30', ep, forma, apr, cf, cf, obra, 'FURINI'].join('\t')
const OBRAS = { '680': 'o680', '678': 'o678', '677': 'o677', '2026': 'o2026', '2026-2': 'o2026-2', '659': 'o659' }
const RUBROS = { 'Subcontratos': 1, 'Materiales': 1, 'Otros Gastos Operativos': 1, 'Gastos Generales': 1, 'Vehículos': 1, 'Impuestos': 1 }
const opciones = { hoyISO: HOY, obrasPorCodigo: OBRAS, rubrosPorNombre: RUBROS }
const ex = (prov, nro, monto, obraCodigo, estado = 'proyectado', fecha_pago = '2026-10-21') =>
  ({ proveedor_cliente: prov, numero_factura: nro, monto_bruto: monto, obraCodigo, estado, fecha_pago })
const analizar = (texto, existentes = []) => analizarPegado(ENC + '\n' + texto, existentes, opciones).filas

test('lee montos en formato argentino y americano', () => {
  assert.equal(parseMonto('$1.441.412,50'), 1441412.5)
  assert.equal(parseMonto('$1,441,412.50'), 1441412.5)
  assert.equal(parseMonto('$ 382.235,37'), 382235.37)
  assert.equal(parseMonto('$244,855.54'), 244855.54)
  assert.equal(parseMonto('4.600.000'), 4600000)
  assert.equal(parseMonto('4600000'), 4600000)
  assert.equal(parseMonto('12,50'), 12.5)
  assert.equal(parseMonto('#####'), null)
  assert.equal(parseMonto(''), null)
})

test('lee fechas con año de 2 o 4 dígitos', () => {
  assert.equal(parseFecha('21/10/26'), '2026-10-21')
  assert.equal(parseFecha('1/10/2026'), '2026-10-01')
  assert.equal(parseFecha('2026-10-21'), '2026-10-21')
  assert.equal(parseFecha('31/02/26'), null)
  assert.equal(parseFecha('#####'), null)
})

test('deduce el año del período a partir de la fecha de la factura', () => {
  assert.equal(parsePeriodo('SEPTIEMBRE', '2026-10-06'), '2026-09-01')
  assert.equal(parsePeriodo('DICIEMBRE', '2027-01-05'), '2026-12-01')
  assert.equal(parsePeriodo('ENERO', '2026-12-30'), '2027-01-01')
  assert.equal(parsePeriodo('septiembre 2026'), '2026-09-01')
  assert.equal(parsePeriodo('2026-09'), '2026-09-01')
  assert.equal(parsePeriodo('FOO', '2026-10-06'), null)
})

test('lee el TSV de Excel, incluidas celdas entre comillas', () => {
  const f = parsearTSV('a\tb\t"c\nd"\n1\t2\t3\n')
  assert.deepEqual(f, [['a', 'b', 'c\nd'], ['1', '2', '3']])
})

test('reconoce el encabezado por nombre aunque falten columnas o cambie el orden', () => {
  const { mapa, conEncabezado, datos } = detectarColumnas(parsearTSV('Importe\tFACTURA\tOBRA\n100\tX\t678'))
  assert.equal(conEncabezado, true)
  assert.deepEqual([mapa.monto, mapa.proveedor, mapa.obra], [0, 1, 2])
  assert.equal(datos.length, 1)
})

test('sin encabezado asume el orden de la hoja (A-O)', () => {
  const { mapa, conEncabezado } = detectarColumnas(parsearTSV(fila('X', '1-1', 'MATERIALES', 'OCTUBRE', '1/10/26', '$100', 'PENDIENTE', 'TRF', 'Aprobada', '4/11/26', '678')))
  assert.equal(conEncabezado, false)
  assert.equal(mapa.fechaPago, 12)
  assert.equal(mapa.obra, 13)
})

test('una factura pendiente que no está cargada queda en verde (nueva)', () => {
  const [f] = analizar(fila('BERKLEY', '5-0703738', 'GASTOS OPERATIVOS', 'SEPTIEMBRE', '30/09/26', '$83,008.93', 'PENDIENTE', 'TRF', 'Aprobada', '28/10/26', '678'))
  assert.equal(f.estado, 'nueva')
  assert.equal(f.rubro, 'Otros Gastos Operativos')
  assert.equal(f.periodo, '2026-09-01')
  assert.equal(f.fechaPago, '2026-10-28')
  assert.equal(f.monto, 83008.93)
})

test('mismo proveedor, número, obra e importe: ya cargada (rojo)', () => {
  const [f] = analizar(fila('LUNA INDUMENTARIA', '3-12244', 'EPP', 'SEPTIEMBRE', '17/09/26', '$1,441,412.50', 'PENDIENTE', 'TRF', 'Aprobada', '21/10/26', '2026'),
    [ex('LUNA INDUMENTARIA', '3-12244', 1441412.5, '2026')])
  assert.equal(f.estado, 'cargada')
})

test('el proveedor se reconoce aunque esté escrito distinto', () => {
  assert.ok(mismoProveedor('FEITO DANIEL', 'DANIEL FEITO'))
  assert.ok(mismoProveedor('DOS.H SRL', 'DOS HS SRL'))
  assert.ok(mismoProveedor('MB LOGISTICA S. A. S.', 'MB LOGISTICA S. A.'))
  assert.ok(!mismoProveedor('LEGUIZA JULIO', 'LEGUIZA LEANDRO'))
  assert.ok(!mismoProveedor('WICOM', 'PLANEX'))
})

test('el número de factura tolera lo que Excel hace con 7-3909', () => {
  assert.equal(mismoNro('jul-09', '7-3909'), true)
  assert.equal(mismoNro('2-15', 'feb-15'), true)
  assert.equal(mismoNro('1-532', '1-536'), false)
  assert.equal(mismoNro(null, '1-536'), null)
})

test('mismo importe pero distinto número NO es duplicada (WICOM repite importes)', () => {
  const [f] = analizar(fila('WICOM', '1-536', 'SUBCONTRATO', 'SEPTIEMBRE', '07/10/26', '$7,260,000.00', 'PENDIENTE', 'TRF', 'Aprobada', '11/11/26', '659'),
    [ex('WICOM', '1-532', 7260000, '659')])
  assert.equal(f.estado, 'nueva')
  assert.ok(f.motivos.some(m => /otro número|distinto número/.test(m)))
})

test('mismo número con otro importe se manda a revisión, no se descarta', () => {
  const [f] = analizar(fila('LUNA INDUMENTARIA', '3-12325', 'EPP', 'SEPTIEMBRE', '26/09/26', '$2,000,000.00', 'PENDIENTE', 'TRF', 'Aprobada', '28/10/26', '677'),
    [ex('LUNA INDUMENTARIA', '3-12325', 1890293.46, '677')])
  assert.equal(f.estado, 'revisar')
})

test('una factura prorrateada en varias obras cuenta como ya cargada si suma el total', () => {
  const [f] = analizar(fila('LUNA INDUMENTARIA', '3-12325', 'EPP', 'SEPTIEMBRE', '26/09/26', '$1,890,293.46', 'PENDIENTE', 'TRF', 'Aprobada', '28/10/26', '677'),
    [ex('LUNA INDUMENTARIA', '3-12325', 1134176.08, '677'), ex('LUNA INDUMENTARIA', '3-12325', 567088.04, '658'), ex('LUNA INDUMENTARIA', '3-12325', 189029.34, '2026')])
  assert.equal(f.estado, 'cargada')
})

test('sin número: mismo proveedor, obra, importe y fecha de pago proyectada = ya cargada', () => {
  const [f] = analizar(fila('PUCHETA JONATAN', '', 'SUBCONTRATO', 'SEPTIEMBRE', '08/10/26', '$13,596,900.00', 'PENDIENTE', 'TRF', 'Aprobada', '11/11/26', '678'),
    [ex('PUCHETA JONATAN', null, 13596900, '678', 'proyectado', '2026-11-11')])
  assert.equal(f.estado, 'cargada')
})

test('sin número y sin certeza: queda en revisión (nunca se descarta sola)', () => {
  const [f] = analizar(fila('PUCHETA JONATAN', '', 'SUBCONTRATO', 'SEPTIEMBRE', '08/10/26', '$13,596,900.00', 'PENDIENTE', 'TRF', 'Aprobada', '11/11/26', '678'),
    [ex('PUCHETA JONATAN', null, 13596900, '678', 'proyectado', '2026-12-09')])
  assert.equal(f.estado, 'revisar')
})

test('una factura paga antes de que existiera la nueva no cuenta como duplicada', () => {
  const [f] = analizar(fila('AMCHAM', '2-55548', 'GASTOS OPERATIVOS', 'OCTUBRE', '01/10/26', '$335,737.00', 'PENDIENTE', 'TRF', 'Aprobada', '04/11/26', '2026'),
    [ex('AMCHAM', null, 335737, '2026', 'ejecutado', '2026-09-02')])
  assert.equal(f.estado, 'nueva')
})

test('la misma factura repetida en lo pegado: la segunda queda en rojo', () => {
  const l = fila('INGENIERIA BOGGIO', '20-107189', 'MATERIALES', 'SEPTIEMBRE', '25/09/26', '$27,366.09', 'PENDIENTE', 'TRF', 'Aprobada', '28/10/26', '678')
  const [a, b] = analizar(l + '\n' + l)
  assert.equal(a.estado, 'nueva')
  assert.equal(b.estado, 'cargada')
  assert.match(b.motivos[0], /Repetida/)
})

test('varias obras: no se asigna sola, va a revisión', () => {
  const [f] = analizar(fila('ARSAT', '1-1', 'SUBCONTRATO', 'SEPTIEMBRE', '01/10/26', '$100,000.00', 'PENDIENTE', 'TRF', 'Aprobada', '11/11/26', '648/2026'))
  assert.equal(f.estado, 'revisar')
  assert.equal(f.obraMultiple, true)
})

test('las ya pagadas (OK) y las sin estado de pago no se importan', () => {
  const r = analizar([
    fila('X', '1-1', 'MATERIALES', 'OCTUBRE', '01/10/26', '$100.00', 'OK', 'TRF', 'Aprobada', '21/10/26', '678'),
    fila('Y', '1-2', 'MATERIALES', 'OCTUBRE', '01/10/26', '$100.00', '', 'TRF', 'Aprobada', '21/10/26', '678'),
  ].join('\n'))
  assert.deepEqual(r.map(f => f.estado), ['omitida', 'omitida'])
})

test('datos inválidos o inexistentes en el sistema: error, no se importan', () => {
  const r = analizar([
    fila('A', '1-1', 'MATERIALES', 'OCTUBRE', '01/10/26', 'abc', 'PENDIENTE', 'TRF', 'Aprobada', '04/11/26', '678'),
    fila('B', '1-2', 'COSA RARA', 'OCTUBRE', '01/10/26', '$100.00', 'PENDIENTE', 'TRF', 'Aprobada', '04/11/26', '678'),
    fila('C', '1-3', 'MATERIALES', 'OCTUBRE', '01/10/26', '$100.00', 'PENDIENTE', 'TRF', 'Aprobada', '04/11/26', '999'),
    fila('D', '1-4', 'MATERIALES', 'OCTUBRE', '01/10/26', '$100.00', 'PENDIENTE', 'TRF', 'Aprobada', '', '678'),
  ].join('\n'))
  assert.deepEqual(r.map(f => f.estado), ['error', 'error', 'error', 'error'])
})

test('fecha de pago pasada, OP directa y prorrateo piden revisión', () => {
  const r = analizar([
    fila('P', '1-1', 'MATERIALES', 'OCTUBRE', '01/10/26', '$100.00', 'PENDIENTE', 'TRF', 'Aprobada', '14/01/26', '678'),
    fila('Banco provincia transferencia entre cuentas', '', 'GASTOS OPERATIVOS', 'SEPTIEMBRE', '27/03/26', '$4,600,000.00', 'PENDIENTE', 'TRF', 'OP DIRECTA', '09/12/26', '2026'),
    fila('OIME SANTA FE (30 % 2026-70% 658)', '2-23130', 'GASTOS OPERATIVOS', 'OCTUBRE', '12/10/26', '$590,964.00', 'PENDIENTE', 'TRF', 'Aprobada', '21/10/26', '2026'),
  ].join('\n'))
  assert.deepEqual(r.map(f => f.estado), ['revisar', 'revisar', 'revisar'])
})

test('la NC entre paréntesis pasa a observaciones y no ensucia el proveedor', () => {
  const [f] = analizar(fila('VAZQUEZ HNOS (SE APLICA LA NC 50-700)', '50-23811', 'MATERIALES', 'SEPTIEMBRE', '30/09/26', '$150,300.27', 'PENDIENTE', 'TRF', 'Aprobada', '04/11/26', '2026-2'))
  assert.equal(f.proveedor, 'VAZQUEZ HNOS')
  assert.equal(f.observaciones, 'Se aplica la NC 50-700')
  assert.equal(f.estado, 'nueva')
})

test('el resumen cuenta cada estado y suma solo las nuevas', () => {
  const r = resumir(analizar([
    fila('A', '1-1', 'MATERIALES', 'OCTUBRE', '01/10/26', '$100.00', 'PENDIENTE', 'TRF', 'Aprobada', '04/11/26', '678'),
    fila('B', '1-2', 'MATERIALES', 'OCTUBRE', '01/10/26', '$50.50', 'PENDIENTE', 'TRF', 'Aprobada', '04/11/26', '678'),
    fila('C', '1-3', 'MATERIALES', 'OCTUBRE', '01/10/26', '$10.00', 'OK', 'TRF', 'Aprobada', '04/11/26', '678'),
  ].join('\n')))
  assert.deepEqual([r.total, r.nueva, r.omitida, r.montoNuevas], [3, 2, 1, 150.5])
})

test('el movimiento a guardar tiene los mismos campos que el formulario Nuevo movimiento', () => {
  const [f] = analizar(fila('BERKLEY', '5-0703738', 'GASTOS OPERATIVOS', 'SEPTIEMBRE', '30/09/26', '$83,008.93', 'PENDIENTE', 'TRF', 'Aprobada', '28/10/26', '678'))
  const m = construirMovimiento(f, { obraId: 'O', rubroId: 'R', cuentaId: 'C', userId: 'U' })
  assert.deepEqual(m, { tipo: 'egreso', categoria: 'factura', periodo: '2026-09-01', cuenta_id: 'C', monto_bruto: 83008.93, estado: 'proyectado',
    created_by: 'U', proveedor_cliente: 'BERKLEY', numero_factura: '5-0703738', fecha_factura: '2026-09-30', obra_id: 'O', rubro_id: 'R',
    concepto: null, forma_pago: 'transferencia', numero_op: null, fecha_pago: '2026-10-28', observaciones: null })
})

test('avisa (sin bloquear) si la factura hace pasar al gasto real del presupuesto', () => {
  const [f] = analizar(fila('A', '1-1', 'MATERIALES', 'OCTUBRE', '01/10/26', '$600.00', 'PENDIENTE', 'TRF', 'Aprobada', '04/11/26', '678'))
  const pres = [{ obra_id: 'O', rubro_id: 'R', periodo: '2026-10-01', monto: 1000 }]
  const reales = [{ obra_id: 'O', rubro_id: 'R', periodo: '2026-10-01', monto_bruto: 500 }]
  assert.ok(avisoPresupuesto(f, 'O', 'R', pres, reales))
  assert.equal(avisoPresupuesto(f, 'O', 'R', pres, []), null)
  assert.equal(avisoPresupuesto(f, 'O', 'R', [], reales), null)
})

test('mismo número, importe y obra con el proveedor mal tipeado: ya cargada', () => {
  const [f] = analizar(fila('INGIENIERIA BOGGIO', '20-107189', 'MATERIALES', 'SEPTIEMBRE', '25/09/26', '$27,366.09', 'PENDIENTE', 'TRF', 'Aprobada', '28/10/26', '680'),
    [ex('INGENIERIA BOGGIO', '20-107189', 27366.09, '680', 'proyectado', '2026-10-28')])
  assert.equal(f.estado, 'cargada')
})

test('una factura que vence hoy sigue pendiente (no es "fecha pasada")', () => {
  const [hoy, ayer] = analizar([
    fila('P', '1-1', 'MATERIALES', 'OCTUBRE', '01/10/26', '$100.00', 'PENDIENTE', 'TRF', 'Aprobada', '20/10/26', '678'),
    fila('Q', '1-2', 'MATERIALES', 'OCTUBRE', '01/10/26', '$100.00', 'PENDIENTE', 'TRF', 'Aprobada', '19/10/26', '678'),
  ].join('\n'))
  assert.equal(hoy.estado, 'nueva')
  assert.equal(ayer.estado, 'revisar')
})

test('"MENOS NC xxx" en el proveedor pasa a observaciones y no ensucia el nombre', () => {
  const [f] = analizar(fila('SWISS MEDICAL MENOS NC 1020-918052', '1020-1134686', 'GASTOS OPERATIVOS', 'OCTUBRE', '01/10/26', '$427,859.08', 'PENDIENTE', 'TRF', 'Aprobada', '21/10/26', '2026'))
  assert.equal(f.proveedor, 'SWISS MEDICAL')
  assert.equal(f.observaciones, 'Menos NC 1020-918052')
})
