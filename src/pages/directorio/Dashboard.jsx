// pages/directorio/Dashboard.jsx
// Panel del rol "directorio": solo lectura. Muestra el Cash Flow desde
// el día de hoy en adelante (sin historial pasado) y Presupuesto vs. Real.
// Ruta: /directorio
//
// No tiene ninguna acción de alta/edición/borrado — es un tablero de
// consulta para el directorio de la empresa.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import GraficoCashflow from './GraficoCashflow'
import { BarraEscenarios, PanelFecha, AlertasEscenario } from './PanelEscenarios'
import { useEscenarios, useFimaDatos, construirBase, simular, opcionesMetrica, serieMetrica, COLORES_ESCENARIO } from './escenarios'
import { combinarConProyeccion } from '../../lib/proyeccionPresupuesto'
import {
  fmtARS, fmtFecha, hoyISO, fechaFutura,
  CARD, TONOS, Icono, ICONOS, ico, CardResumen,
} from './utilsDirectorio'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtPct = pct => `${pct.toFixed(1)}%`

function periodoActual() {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`
}

function labelPeriodo(fechaStr) {
  if (!fechaStr) return '—'
  const d = new Date(fechaStr + 'T00:00:00')
  const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// Desde diciembre de 2024 (fijo) hasta 24 meses después de hoy
function generarPeriodos() {
  const lista = []
  const hoy = new Date()
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 24, 1)
  for (let d = new Date(2024, 11, 1); d <= fin; d.setMonth(d.getMonth() + 1)) {
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    lista.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return lista
}
const PERIODOS = generarPeriodos()

const BADGE_CAT = {
  factura:           'bg-orange-50 text-orange-700',
  ingreso_cliente:   'bg-emerald-50 text-emerald-700',
  sueldo:            'bg-purple-50 text-purple-700',
  impuesto:          'bg-red-50 text-red-700',
  debito_automatico: 'bg-yellow-50 text-yellow-700',
  fima:              'bg-cyan-50 text-cyan-700',
  reintegro_impuestos: 'bg-teal-50 text-teal-700',
  reintegro_seguros:   'bg-teal-50 text-teal-700',
  reintegro_otros:     'bg-teal-50 text-teal-700',
  gasto_proyectado:  'bg-slate-50 text-slate-500 border border-dashed border-slate-300',
  venta_proyectada:  'bg-slate-50 text-slate-500 border border-dashed border-slate-300',
  otro:              'bg-slate-100 text-slate-600',
}
const LABEL_CAT = {
  factura:           'Factura',
  ingreso_cliente:   'Ventas',
  sueldo:            'Sueldo',
  impuesto:          'Impuesto',
  debito_automatico: 'Débito aut.',
  fima:              'FIMA',
  reintegro_impuestos: 'Reintegro impuestos',
  reintegro_seguros:   'Reintegro seguros',
  reintegro_otros:     'Otros reintegros',
  gasto_proyectado:  'Gasto proyectado (presupuesto)',
  venta_proyectada:  'Venta proyectada (sin registrar)',
  otro:              'Otro',
}
const CATEGORIAS_FILTRO = [
  { value: '',                  label: 'Todas' },
  { value: 'factura',           label: 'Factura' },
  { value: 'ingreso_cliente',   label: 'Ventas' },
  { value: 'sueldo',            label: 'Sueldo' },
  { value: 'impuesto',          label: 'Impuesto' },
  { value: 'debito_automatico', label: 'Débito automático' },
  { value: 'fima',              label: 'FIMA' },
  { value: 'reintegro_impuestos', label: 'Reintegro impuestos' },
  { value: 'reintegro_seguros',   label: 'Reintegro seguros' },
  { value: 'reintegro_otros',     label: 'Otros reintegros' },
  { value: 'gasto_proyectado',  label: 'Gasto proyectado (presupuesto)' },
  { value: 'venta_proyectada',  label: 'Venta proyectada (sin registrar)' },
  { value: 'otro',              label: 'Otro' },
]

// "octubre" (o "enero 2027" si no es el año en curso): mes del período al que corresponde un gasto proyectado.
function periodoCorto(periodoISO) {
  if (!periodoISO) return ''
  const d = new Date(periodoISO + 'T00:00:00')
  const mes = d.toLocaleDateString('es-AR', { month: 'long' })
  return d.getFullYear() === new Date().getFullYear() ? mes : `${mes} ${d.getFullYear()}`
}

function periodoDeStr(fechaStr) {
  if (!fechaStr) return null
  const d = new Date(fechaStr + 'T00:00:00')
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function ahora() {
  return new Date().toLocaleDateString('es-AR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ══════════════════════════════════════════════════════════════
// EXPORTAR A EXCEL — reporte prolijo con las mismas cifras que
// muestra el panel: Cash Flow desde hoy en adelante y Presupuesto
// vs. Real de todas las obras del mes en curso.
// XLSX se arma a mano (ZIP + XML) para no depender de librerías.
// ══════════════════════════════════════════════════════════════

async function cargarDatosExportDirectorio() {
  const hoy = hoyISO()
  const periodo = periodoActual()

  const [
    { data: movTodos,   error: e1 },
    { data: saldosData, error: e2 },
    { data: notasData,  error: e3 },
    { data: obrasData,  error: e4 },
    { data: rubrosData, error: e5 },
    { data: presData,   error: e6 },
    { data: movPeriodo, error: e7 },
    { data: presTodos,  error: e8 },
    { data: ventasProy, error: e9 },
    { data: fechasEstGasto, error: e10 },
    { data: fechasEstVenta, error: e11 },
  ] = await Promise.all([
    supabase.from('movimientos')
      .select('id,tipo,categoria,proveedor_cliente,numero_factura,monto_bruto,monto_neto,estado,periodo,fecha_pago,obra_id,rubro_id,concepto,estado_proyeccion')
      .order('fecha_pago', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
    supabase.from('saldos_iniciales').select('id,cuenta_id,monto,fecha,created_at')
      .order('fecha', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('notas').select('movimiento_id,tipo_nota,monto'),
    supabase.from('obras').select('id,codigo,nombre').eq('activa', true).order('codigo'),
    supabase.from('rubros').select('id,nombre'),
    supabase.from('presupuestos').select('id,obra_id,rubro_id,concepto,periodo,monto').eq('periodo', periodo),
    supabase.from('movimientos')
      .select('id,tipo,categoria,monto_bruto,obra_id,rubro_id,concepto,proveedor_cliente')
      .eq('periodo', periodo).eq('categoria', 'factura').eq('tipo', 'egreso'),
    supabase.from('presupuestos').select('id,obra_id,rubro_id,periodo,monto'),
    supabase.from('ventas_proyectadas').select('id,obra_id,periodo,monto,registrado'),
    supabase.from('gasto_proyectado_fecha_estimada').select('obra_id,rubro_id,periodo,fecha_estimada,cerrado'),
    supabase.from('venta_proyectada_fecha_estimada').select('obra_id,periodo,fecha_estimada,cerrado,concepto'),
  ])

  const errs = [e1, e2, e3, e4, e5, e6, e7, e8, e9, e10, e11].filter(Boolean)
  if (errs.length) throw new Error('No se pudieron cargar los datos para el Excel.')

  const obraMap  = {}; (obrasData  ?? []).forEach(o => obraMap[o.id]  = o)
  const rubroMap = {}; (rubrosData ?? []).forEach(r => rubroMap[r.id] = r)

  const notasPorMov = {}
  ;(notasData ?? []).forEach(n => {
    if (!notasPorMov[n.movimiento_id]) notasPorMov[n.movimiento_id] = []
    notasPorMov[n.movimiento_id].push(n)
  })

  const movEnriq = (movTodos ?? []).map(m => {
    const base  = m.estado === 'ejecutado' ? Number(m.monto_neto ?? m.monto_bruto ?? 0) : Number(m.monto_bruto ?? 0)
    const notas = notasPorMov[m.id] ?? []
    const deb   = notas.filter(n => n.tipo_nota === 'debito').reduce((s, n) => s + Number(n.monto), 0)
    const cred  = notas.filter(n => n.tipo_nota === 'credito').reduce((s, n) => s + Number(n.monto), 0)
    return {
      ...m,
      montoEfectivo: m.categoria === 'factura' ? base + deb - cred : base,
      obraCodigo: obraMap[m.obra_id]?.codigo ?? '',
    }
  })

  // Movimientos reales + filas virtuales de "gasto proyectado" (presupuesto sin
  // facturar) y "venta proyectada" (venta sin registrar) — ver src/lib/proyeccionPresupuesto.js.
  const movConProyeccion = combinarConProyeccion(movEnriq, presTodos ?? [], ventasProy ?? [], fechasEstGasto ?? [], fechasEstVenta ?? [], obrasData ?? [], rubrosData ?? [])
    .map(m => m._virtual
      ? { ...m, obraCodigo: m.obras?.codigo ?? '', concepto: m.categoria === 'venta_proyectada' ? `Venta proyectada de ${labelPeriodo(m.periodo)}${m._conceptoManual ? ' — ' + m._conceptoManual : ''}` : `${m.rubros?.nombre ?? 'Rubro'} — saldo sin facturar` }
      : m)

  const sumaSaldosBase = (saldosData ?? []).reduce((mapa, s) => {
    if (!mapa._vistos.has(s.cuenta_id)) { mapa._vistos.add(s.cuenta_id); mapa.total += Number(s.monto ?? 0) }
    return mapa
  }, { total: 0, _vistos: new Set() }).total

  let saldo = sumaSaldosBase
  const movConSaldo = movConProyeccion.map(m => {
    if (m.estado_proyeccion !== 'no_cumple' && m._afectaCashflow !== false) {
      saldo += m.tipo === 'ingreso' ? m.montoEfectivo : -m.montoEfectivo
    }
    return { ...m, saldoAcumulado: saldo }
  })

  let saldoHoy = sumaSaldosBase
  movConProyeccion.forEach(m => {
    const fecha = m.fecha_pago
    if (!fecha || fecha > hoy) return
    if (m.estado_proyeccion === 'no_cumple') return
    if (m._afectaCashflow === false) return
    saldoHoy += m.tipo === 'ingreso' ? m.montoEfectivo : -m.montoEfectivo
  })

  // Cash flow futuro (lo mismo que ve Directorio: desde hoy en adelante)
  const movFuturos = movConSaldo.filter(m => {
    const fecha = m.fecha_pago ?? m.periodo
    return fecha && fecha >= hoy
  })

  function posicionEn(fechaLimite) {
    let ultimo = sumaSaldosBase
    for (const m of movConSaldo) {
      const fecha = m.fecha_pago
      if (!fecha || fecha > fechaLimite) break
      ultimo = m.saldoAcumulado
    }
    return ultimo
  }
  const pos30 = posicionEn(fechaFutura(30))
  const pos60 = posicionEn(fechaFutura(60))
  const pos90 = posicionEn(fechaFutura(90))

  let puntoMax = null, puntoMin = null
  movFuturos.forEach(m => {
    if (!puntoMax || m.saldoAcumulado > puntoMax.saldoAcumulado) puntoMax = m
    if (!puntoMin || m.saldoAcumulado < puntoMin.saldoAcumulado) puntoMin = m
  })

  // Presupuesto vs Real — todas las obras, mes en curso. Se compara por
  // Obra + Rubro (el concepto que carga Operaciones no participa del
  // matching, para no fragmentar el mismo rubro en filas que nunca calzan).
  const presMap = {}, gastoMap = {}
  ;(presData ?? []).forEach(p => {
    const k = `${p.obra_id}|${p.rubro_id}`
    presMap[k] = (presMap[k] ?? 0) + Number(p.monto)
  })
  ;(movPeriodo ?? []).forEach(m => {
    const k = `${m.obra_id}|${m.rubro_id}`
    gastoMap[k] = (gastoMap[k] ?? 0) + Number(m.monto_bruto)
  })
  const todasClaves = new Set([...Object.keys(presMap), ...Object.keys(gastoMap)])
  const analisisPV = []
  todasClaves.forEach(k => {
    const [obraId, rubroId] = k.split('|')
    const presupuestado = presMap[k]  ?? 0
    const gastado       = gastoMap[k] ?? 0
    const diferencia    = presupuestado - gastado
    const pct           = presupuestado > 0 ? (gastado / presupuestado) * 100 : 0
    const semaforo      = presupuestado === 0 ? 'Sin presupuesto' : pct > 100 ? 'Superado' : pct >= 80 ? 'Atención' : 'OK'
    analisisPV.push({
      obraCodigo: obraMap[obraId]?.codigo ?? '', obraNombre: obraMap[obraId]?.nombre ?? '',
      rubroNombre: rubroMap[rubroId]?.nombre ?? 'Sin rubro',
      presupuestado, gastado, diferencia, pct, semaforo,
    })
  })
  analisisPV.sort((a, b) => a.obraCodigo.localeCompare(b.obraCodigo) || a.rubroNombre.localeCompare(b.rubroNombre))

  return { hoy, periodo, saldoHoy, pos30, pos60, pos90, puntoMax, puntoMin, movFuturos, analisisPV }
}

// XLSX helpers de bajo nivel (sin librerías externas)
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function colLetter(n) {
  let s = ''
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
  return s
}
function xlCell(col, row, value, styleId = 0, isNum = false) {
  const ref = `${col}${row}`
  if (value === null || value === undefined || value === '') return `<c r="${ref}" s="${styleId}"><v>0</v></c>`
  if (isNum) return `<c r="${ref}" t="n" s="${styleId}"><v>${value}</v></c>`
  return `<c r="${ref}" t="inlineStr" s="${styleId}"><is><t>${esc(value)}</t></is></c>`
}
function xlRow(rowNum, cells) {
  const celdas = cells.map((c, i) => xlCell(colLetter(i + 1), rowNum, c.v, c.s ?? 0, c.n ?? false))
  return `<row r="${rowNum}">${celdas.join('')}</row>`
}

const XL = {
  azulOscuro: 'FF1E40AF', azulClaro: 'FFBFDBFE', azulMuyClaro: 'FFDBEAFE',
  verde: 'FF059669', verdePastel: 'FFD1FAE5', verdeClaro: 'FFF0FFF4',
  rojo: 'FFDC2626', rojoPastel: 'FFFEE4E6', rojoClaro: 'FFFFE4E4',
  naranjaPast: 'FFFEF3C7', grisOscuro: 'FFE2E8F0', grisClaro: 'FFF1F5F9',
  grisMuyClaro: 'FFF8FAFC', blanco: 'FFFFFFFF', texto: 'FF0F172A', grisTexto: 'FF64748B',
}

const stylesXmlDirectorio = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="6">
    <font><sz val="10"/><color rgb="${XL.texto}"/><name val="Calibri"/></font>
    <font><sz val="10"/><b/><color rgb="${XL.blanco}"/><name val="Calibri"/></font>
    <font><sz val="10"/><b/><color rgb="${XL.azulOscuro}"/><name val="Calibri"/></font>
    <font><sz val="10"/><color rgb="${XL.verde}"/><name val="Calibri"/></font>
    <font><sz val="10"/><color rgb="${XL.rojo}"/><name val="Calibri"/></font>
    <font><sz val="12"/><b/><color rgb="${XL.texto}"/><name val="Calibri"/></font>
  </fonts>
  <fills count="14">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${XL.azulOscuro}"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${XL.azulClaro}"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${XL.verdePastel}"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${XL.rojoPastel}"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${XL.grisOscuro}"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${XL.azulMuyClaro}"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${XL.grisMuyClaro}"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${XL.naranjaPast}"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${XL.verdeClaro}"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${XL.rojoClaro}"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${XL.grisClaro}"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF9C4"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right><top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="20">
    <xf numFmtId="0" fontId="0" fillId="0"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2"  borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="4" fontId="0" fillId="0"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="4" fontId="3" fillId="0"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="4" fontId="4" fillId="0"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2"  borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="4" fontId="3" fillId="10" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="4" fontId="4" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="4" fontId="0" fillId="6"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="4" fontId="2" fillId="7"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="0" fontId="2" fillId="7"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="5" fillId="0"  borderId="0" xfId="0" applyFont="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="4" fontId="5" fillId="0"  borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="4" fontId="5" fillId="4"  borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="4" fontId="4" fillId="5"  borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="4"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="5"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="9"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="12" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment wrapText="1"/></xf>
    <xf numFmtId="9" fontId="0" fillId="0"  borderId="1" xfId="0" applyFont="1" applyBorder="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
  </cellXfs>
</styleSheet>`

const S = {
  normal: 0, cab: 1, num: 2, numVerde: 3, numRojo: 4, sep: 5, numVerdeRow: 6, numRojoRow: 7,
  subtotal: 8, total: 9, totalTxt: 10, kpiLabel: 11, kpiNum: 12, kpiVerde: 13, kpiRojo: 14,
  rowVerde: 15, rowRojo: 16, rowNaranja: 17, rowGris: 18, pct: 19,
}

function generarExcelDirectorio(datos) {
  // ── Hoja 1: Cash Flow ──────────────────────────────────────
  const h1 = []
  let r = 1
  h1.push(`<row r="${r}"><c r="A${r}" t="inlineStr" s="${S.cab}"><is><t>CASH FLOW — DESDE ${esc(fmtFecha(datos.hoy).toUpperCase())} EN ADELANTE</t></is></c></row>`); r++
  h1.push(`<row r="${r}"><c r="A${r}" t="inlineStr" s="${S.normal}"><is><t>Generado: ${esc(ahora())}</t></is></c></row>`); r++
  r++

  h1.push(xlRow(r, [
    { v: 'Saldo disponible hoy', s: S.kpiLabel }, { v: '', s: S.kpiLabel },
    { v: 'Posición a 90 días',   s: S.kpiLabel }, { v: '', s: S.kpiLabel },
    { v: 'Punto más alto',       s: S.kpiLabel }, { v: '', s: S.kpiLabel },
    { v: 'Punto más bajo',       s: S.kpiLabel },
  ])); r++
  h1.push(xlRow(r, [
    { v: datos.saldoHoy, s: S.kpiNum, n: true }, { v: '', s: 0 },
    { v: datos.pos90, s: datos.pos90 >= 0 ? S.kpiVerde : S.kpiRojo, n: true }, { v: '', s: 0 },
    { v: datos.puntoMax?.saldoAcumulado ?? 0, s: S.kpiVerde, n: true }, { v: '', s: 0 },
    { v: datos.puntoMin?.saldoAcumulado ?? 0, s: (datos.puntoMin?.saldoAcumulado ?? 0) >= 0 ? S.kpiVerde : S.kpiRojo, n: true },
  ])); r++
  r++

  h1.push(xlRow(r, [
    { v: 'Fecha pago', s: S.cab }, { v: 'Estado', s: S.cab }, { v: 'Categoría', s: S.cab },
    { v: 'Proveedor / Cliente', s: S.cab }, { v: 'Obra', s: S.cab },
    { v: 'Ingreso', s: S.cab }, { v: 'Egreso', s: S.cab }, { v: 'Saldo acumulado', s: S.cab },
  ])); r++

  let ultimoMes = null, totIng = 0, totEgr = 0
  datos.movFuturos.forEach(m => {
    const mesMov = m.fecha_pago ? periodoDeStr(m.fecha_pago) : m.periodo
    if (mesMov !== ultimoMes) {
      h1.push(`<row r="${r}">` +
        `<c r="A${r}" t="inlineStr" s="${S.sep}"><is><t>${esc(mesMov ? labelPeriodo(mesMov) : 'Sin fecha')}</t></is></c>` +
        `<c r="B${r}" s="${S.sep}"/><c r="C${r}" s="${S.sep}"/><c r="D${r}" s="${S.sep}"/>` +
        `<c r="E${r}" s="${S.sep}"/><c r="F${r}" s="${S.sep}"/><c r="G${r}" s="${S.sep}"/><c r="H${r}" s="${S.sep}"/></row>`); r++
      ultimoMes = mesMov
    }
    const neg = m.saldoAcumulado < 0
    const exec = m.estado === 'ejecutado'
    const sTxt = neg ? S.rowRojo : exec ? S.rowVerde : S.normal
    if (m.tipo === 'ingreso') totIng += m.montoEfectivo
    else                      totEgr += m.montoEfectivo
    h1.push(xlRow(r, [
      { v: fmtFecha(m.fecha_pago), s: sTxt },
      { v: exec ? 'Ejecutado' : 'Proyectado', s: sTxt },
      { v: LABEL_CAT[m.categoria] ?? m.categoria ?? '', s: sTxt },
      { v: m.proveedor_cliente ?? m.concepto ?? '', s: sTxt },
      { v: m.obraCodigo, s: sTxt },
      { v: m.tipo === 'ingreso' ? m.montoEfectivo : null, s: m.tipo === 'ingreso' ? (exec ? S.numVerdeRow : S.numVerde) : S.normal, n: m.tipo === 'ingreso' },
      { v: m.tipo === 'egreso'  ? m.montoEfectivo : null, s: m.tipo === 'egreso'  ? (exec ? S.numRojoRow  : S.numRojo)  : S.normal, n: m.tipo === 'egreso' },
      { v: m.saldoAcumulado, s: neg ? S.numRojoRow : S.num, n: true },
    ])); r++
  })
  h1.push(xlRow(r, [
    { v: 'TOTALES', s: S.totalTxt }, { v: '', s: S.total }, { v: '', s: S.total }, { v: '', s: S.total }, { v: '', s: S.total },
    { v: totIng, s: S.total, n: true }, { v: totEgr, s: S.total, n: true },
    { v: totIng - totEgr, s: totIng - totEgr >= 0 ? S.numVerdeRow : S.numRojoRow, n: true },
  ])); r++

  const sheet1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetFormatPr defaultRowHeight="16"/>
  <cols>
    <col min="1" max="1" width="14" customWidth="1"/><col min="2" max="2" width="14" customWidth="1"/>
    <col min="3" max="3" width="18" customWidth="1"/><col min="4" max="4" width="35" customWidth="1"/>
    <col min="5" max="5" width="10" customWidth="1"/><col min="6" max="6" width="20" customWidth="1"/>
    <col min="7" max="7" width="20" customWidth="1"/><col min="8" max="8" width="22" customWidth="1"/>
  </cols>
  <sheetData>${h1.join('')}</sheetData>
  <autoFilter ref="A6:H6"/>
</worksheet>`

  // ── Hoja 2: Presupuesto vs Real (todas las obras, mes en curso) ──
  const h2 = []
  r = 1
  h2.push(`<row r="${r}"><c r="A${r}" t="inlineStr" s="${S.cab}"><is><t>PRESUPUESTO VS. REAL — ${esc(labelPeriodo(datos.periodo).toUpperCase())} — TODAS LAS OBRAS</t></is></c></row>`); r++
  r++
  h2.push(xlRow(r, [
    { v: 'Cód.', s: S.cab }, { v: 'Obra', s: S.cab }, { v: 'Rubro', s: S.cab }, { v: 'Concepto', s: S.cab },
    { v: 'Presupuestado', s: S.cab }, { v: 'Gastado', s: S.cab }, { v: 'Diferencia', s: S.cab },
    { v: '% Ejecutado', s: S.cab }, { v: 'Semáforo', s: S.cab },
  ])); r++

  const colorSemXL = { 'OK': S.rowVerde, 'Atención': S.rowNaranja, 'Superado': S.rowRojo, 'Sin presupuesto': S.rowGris }
  const numSemXL   = { 'OK': S.numVerde, 'Atención': S.num, 'Superado': S.numRojo, 'Sin presupuesto': S.num }
  const gruposXL = {}
  datos.analisisPV.forEach(row => { (gruposXL[row.obraCodigo] ??= []).push(row) })

  let totPresXL = 0, totGastXL = 0
  Object.entries(gruposXL).forEach(([obraCodigo, filas]) => {
    filas.forEach(row => {
      const sTxt = colorSemXL[row.semaforo] ?? S.normal
      const sNum = numSemXL[row.semaforo]   ?? S.num
      totPresXL += row.presupuestado; totGastXL += row.gastado
      h2.push(xlRow(r, [
        { v: row.obraCodigo, s: sTxt }, { v: row.obraNombre, s: sTxt },
        { v: row.rubroNombre, s: sTxt }, { v: '', s: sTxt },
        { v: row.presupuestado, s: sNum, n: true }, { v: row.gastado, s: sNum, n: true },
        { v: row.diferencia, s: row.diferencia >= 0 ? S.numVerde : S.numRojo, n: true },
        { v: row.presupuestado > 0 ? row.pct / 100 : 0, s: S.pct, n: true },
        { v: row.semaforo, s: sTxt },
      ])); r++
    })
    const stP = filas.reduce((s, x) => s + x.presupuestado, 0)
    const stG = filas.reduce((s, x) => s + x.gastado, 0)
    h2.push(xlRow(r, [
      { v: `Subtotal ${obraCodigo}`, s: S.totalTxt }, { v: '', s: S.subtotal }, { v: '', s: S.subtotal }, { v: '', s: S.subtotal },
      { v: stP, s: S.subtotal, n: true }, { v: stG, s: S.subtotal, n: true },
      { v: stP - stG, s: stP - stG >= 0 ? S.numVerde : S.numRojo, n: true },
      { v: stP > 0 ? stG / stP : 0, s: S.pct, n: true }, { v: '', s: S.subtotal },
    ])); r++
  })
  const totDifXL = totPresXL - totGastXL
  h2.push(xlRow(r, [
    { v: 'TOTAL GENERAL', s: S.totalTxt }, { v: '', s: S.total }, { v: '', s: S.total }, { v: '', s: S.total },
    { v: totPresXL, s: S.total, n: true }, { v: totGastXL, s: S.total, n: true },
    { v: totDifXL, s: totDifXL >= 0 ? S.numVerdeRow : S.numRojoRow, n: true },
    { v: totPresXL > 0 ? totGastXL / totPresXL : 0, s: S.pct, n: true }, { v: '', s: S.total },
  ])); r++

  const sheet2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetFormatPr defaultRowHeight="16"/>
  <cols>
    <col min="1" max="1" width="10" customWidth="1"/><col min="2" max="2" width="28" customWidth="1"/>
    <col min="3" max="3" width="22" customWidth="1"/><col min="4" max="4" width="25" customWidth="1"/>
    <col min="5" max="5" width="20" customWidth="1"/><col min="6" max="6" width="20" customWidth="1"/>
    <col min="7" max="7" width="20" customWidth="1"/><col min="8" max="8" width="14" customWidth="1"/>
    <col min="9" max="9" width="18" customWidth="1"/>
  </cols>
  <sheetData>${h2.join('')}</sheetData>
  <autoFilter ref="A3:I3"/>
</worksheet>`

  // ── Ensamblado del ZIP (XLSX) ──────────────────────────────
  const encoder = new TextEncoder()
  function crc32(buf) {
    const table = new Int32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
      table[i] = c
    }
    let crc = -1
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
    return (crc ^ -1) >>> 0
  }
  function u16le(n) { return [n & 0xFF, (n >> 8) & 0xFF] }
  function u32le(n) { return [n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >> 24) & 0xFF] }
  function zipEntry(name, content) {
    const nameBytes = encoder.encode(name)
    const contentBytes = encoder.encode(content)
    const crc = crc32(contentBytes)
    const local = new Uint8Array([
      0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ...u32le(crc), ...u32le(contentBytes.length), ...u32le(contentBytes.length),
      ...u16le(nameBytes.length), 0x00, 0x00, ...nameBytes, ...contentBytes,
    ])
    return { local, name: nameBytes, crc, size: contentBytes.length }
  }

  const files = [
    { name: '[Content_Types].xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: '_rels/.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Cash Flow" sheetId="1" r:id="rId1"/><sheet name="Presupuesto vs Real" sheetId="2" r:id="rId2"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', content: stylesXmlDirectorio },
    { name: 'xl/worksheets/sheet1.xml', content: sheet1 },
    { name: 'xl/worksheets/sheet2.xml', content: sheet2 },
  ]

  const parts = [], central = []
  let offset = 0
  files.forEach(f => {
    const e = zipEntry(f.name, f.content)
    parts.push(e.local)
    const nameBytes = encoder.encode(f.name)
    const cd = new Uint8Array([
      0x50, 0x4B, 0x01, 0x02, 0x14, 0x00, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ...u32le(e.crc), ...u32le(e.size), ...u32le(e.size), ...u16le(nameBytes.length),
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, ...u32le(offset), ...nameBytes,
    ])
    central.push(cd)
    offset += e.local.length
  })
  const centralBuf = central.reduce((acc, c) => { const b = new Uint8Array(acc.length + c.length); b.set(acc); b.set(c, acc.length); return b }, new Uint8Array(0))
  const eocd = new Uint8Array([
    0x50, 0x4B, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00,
    ...u16le(files.length), ...u16le(files.length), ...u32le(centralBuf.length), ...u32le(offset), 0x00, 0x00,
  ])
  const totalSize = parts.reduce((s, p) => s + p.length, 0) + centralBuf.length + eocd.length
  const zipBuf = new Uint8Array(totalSize)
  let pos = 0
  parts.forEach(p => { zipBuf.set(p, pos); pos += p.length })
  zipBuf.set(centralBuf, pos); pos += centralBuf.length
  zipBuf.set(eocd, pos)

  const blob = new Blob([zipBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Directorio_CashFlow_${datos.hoy}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

function colorSemaforo(pct, sinPresupuesto) {
  if (sinPresupuesto) return 'bg-slate-300'
  if (pct > 100) return 'bg-red-500'
  if (pct >= 80) return 'bg-yellow-400'
  return 'bg-emerald-500'
}
function textSemaforo(pct, sinPresupuesto) {
  if (sinPresupuesto) return 'text-slate-400'
  if (pct > 100) return 'text-red-700'
  if (pct >= 80) return 'text-yellow-700'
  return 'text-emerald-700'
}
function BarraProgreso({ pct, sinPresupuesto }) {
  if (sinPresupuesto) return <span className="text-slate-300 text-xs">—</span>
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${colorSemaforo(pct, false)}`}
          style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`text-xs font-medium tabular-nums w-12 text-right ${textSemaforo(pct, false)}`}>{fmtPct(pct)}</span>
    </div>
  )
}
function PuntoSemaforo({ pct, sinPresupuesto }) {
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colorSemaforo(pct, sinPresupuesto)} shrink-0`} title={sinPresupuesto ? 'Sin presupuesto' : fmtPct(pct)} />
}

// ─── Íconos ───────────────────────────────────────────────────────────────────

const IconBell = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0
         006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714
         0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
  </svg>
)
const IconChevronDown = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
)
const IconLogout = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0
         007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
  </svg>
)

// ─── TopNav ───────────────────────────────────────────────────────────────────

function TopNav({ perfil }) {
  const { logout } = useAuth()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const iniciales = perfil ? `${perfil.nombre?.[0] ?? ''}${perfil.apellido?.[0] ?? ''}` : 'U'

  return (
    <header className="bg-white border-b border-slate-100 px-6 py-3 flex items-center justify-between sticky top-0 z-20">
      <img src="/logo-psdata.png" alt="PSDATA" className="h-14" />
      <div className="flex items-center gap-4">
        <button className="w-9 h-9 rounded-full flex items-center justify-center
                           text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
          <IconBell />
        </button>
        <div className="w-px h-6 bg-slate-200" />
        <div className="relative">
          <button onClick={() => setMenuAbierto(v => !v)}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: '#0e7490' }}>
              {iniciales}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-slate-800 text-sm font-semibold leading-none">
                {perfil ? `${perfil.nombre} ${perfil.apellido}` : 'Usuario'}
              </p>
              <p className="text-slate-400 text-xs mt-0.5 leading-none capitalize">{perfil?.rol ?? 'Directorio'}</p>
            </div>
            <span className={`transition-transform duration-200 ${menuAbierto ? 'rotate-180' : ''}`}>
              <IconChevronDown />
            </span>
          </button>
          {menuAbierto && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuAbierto(false)} />
              <div className="absolute right-0 mt-3 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-1.5 z-20">
                <div className="px-4 py-2.5 border-b border-slate-100">
                  <p className="text-slate-800 text-sm font-semibold truncate">
                    {perfil ? `${perfil.nombre} ${perfil.apellido}` : 'Usuario'}
                  </p>
                  <p className="text-slate-400 text-xs capitalize mt-0.5">{perfil?.rol ?? 'Directorio'}</p>
                </div>
                <button onClick={async () => { setMenuAbierto(false); await logout() }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                  <IconLogout />
                  Cerrar sesión
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DashboardDirectorio() {
  const { perfil } = useAuth()
  const [tab, setTab] = useState('cashflow') // 'cashflow' | 'presupuesto'
  const [exportando, setExportando] = useState(false)
  const [errorExport, setErrorExport] = useState('')

  async function handleExportar() {
    setExportando(true); setErrorExport('')
    try {
      const datos = await cargarDatosExportDirectorio()
      generarExcelDirectorio(datos)
    } catch (err) {
      console.error('[Exportar Excel]', err)
      setErrorExport('No se pudo generar el Excel. Intentá de nuevo.')
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f0f7fa' }}>
      <TopNav perfil={perfil} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-slate-900 text-2xl font-extrabold tracking-tight">Panel de Directorio</h1>
            <p className="text-slate-400 text-sm mt-0.5">Seguimiento de cash flow, presupuesto y resultados en tiempo real.</p>
          </div>
          <div className="text-right">
            <button onClick={handleExportar} disabled={exportando}
              className="inline-flex items-center gap-2 text-white text-sm font-semibold
                         px-4 py-2.5 rounded-xl transition-colors shadow-sm disabled:opacity-50"
              style={{ backgroundColor: '#059669' }}
              onMouseEnter={e => !exportando && (e.currentTarget.style.backgroundColor = '#047857')}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#059669'}>
              {exportando ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              )}
              {exportando ? 'Generando…' : 'Exportar a Excel'}
            </button>
            {errorExport && <p className="text-red-600 text-xs mt-1.5">{errorExport}</p>}
          </div>
        </div>

        <div className="flex items-center gap-1 mb-6 border-b border-slate-200">
          <TabButton activo={tab === 'cashflow'} onClick={() => setTab('cashflow')}>Cash Flow</TabButton>
          <TabButton activo={tab === 'presupuesto'} onClick={() => setTab('presupuesto')}>Presupuesto vs. Real</TabButton>
        </div>

        {tab === 'cashflow' ? <TabCashFlow /> : <TabPresupuesto />}
      </main>
    </div>
  )
}

function TabButton({ activo, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors
        ${activo ? 'border-current' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
      style={activo ? { color: '#0e7490', borderColor: '#0e7490' } : {}}>
      {children}
    </button>
  )
}

// ══════════════════════════════════════════════════════════════
// TAB: CASH FLOW (desde hoy en adelante — sin historial pasado)
// ══════════════════════════════════════════════════════════════
function TabCashFlow() {
  const [cuentas,     setCuentas]     = useState([])
  const [obras,       setObras]       = useState([])
  const [rubros,      setRubros]      = useState([])
  const [presupuestos, setPresupuestos] = useState([])
  const [ventasProyectadas, setVentasProyectadas] = useState([])
  const [fechasEstimadasGasto, setFechasEstimadasGasto] = useState([])
  const [fechasEstimadasVenta, setFechasEstimadasVenta] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [saldosBase,  setSaldosBase]  = useState([])
  const [cargando,     setCargando]     = useState(true)
  const [actualizando, setActualizando] = useState(false)
  const [error,       setError]       = useState('')

  const [filtroCuenta,    setFiltroCuenta]    = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroBusqueda,  setFiltroBusqueda]  = useState('')
  const [horizonte,       setHorizonte]       = useState(90)
  const [mostrarDetalle,  setMostrarDetalle]  = useState(false)

  const [filaProyeccion,       setFilaProyeccion]       = useState(null)
  const [nuevaFechaProyeccion, setNuevaFechaProyeccion] = useState('')
  const [guardandoProyeccion,  setGuardandoProyeccion]  = useState(false)
  const [errorProyeccion,      setErrorProyeccion]      = useState('')

  useEffect(() => {
    supabase.from('cuentas').select('id, nombre, tipo, activa').eq('activa', true).order('nombre')
      .then(({ data }) => setCuentas(data ?? []))
    supabase.from('obras').select('id, codigo, nombre, activa').eq('activa', true).order('codigo')
      .then(({ data }) => setObras(data ?? []))
    supabase.from('rubros').select('id, nombre, tipo, activo').eq('activo', true).order('nombre')
      .then(({ data }) => setRubros(data ?? []))
    supabase.from('presupuestos').select('id, obra_id, rubro_id, periodo, monto')
      .then(({ data }) => setPresupuestos(data ?? []))
    supabase.from('ventas_proyectadas').select('id, obra_id, periodo, monto, registrado')
      .then(({ data }) => setVentasProyectadas(data ?? []))
    supabase.from('gasto_proyectado_fecha_estimada').select('obra_id, rubro_id, periodo, fecha_estimada, cerrado')
      .then(({ data }) => setFechasEstimadasGasto(data ?? []))
    supabase.from('venta_proyectada_fecha_estimada').select('obra_id, periodo, fecha_estimada, cerrado, concepto')
      .then(({ data }) => setFechasEstimadasVenta(data ?? []))
  }, [])

  useEffect(() => {
    supabase.from('saldos_iniciales').select('id, cuenta_id, monto, fecha, created_at')
      .order('fecha', { ascending: false }).order('created_at', { ascending: false })
      .then(({ data }) => {
        const mapa = {}
        ;(data ?? []).forEach(s => { if (!mapa[s.cuenta_id]) mapa[s.cuenta_id] = s })
        setSaldosBase(Object.values(mapa))
      })
  }, [])

  const cargarMovimientos = useCallback(async (opts = {}) => {
    const { silencioso = false } = opts
    if (silencioso) setActualizando(true); else setCargando(true)
    setError('')
    const { data: movData, error: movErr } = await supabase
      .from('movimientos')
      .select(`
        id, tipo, categoria, proveedor_cliente, numero_factura,
        monto_bruto, monto_neto, concepto,
        periodo, fecha_pago, estado, cuenta_id, obra_id, rubro_id, created_at,
        estado_proyeccion, fecha_pago_original, fondo_id,
        obras   ( id, codigo, nombre ),
        rubros  ( id, nombre ),
        cuentas ( id, nombre )
      `)
      .order('fecha_pago', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .order('id',         { ascending: true })

    if (movErr) { setError('No se pudieron cargar los movimientos.'); setCargando(false); setActualizando(false); return }

    const movIds = (movData ?? []).map(m => m.id)
    let notasPorMov = {}
    if (movIds.length > 0) {
      const { data: notasData } = await supabase
        .from('notas').select('movimiento_id, tipo_nota, monto').in('movimiento_id', movIds)
      ;(notasData ?? []).forEach(n => {
        if (!notasPorMov[n.movimiento_id]) notasPorMov[n.movimiento_id] = []
        notasPorMov[n.movimiento_id].push(n)
      })
    }

    const enriquecidos = (movData ?? []).map(m => {
      const base          = m.estado === 'ejecutado'
        ? Number(m.monto_neto ?? m.monto_bruto ?? 0)
        : Number(m.monto_bruto ?? 0)
      const notas         = notasPorMov[m.id] ?? []
      const totalDebitos  = notas.filter(n => n.tipo_nota === 'debito').reduce((s, n) => s + Number(n.monto), 0)
      const totalCreditos = notas.filter(n => n.tipo_nota === 'credito').reduce((s, n) => s + Number(n.monto), 0)
      const montoEfectivo = m.categoria === 'factura' ? base + totalDebitos - totalCreditos : base
      return { ...m, montoEfectivo }
    })

    setMovimientos(enriquecidos)
    setCargando(false)
    setActualizando(false)
  }, [])

  useEffect(() => { cargarMovimientos() }, [cargarMovimientos])

  function handleIniciarProyeccion(m) {
    setFilaProyeccion(m.id)
    setNuevaFechaProyeccion(m.fecha_pago ?? '')
    setErrorProyeccion('')
  }

  function handleCancelarProyeccion() {
    setFilaProyeccion(null)
    setNuevaFechaProyeccion('')
    setErrorProyeccion('')
  }

  async function handleGuardarProyeccion(m, accion) {
    setErrorProyeccion('')

    const payload = { estado_proyeccion: accion }

    if (accion === 'reprogramado') {
      if (!nuevaFechaProyeccion) { setErrorProyeccion('Elegí la nueva fecha estimada.'); return }
      if (nuevaFechaProyeccion === m.fecha_pago) { setErrorProyeccion('La fecha nueva tiene que ser distinta a la actual.'); return }
      payload.fecha_pago_original = m.fecha_pago_original ?? m.fecha_pago
      payload.fecha_pago = nuevaFechaProyeccion
      payload.periodo = periodoDeStr(nuevaFechaProyeccion)
    }

    setGuardandoProyeccion(true)
    const { error: updError } = await supabase.from('movimientos').update(payload).eq('id', m.id)
    setGuardandoProyeccion(false)

    if (updError) { setErrorProyeccion('No se pudo guardar el cambio.'); return }

    setFilaProyeccion(null)
    setNuevaFechaProyeccion('')
    await cargarMovimientos({ silencioso: true })
  }

  // Movimientos reales + filas virtuales de "gasto proyectado" (lo que del
  // presupuesto de Operaciones todavía no se facturó). Las virtuales nunca se
  // guardan en la base: se recalculan cada vez a partir de presupuestos vivos.
  const movimientosCombinados = useMemo(
    () => combinarConProyeccion(movimientos, presupuestos, ventasProyectadas, fechasEstimadasGasto, fechasEstimadasVenta, obras, rubros),
    [movimientos, presupuestos, ventasProyectadas, fechasEstimadasGasto, fechasEstimadasVenta, obras, rubros]
  )

  const { movimientosConSaldo } = useMemo(() => {
    const sumaSaldosBase = saldosBase.reduce((acc, s) => acc + Number(s.monto ?? 0), 0)
    let saldoActual = sumaSaldosBase
    const resultado = movimientosCombinados.map(m => {
      if (m.estado_proyeccion !== 'no_cumple' && m._afectaCashflow !== false) {
        if (m.tipo === 'ingreso') saldoActual += m.montoEfectivo
        else                      saldoActual -= m.montoEfectivo
      }
      return { ...m, saldoAcumulado: saldoActual }
    })
    return { movimientosConSaldo: resultado }
  }, [movimientosCombinados, saldosBase])

  const cards = useMemo(() => {
    const hoy = hoyISO()
    const d30 = fechaFutura(30)
    const d60 = fechaFutura(60)
    const d90 = fechaFutura(90)
    const sumaSaldosBase = saldosBase.reduce((acc, s) => acc + Number(s.monto ?? 0), 0)

    let saldoHoy = sumaSaldosBase
    movimientosCombinados.forEach(m => {
      const fecha = m.fecha_pago
      if (!fecha || fecha > hoy) return
      if (m.estado_proyeccion === 'no_cumple') return
      if (m._afectaCashflow === false) return
      if (m.tipo === 'ingreso') saldoHoy += m.montoEfectivo
      else                      saldoHoy -= m.montoEfectivo
    })

    function posicionEn(fechaLimite) {
      let ultimo = sumaSaldosBase
      for (const m of movimientosConSaldo) {
        const fecha = m.fecha_pago
        if (!fecha || fecha > fechaLimite) break
        ultimo = m.saldoAcumulado
      }
      return ultimo
    }

    return { saldoHoy, pos30: posicionEn(d30), pos60: posicionEn(d60), pos90: posicionEn(d90) }
  }, [movimientosCombinados, movimientosConSaldo, saldosBase])

  // El directorio solo ve de hoy en adelante: se fuerza el piso de fecha.
  const filasFiltradas = useMemo(() => {
    const hoy = hoyISO()
    const fechaLimite = fechaFutura(horizonte)
    const busqueda = filtroBusqueda.trim().toLowerCase()
    return movimientosConSaldo.filter(m => {
      const fecha = m.fecha_pago ?? m.periodo
      if (!fecha || fecha < hoy || fecha > fechaLimite) return false
      if (filtroCuenta    && m.cuenta_id  !== filtroCuenta)    return false
      if (filtroCategoria && m.categoria  !== filtroCategoria) return false
      if (busqueda) {
        const texto = [m.proveedor_cliente, m.numero_factura, m.concepto, m.obras?.codigo, m.obras?.nombre]
          .filter(Boolean).join(' ').toLowerCase()
        if (!texto.includes(busqueda)) return false
      }
      return true
    })
  }, [movimientosConSaldo, horizonte, filtroCuenta, filtroCategoria, filtroBusqueda])

  const puntosExtremos = useMemo(() => {
    if (filasFiltradas.length === 0) return null
    let max = filasFiltradas[0], min = filasFiltradas[0]
    for (const m of filasFiltradas) {
      if (m.saldoAcumulado > max.saldoAcumulado) max = m
      if (m.saldoAcumulado < min.saldoAcumulado) min = m
    }
    return { max, min }
  }, [filasFiltradas])

  // ── Escenarios (simulación sobre el gráfico; no escribe nada en la base) ──
  const hoy = hoyISO()
  const fima = useFimaDatos()
  const esc = useEscenarios()
  const [metricaSel, setMetrica] = useState('banco') // 'banco' | 'f:<fondo>' | 'total'
  const [fechaSelRaw, setFechaSel] = useState(null)

  const base = useMemo(() => {
    if (!fima.cargado) return null
    return construirBase({
      hoy,
      movimientos: movimientosConSaldo,
      sumaBase: saldosBase.reduce((acc, s) => acc + Number(s.monto ?? 0), 0),
      fondos: fima.fondos, saldosFima: fima.saldos, rendimientos: fima.rendimientos,
    })
  }, [fima, movimientosConSaldo, saldosBase, hoy])

  const resultados = useMemo(() => {
    if (!base) return null
    const r = { actual: simular(base, null) }
    esc.escenarios.forEach(e => { r[e.id] = simular(base, e) })
    return r
  }, [base, esc.escenarios])

  const colorDe = id => COLORES_ESCENARIO[Math.max(0, esc.escenarios.findIndex(e => e.id === id)) % COLORES_ESCENARIO.length]
  const nRango = horizonte + 1
  const fechaSel = base && fechaSelRaw && base.fechas.indexOf(fechaSelRaw) >= 0 && base.fechas.indexOf(fechaSelRaw) < nRango ? fechaSelRaw : null
  const hayEscenarios = esc.escenarios.length > 0
  // Resultado del escenario activo (null si se mira lo real) y sus puntos más alto y más bajo de caja.
  const vistaEsc = esc.activo && resultados ? resultados[esc.activo.id] : null
  const extremosDe = r => {
    if (!r || !base) return null
    let mx = 0, mn = 0
    for (let i = 1; i < nRango; i++) {
      if (r.banco[i] > r.banco[mx]) mx = i
      if (r.banco[i] < r.banco[mn]) mn = i
    }
    return { max: { valor: r.banco[mx], fecha: base.fechas[mx] }, min: { valor: r.banco[mn], fecha: base.fechas[mn] } }
  }
  const extremosEsc = extremosDe(vistaEsc)
  const extremosReal = extremosDe(resultados?.actual)
  const opcionesM = base ? opcionesMetrica(base) : []
  const metrica = opcionesM.some(o => o.id === metricaSel) ? metricaSel : 'banco'

  const totales = useMemo(() => {
    let ingresos = 0, egresos = 0
    filasFiltradas.forEach(m => {
      if (m._afectaCashflow === false) return
      if (m.tipo === 'ingreso') ingresos += m.montoEfectivo
      else                      egresos  += m.montoEfectivo
    })
    return { ingresos, egresos, diferencia: ingresos - egresos }
  }, [filasFiltradas])

  return (
    <div className="space-y-6">
      {actualizando && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-white shadow-md
                        border border-slate-100 rounded-full px-3 py-1.5 text-xs text-slate-500">
          <span className="w-3.5 h-3.5 border-2 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
          Actualizando…
        </div>
      )}
      {cargando ? (
        <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
          <span className="w-5 h-5 border-2 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
          <span className="text-sm">Cargando…</span>
        </div>
      ) : (
        <>
          {/* Gráfico — lo primero que se ve, sin scroll. Tocando una fecha se simulan escenarios. */}
          <div className={`${CARD} p-5 sm:p-6`}>
            <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
              <div>
                <h2 className="text-slate-900 font-bold text-base flex items-center gap-2">
                  Evolución del saldo proyectado
                  <span className="text-slate-300 cursor-help"
                    title="Saldo acumulado: lo que hay hoy en el banco, más los ingresos y egresos reales y proyectados de cada fecha. Tocá una fecha del gráfico para simular escenarios con FIMA o pagos que no se cumplen.">
                    <Icono {...ICONOS.info} className="w-4 h-4" />
                  </span>
                </h2>
                <p className="text-slate-400 text-xs mt-1">
                  {opcionesM.find(o => o.id === metrica)?.titulo ?? 'Caja (bancos)'} · desde el {fmtFecha(hoyISO())} hasta {fmtFecha(fechaFutura(horizonte))}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {hayEscenarios && (
                  <div className="inline-flex max-w-full flex-wrap rounded-xl border border-slate-200 bg-slate-50/70 p-0.5 text-[11px] sm:text-xs font-semibold">
                    {opcionesM.map(({ id: v, texto }) => (
                      <button key={v} onClick={() => setMetrica(v)}
                        className={`px-2 sm:px-3 py-1.5 rounded-[10px] whitespace-nowrap transition-colors
                          ${metrica === v ? 'bg-emerald-100 text-emerald-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                        {texto}
                      </button>
                    ))}
                  </div>
                )}
                <div className="inline-flex max-w-full rounded-xl border border-slate-200 bg-slate-50/70 p-0.5 text-[11px] sm:text-xs font-semibold">
                  {[[30, '30 días'], [60, '60 días'], [90, '90 días'], [180, '6 meses'], [365, '1 año']].map(([dias, texto]) => (
                    <button key={dias} onClick={() => setHorizonte(dias)}
                      className={`px-2 sm:px-3 py-1.5 rounded-[10px] whitespace-nowrap transition-colors
                        ${horizonte === dias ? 'bg-emerald-100 text-emerald-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                      {texto}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {base && resultados ? (
              <>
                <BarraEscenarios esc={esc} base={base} colorDe={colorDe} />
                <GraficoCashflow
                  fechas={base.fechas.slice(0, nRango)}
                  actual={serieMetrica(resultados.actual, metrica).slice(0, nRango)}
                  activa={esc.activo ? { nombre: esc.activo.nombre, valores: serieMetrica(resultados[esc.activo.id], metrica).slice(0, nRango) } : null}
                  extras={esc.escenarios
                    .filter(e => e.id !== esc.activoId && esc.visibles.includes(e.id))
                    .map(e => ({ id: e.id, nombre: e.nombre, color: colorDe(e.id), valores: serieMetrica(resultados[e.id], metrica).slice(0, nRango) }))}
                  fechaSel={fechaSel}
                  onSelect={f => setFechaSel(prev => (prev === f ? null : f))} />
                {hayEscenarios && metrica === 'total' && (
                  <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                    Invertir o rescatar solo mueve plata entre la caja y cada fondo, por eso la posición total no cambia (la simulación no proyecta rendimientos).
                    Mirá <b className="text-slate-500">Caja</b> o cada fondo por separado para ver el efecto. Marcar un pago como "no se cumple" sí cambia la posición total.
                  </p>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-48 text-slate-400 text-sm gap-3">
                <span className="w-4 h-4 border-2 border-slate-200 border-t-cyan-600 rounded-full animate-spin" /> Cargando…
              </div>
            )}
          </div>

          {fechaSel && base && resultados && (
            <PanelFecha fecha={fechaSel} hoy={hoy} base={base} esc={esc} resultados={resultados} onCerrar={() => setFechaSel(null)} />
          )}

          {vistaEsc && base && <AlertasEscenario base={base} alertas={vistaEsc.alertas} />}

          {/* Cards de posición: siguen al escenario activo (si no hay ninguno, son lo real) */}
          {esc.activo && base && resultados && (
            <div className="flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
              <p className="text-sm text-emerald-900">
                Estás viendo los números de <b>{esc.activo.nombre}</b>: es una simulación, no lo real.
                <span className="text-emerald-800/70"> Debajo de cada valor ves la diferencia contra lo real.</span>
              </p>
              <button onClick={() => esc.setActivoId('actual')}
                className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-white border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors">
                Volver a lo real
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: 'Saldo disponible hoy', dias: 0, real: cards.saldoHoy, icono: 'billetera', sub: 'Todas las cuentas al día de hoy' },
              { label: 'Posición a 30 días', dias: 30, real: cards.pos30, icono: 'tendencia' },
              { label: 'Posición a 60 días', dias: 60, real: cards.pos60, icono: 'calendario' },
              { label: 'Posición a 90 días', dias: 90, real: cards.pos90, icono: 'calendario' },
            ].map(c => {
              const valor = vistaEsc ? vistaEsc.banco[c.dias] : c.real
              const dif = vistaEsc ? vistaEsc.banco[c.dias] - resultados.actual.banco[c.dias] : 0
              return (
                <CardResumen key={c.label} label={c.label} valor={fmtARS(valor)} icono={ico(c.icono)} tono="teal"
                  color={valor >= 0 ? 'text-slate-900' : 'text-red-600'}
                  subLabel={subConDif(c.sub ?? `Al ${fmtFecha(fechaFutura(c.dias))}`, dif)} />
              )
            })}
          </div>

          {base && resultados && <CardsFondos base={base} vista={vistaEsc ?? resultados.actual} real={resultados.actual} simulando={!!vistaEsc} />}

          {(vistaEsc ? extremosEsc : puntosExtremos) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {vistaEsc ? (
                <>
                  <CardResumen label="Punto más alto" valor={fmtARS(extremosEsc.max.valor)}
                    icono={ico('subir')} tono="emerald" color="text-emerald-600"
                    subLabel={subConDif(`El ${fmtFecha(extremosEsc.max.fecha)} — en ${esc.activo.nombre}`, extremosEsc.max.valor - extremosReal.max.valor)} />
                  <CardResumen label="Punto más bajo" valor={fmtARS(extremosEsc.min.valor)}
                    icono={ico('bajar')} tono="rose"
                    color={extremosEsc.min.valor >= 0 ? 'text-emerald-600' : 'text-red-600'}
                    subLabel={subConDif(`El ${fmtFecha(extremosEsc.min.fecha)} — en ${esc.activo.nombre}`, extremosEsc.min.valor - extremosReal.min.valor)} />
                </>
              ) : (
                <>
                  <CardResumen label="Punto más alto" valor={fmtARS(puntosExtremos.max.saldoAcumulado)}
                    icono={ico('subir')} tono="emerald" color="text-emerald-600"
                    subLabel={`El ${fmtFecha(puntosExtremos.max.fecha_pago)} — ${puntosExtremos.max.proveedor_cliente ?? puntosExtremos.max.concepto ?? '—'}`} />
                  <CardResumen label="Punto más bajo" valor={fmtARS(puntosExtremos.min.saldoAcumulado)}
                    icono={ico('bajar')} tono="rose"
                    color={puntosExtremos.min.saldoAcumulado >= 0 ? 'text-emerald-600' : 'text-red-600'}
                    subLabel={`El ${fmtFecha(puntosExtremos.min.fecha_pago)} — ${puntosExtremos.min.proveedor_cliente ?? puntosExtremos.min.concepto ?? '—'}`} />
                </>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
          )}

          {/* Detalle de movimientos — colapsado por defecto */}
          <button onClick={() => setMostrarDetalle(v => !v)}
            className={`${CARD} w-full flex items-center justify-between gap-3 px-5 py-4 text-left transition-shadow hover:shadow-md`}>
            <span className="flex items-center gap-3.5 min-w-0">
              <span className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${TONOS.teal}`}>
                <Icono {...ICONOS.lista} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-900">
                  {mostrarDetalle ? 'Ocultar' : 'Ver'} detalle de movimientos
                </span>
                <span className="block text-xs text-slate-400 mt-0.5">
                  {filasFiltradas.length} movimiento{filasFiltradas.length !== 1 ? 's' : ''} reales y proyectados con saldo acumulado
                </span>
              </span>
            </span>
            <span className="flex items-center gap-2.5 shrink-0">
              <span className="hidden sm:inline-flex px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold tabular-nums">
                {filasFiltradas.length}
              </span>
              <span className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center">
                <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${mostrarDetalle ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </span>
            </span>
          </button>

          {mostrarDetalle && (
            <div className="space-y-5">
              {/* Filtros */}
              <div className={`${CARD} p-4 sm:p-5 space-y-4`}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Cuenta</label>
                    <select value={filtroCuenta} onChange={e => setFiltroCuenta(e.target.value)} className={selCls}>
                      <option value="">Todas las cuentas</option>
                      {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Categoría</label>
                    <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} className={selCls}>
                      {CATEGORIAS_FILTRO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Buscar (proveedor, factura, concepto, obra)</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none">
                      <Icono {...ICONOS.buscar} className="w-4 h-4" />
                    </span>
                    <input type="text" placeholder="Ej: startech, 4-1596, obra 678…"
                      value={filtroBusqueda} onChange={e => setFiltroBusqueda(e.target.value)} className={`${selCls} !pl-10`} />
                  </div>
                </div>
              </div>

              {/* Tabla */}
              {filasFiltradas.length === 0 ? (
                <EstadoVacio titulo="Sin movimientos" descripcion="No hay movimientos futuros para los filtros seleccionados." />
              ) : (
                <div className={`${CARD} overflow-hidden`}>
                  <div className="px-5 sm:px-6 pt-5 pb-4 flex items-center justify-between gap-3 flex-wrap border-b border-slate-100">
                    <div>
                      <h3 className="text-slate-900 font-bold text-base">Movimientos</h3>
                      <p className="text-slate-400 text-xs mt-0.5">Ordenados por fecha de pago, con el saldo acumulado de cada uno.</p>
                    </div>
                    <span className="inline-flex px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold tabular-nums">
                      {filasFiltradas.length} movimiento{filasFiltradas.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100">
                  <Th>Fecha pago</Th>
                  <Th>Categoría</Th>
                  <Th>Proveedor / Cliente</Th>
                  <Th>Obra</Th>
                  <Th align="right">Ingreso</Th>
                  <Th align="right">Egreso</Th>
                  <Th align="right">Saldo acumulado</Th>
                  <Th align="right">Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {filasFiltradas.map(m => {
                  const esIngreso = m.tipo === 'ingreso'

                  if (filaProyeccion === m.id) {
                    return (
                      <FilaProyeccionDirectorio
                        key={m.id}
                        mov={m}
                        nuevaFecha={nuevaFechaProyeccion}
                        guardando={guardandoProyeccion}
                        error={errorProyeccion}
                        onChangeFecha={setNuevaFechaProyeccion}
                        onGuardar={accion => handleGuardarProyeccion(m, accion)}
                        onCancelar={handleCancelarProyeccion}
                      />
                    )
                  }

                  return (
                    <tr key={m.id} className={`border-b border-slate-100/80 last:border-0 transition-colors ${m._virtual ? 'bg-slate-50/40 hover:bg-slate-50' : 'hover:bg-slate-50/70'}`}>
                      <td className="px-4 py-4 text-slate-700 font-medium whitespace-nowrap text-[13px] tabular-nums">{fmtFecha(m.fecha_pago)}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center text-center leading-tight text-[11px] font-semibold px-2.5 py-1 rounded-lg ${BADGE_CAT[m.categoria] ?? 'bg-slate-100 text-slate-600'}`}>
                          {LABEL_CAT[m.categoria] ?? m.categoria}
                        </span>
                        {m.estado_proyeccion === 'no_cumple' && (
                          <span className="block text-slate-400 text-[10px] font-semibold mt-1" title="No suma en el saldo acumulado">
                            No se cumple
                          </span>
                        )}
                        {m.estado_proyeccion === 'reprogramado' && (
                          <span className="block text-blue-500 text-[10px] font-semibold mt-1"
                            title={`Fecha original: ${fmtFecha(m.fecha_pago_original)}`}>
                            Reprogramado
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-slate-800 font-medium max-w-[220px] truncate">
                        {m.categoria === 'gasto_proyectado' ? (
                          <span className="italic font-normal text-slate-500"
                            title={`Presupuestado: ${fmtARS(m._presupuestado)} — Ya facturado: ${fmtARS(m._gastoReal)}`}>
                            {m.rubros?.nombre ?? 'Rubro'} — saldo sin facturar
                            <span className="block not-italic text-slate-600 font-medium uppercase text-[10px]">Período {periodoCorto(m.periodo)}</span>
                          </span>
                        ) : m.categoria === 'venta_proyectada' ? (
                          <span className="italic font-normal text-slate-500">
                            Venta proyectada de {labelPeriodo(m.periodo)}
                            {m._conceptoManual && (
                              <span className="block not-italic text-slate-600 font-medium text-[10px]">{m._conceptoManual}</span>
                            )}
                            {m._gastoReal > 0 && (
                              <span className="block not-italic text-slate-400 text-[10px]">
                                Ya registrado: {fmtARS(m._gastoReal)} de {fmtARS(m._presupuestado)}
                              </span>
                            )}
                            {m._afectaCashflow === false && (
                              <span className="block not-italic text-amber-600 font-medium text-[10px]" title="Período anterior al mes en curso: se muestra como dato, pero no suma ni resta en el saldo del Cash Flow">
                                No afecta el saldo (período pasado)
                              </span>
                            )}
                          </span>
                        ) : (
                          m.proveedor_cliente ?? m.concepto ?? '—'
                        )}
                        {m.numero_factura && <span className="block text-xs font-normal text-slate-400 mt-0.5">Nº {m.numero_factura}</span>}
                      </td>
                      <td className="px-4 py-4 text-slate-500 text-[13px] whitespace-nowrap tabular-nums">{m.obras?.codigo ?? '—'}</td>
                      <td className={`px-5 py-4 text-right tabular-nums whitespace-nowrap font-medium ${m._virtual ? 'text-slate-400' : 'text-emerald-600'}`}>
                        {esIngreso ? <span className={m.estado_proyeccion === 'no_cumple' ? 'text-slate-300 line-through' : ''}>{fmtARS(m.montoEfectivo)}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums text-rose-600 whitespace-nowrap font-medium">
                        {!esIngreso ? <span className={m.estado_proyeccion === 'no_cumple' ? 'text-slate-300 line-through' : m._virtual ? 'text-slate-400' : ''}>{fmtARS(m.montoEfectivo)}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <span className={`inline-block tabular-nums font-bold text-sm px-2.5 py-1 rounded-lg ${m.saldoAcumulado >= 0 ? 'text-slate-900' : 'text-rose-600 bg-rose-50'}`}>
                          {fmtARS(m.saldoAcumulado)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        {m._virtual ? (
                          <span className="text-xs text-slate-400 italic">
                            {m.categoria === 'venta_proyectada' ? 'Estimado — ventas Operaciones' : 'Estimado — presupuesto Operaciones'}
                          </span>
                        ) : (
                          <button
                            onClick={() => handleIniciarProyeccion(m)}
                            disabled={filaProyeccion !== null}
                            className="text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-100
                                       rounded-lg px-3 py-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            Proyección
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
                      </tbody>
                    </table>
                  </div>
                  <div className="border-t border-slate-100 bg-slate-50/60 px-5 sm:px-6 py-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-xl bg-white border border-slate-100 px-4 py-3">
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Ingresos</p>
                        <p className="text-emerald-600 font-bold tabular-nums mt-0.5">{fmtARS(totales.ingresos)}</p>
                      </div>
                      <div className="rounded-xl bg-white border border-slate-100 px-4 py-3">
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Egresos</p>
                        <p className="text-rose-600 font-bold tabular-nums mt-0.5">{fmtARS(totales.egresos)}</p>
                      </div>
                      <div className="rounded-xl bg-white border border-slate-100 px-4 py-3">
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Diferencia</p>
                        <p className={`font-bold tabular-nums mt-0.5 ${totales.diferencia >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {fmtARS(totales.diferencia)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Cards de fondos de inversión (FIMA) — solo lectura, una fila por fondo.
// Salen del mismo modelo que el gráfico (src/lib/fimaLedger.js + escenarios.js),
// así que siguen al escenario activo; sin escenario, son el saldo real.
// ══════════════════════════════════════════════════════════════
function CardsFondos({ base, vista, real, simulando }) {
  return (
    <div className="space-y-4">
      {base.fondosLista.map((fondo, i) => {
        const id = fondo.id ?? 'por-defecto'
        // Cada fondo con su propio color e ícono, para distinguirlos de un vistazo.
        const tono = ['indigo', 'violet', 'sky', 'amber'][i % 4]
        const icono = ico(i % 2 === 0 ? 'torta' : 'capas')
        const sinSaldoInicial = base.sinSaldoInicial.includes(fondo.nombre)
        return (
          <div key={id}>
            {sinSaldoInicial && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3 mb-4">
                Finanzas todavía no cargó el saldo inicial de {fondo.nombre} — los números de acá abajo todavía no son definitivos.
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {[
                { dias: 0, label: `Saldo ${fondo.nombre} hoy`, sub: 'Plata invertida en el fondo (no es saldo bancario)' },
                { dias: 30, label: `Posición ${fondo.nombre} a 30 días` },
                { dias: 60, label: `Posición ${fondo.nombre} a 60 días` },
                { dias: 90, label: `Posición ${fondo.nombre} a 90 días` },
              ].map(c => {
                const valor = vista.fondos[id][c.dias]
                const dif = simulando ? valor - real.fondos[id][c.dias] : 0
                return (
                  <CardResumen key={c.label} label={c.label} valor={fmtARS(valor)} icono={icono} tono={tono}
                    color={valor >= 0 ? 'text-slate-900' : 'text-red-600'}
                    subLabel={subConDif(c.sub ?? `Al ${fmtFecha(fechaFutura(c.dias))}`, dif)} />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Subtítulo de una card; si hay diferencia contra lo real (escenario), la agrega en verde o rojo.
function subConDif(texto, dif) {
  if (!dif || Math.abs(dif) < 0.005) return texto
  return (
    <>
      {texto}
      <span className={`block font-semibold tabular-nums ${dif > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
        {dif > 0 ? '+' : '-'}{fmtARS(Math.abs(dif))} <span className="font-normal text-slate-400">vs real</span>
      </span>
    </>
  )
}

// ══════════════════════════════════════════════════════════════
// TAB: PRESUPUESTO VS. REAL (por obra y período — solo lectura)
// ══════════════════════════════════════════════════════════════
function TabPresupuesto() {
  const [obras,        setObras]        = useState([])
  const [rubros,       setRubros]       = useState([])
  const [obraId,       setObraId]       = useState('')
  const [periodo,      setPeriodo]      = useState(periodoActual())
  const [presupuestos, setPresupuestos] = useState([])
  const [movimientos,  setMovimientos]  = useState([])
  const [cargando,     setCargando]     = useState(false)
  const [error,        setError]        = useState('')
  const [expandidos,   setExpandidos]   = useState(new Set())

  const modoTodos = periodo === 'todos'

  useEffect(() => {
    async function cargarMaestros() {
      const [{ data: dataObras }, { data: dataRubros }] = await Promise.all([
        supabase.from('obras').select('id, codigo, nombre, cliente').eq('activa', true).order('codigo'),
        supabase.from('rubros').select('id, nombre, tipo').order('nombre'),
      ])
      setObras(dataObras ?? []); setRubros(dataRubros ?? [])
    }
    cargarMaestros()
  }, [])

  const cargarAnalisis = useCallback(async () => {
    if (!obraId) { setPresupuestos([]); setMovimientos([]); return }
    setCargando(true); setError(''); setExpandidos(new Set())
    let qPres = supabase.from('presupuestos').select('id, rubro_id, concepto, monto, periodo').eq('obra_id', obraId)
    let qMov  = supabase.from('movimientos').select('id, rubro_id, concepto, proveedor_cliente, monto_bruto, periodo').eq('obra_id', obraId).eq('categoria', 'factura').eq('tipo', 'egreso')
    if (!modoTodos) { qPres = qPres.eq('periodo', periodo); qMov = qMov.eq('periodo', periodo) }
    const [{ data: dataPres, error: errPres }, { data: dataMov, error: errMov }] = await Promise.all([qPres, qMov])
    if (errPres || errMov) { setError('No se pudo cargar el análisis. Intentá de nuevo.'); setCargando(false); return }
    setPresupuestos(dataPres ?? []); setMovimientos(dataMov ?? []); setCargando(false)
  }, [obraId, periodo, modoTodos])

  useEffect(() => { cargarAnalisis() }, [cargarAnalisis])

  // El matching de una factura real contra el presupuesto es por Obra + Rubro
  // + Período (el concepto que se tipea al cargar la factura es texto libre y
  // casi nunca coincide con el del presupuesto, así que no participa del
  // matching — antes eso generaba dos filas separadas para el mismo rubro).
  const analisisPeriodo = useMemo(() => {
    if (!obraId || modoTodos) return null
    const rubroNombre = id => rubros.find(r => r.id === id)?.nombre ?? 'Sin rubro'
    const presPorRubro = {}
    presupuestos.forEach(p => { presPorRubro[p.rubro_id] = (presPorRubro[p.rubro_id] ?? 0) + Number(p.monto) })
    const gastoPorRubro = {}
    movimientos.forEach(m => { if (!m.rubro_id) return; gastoPorRubro[m.rubro_id] = (gastoPorRubro[m.rubro_id] ?? 0) + Number(m.monto_bruto) })
    const rubrosInv = new Set([...Object.keys(presPorRubro), ...Object.keys(gastoPorRubro)])
    const movSinPresupuesto = []
    const grupos = []
    rubrosInv.forEach(rubroId => {
      const subtotalPres = presPorRubro[rubroId] ?? 0
      const subtotalGast = gastoPorRubro[rubroId] ?? 0
      const subtotalDif  = subtotalPres - subtotalGast
      const subtotalPct  = subtotalPres > 0 ? (subtotalGast / subtotalPres) * 100 : 0
      const sinPresupuesto = subtotalPres === 0
      if (sinPresupuesto && subtotalGast > 0)
        movimientos.filter(m => m.rubro_id === rubroId).forEach(m => movSinPresupuesto.push({ ...m, rubroNombre: rubroNombre(rubroId) }))
      grupos.push({ rubroId, rubroNombre: rubroNombre(rubroId), subtotalPres, subtotalGast, subtotalDif, subtotalPct, sinPresupuesto })
    })
    grupos.sort((a, b) => a.rubroNombre.localeCompare(b.rubroNombre, 'es'))
    const totalPres = grupos.reduce((s, g) => s + g.subtotalPres, 0)
    const totalGast = grupos.reduce((s, g) => s + g.subtotalGast, 0)
    return { grupos, totalPres, totalGast, totalDif: totalPres - totalGast, totalPct: totalPres > 0 ? (totalGast / totalPres) * 100 : 0, movSinPresupuesto }
  }, [presupuestos, movimientos, obraId, rubros, modoTodos])

  const analisisTodos = useMemo(() => {
    if (!obraId || !modoTodos) return null
    const rubroNombre = id => rubros.find(r => r.id === id)?.nombre ?? 'Sin rubro'
    const mapa = {}
    const asegurar = (rubroId, per) => { if (!mapa[rubroId]) mapa[rubroId] = {}; if (!mapa[rubroId][per]) mapa[rubroId][per] = { pres: 0, gasto: 0 } }
    presupuestos.forEach(p => { asegurar(p.rubro_id, p.periodo); mapa[p.rubro_id][p.periodo].pres += Number(p.monto) })
    movimientos.forEach(m => { if (!m.rubro_id) return; asegurar(m.rubro_id, m.periodo); mapa[m.rubro_id][m.periodo].gasto += Number(m.monto_bruto) })
    const grupos = Object.entries(mapa).map(([rubroId, periodosMapa]) => {
      const periodos = Object.keys(periodosMapa).sort()
      const filasPeriodo = periodos.map(per => {
        const { pres, gasto } = periodosMapa[per]
        return { periodo: per, label: labelPeriodo(per), pres, gasto, diferencia: pres - gasto, pct: pres > 0 ? (gasto / pres) * 100 : 0, sinPresupuesto: pres === 0 }
      })
      const subtotalPres = filasPeriodo.reduce((s, f) => s + f.pres, 0)
      const subtotalGast = filasPeriodo.reduce((s, f) => s + f.gasto, 0)
      return { rubroId, rubroNombre: rubroNombre(rubroId), filasPeriodo, subtotalPres, subtotalGast, subtotalDif: subtotalPres - subtotalGast, subtotalPct: subtotalPres > 0 ? (subtotalGast / subtotalPres) * 100 : 0, sinPresupuesto: subtotalPres === 0 }
    })
    grupos.sort((a, b) => a.rubroNombre.localeCompare(b.rubroNombre, 'es'))
    const totalPres = grupos.reduce((s, g) => s + g.subtotalPres, 0)
    const totalGast = grupos.reduce((s, g) => s + g.subtotalGast, 0)
    return { grupos, totalPres, totalGast, totalDif: totalPres - totalGast, totalPct: totalPres > 0 ? (totalGast / totalPres) * 100 : 0 }
  }, [presupuestos, movimientos, obraId, rubros, modoTodos])

  const obraActual = obras.find(o => o.id === obraId)
  const periodoLabel = modoTodos ? 'Todos los períodos' : PERIODOS.find(p => p.value === periodo)?.label ?? periodo
  const analisis = modoTodos ? analisisTodos : analisisPeriodo
  const hayDatos = analisis && analisis.grupos.length > 0

  function toggleExpandido(rubroId) {
    setExpandidos(prev => { const next = new Set(prev); next.has(rubroId) ? next.delete(rubroId) : next.add(rubroId); return next })
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Obra</label>
            <select value={obraId} onChange={e => setObraId(e.target.value)} className={selCls}>
              <option value="">— Seleccioná una obra —</option>
              {obras.map(o => <option key={o.id} value={o.id}>{o.codigo} · {o.nombre} ({o.cliente})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Período</label>
            <select value={periodo} onChange={e => setPeriodo(e.target.value)} className={selCls}>
              <option value="todos">— Todos los períodos —</option>
              {PERIODOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {!obraId && <EstadoVacio titulo="Seleccioná una obra" descripcion="Elegí una obra y un período para ver el análisis presupuestario." />}

      {obraId && cargando && (
        <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
          <span className="w-5 h-5 border-2 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
          <span className="text-sm">Calculando análisis…</span>
        </div>
      )}

      {obraId && !cargando && !hayDatos && (
        <EstadoVacio titulo="Sin datos para esta combinación"
          descripcion={`No hay presupuestos ni facturas para ${obraActual?.nombre ?? 'esta obra'}${modoTodos ? '' : ` en ${periodoLabel}`}.`} />
      )}

      {obraId && !cargando && hayDatos && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-slate-600 text-sm">
              <span className="font-semibold text-slate-800">{obraActual?.codigo} · {obraActual?.nombre}</span>
              <span className="text-slate-300 mx-2">·</span>{periodoLabel}
            </p>
            {modoTodos && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full border"
                style={{ backgroundColor: '#e0f2fe', color: '#0e7490', borderColor: '#a5f3fc' }}>
                Hacé clic en un rubro para ver el desglose por mes
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <CardResumen label="Total presupuestado" valor={fmtARS(analisis.totalPres)} color="text-slate-900" />
            <CardResumen label="Total gastado" valor={fmtARS(analisis.totalGast)} color="text-slate-900" />
            <CardResumen label="Diferencia disponible" valor={fmtARS(analisis.totalDif)}
              color={analisis.totalDif >= 0 ? 'text-emerald-600' : 'text-red-600'}
              subLabel={analisis.totalPres > 0 ? `${fmtPct(analisis.totalPct)} ejecutado` : undefined} />
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80">
                    {modoTodos && <Th>{/* chevron */}</Th>}
                    <Th>Rubro</Th>
                    <Th align="right">Presupuestado</Th>
                    <Th align="right">Gastado real</Th>
                    <Th align="right">Diferencia</Th>
                    <Th>% Ejecutado</Th>
                  </tr>
                </thead>
                <tbody>
                  {modoTodos
                    ? analisis.grupos.map(grupo => <GrupoRubroTodos key={grupo.rubroId} grupo={grupo} expandido={expandidos.has(grupo.rubroId)} onToggle={() => toggleExpandido(grupo.rubroId)} />)
                    : analisis.grupos.map(grupo => <GrupoRubroPeriodo key={grupo.rubroId} grupo={grupo} />)
                  }
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#e0f2fe' }} className="border-t-2 border-cyan-100">
                    {modoTodos && <td />}
                    <td className="px-5 py-3.5 text-sm font-bold" style={{ color: '#0e7490' }}>Total general</td>
                    <td className="px-5 py-3.5 text-right font-bold tabular-nums" style={{ color: '#0e7490' }}>{fmtARS(analisis.totalPres)}</td>
                    <td className={`px-5 py-3.5 text-right font-bold tabular-nums ${analisis.totalPct > 100 ? 'text-red-700' : ''}`}
                      style={analisis.totalPct <= 100 ? { color: '#0e7490' } : {}}>{fmtARS(analisis.totalGast)}</td>
                    <td className={`px-5 py-3.5 text-right font-bold tabular-nums ${analisis.totalDif >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmtARS(analisis.totalDif)}</td>
                    <td className="px-5 py-3.5">
                      {analisis.totalPres > 0 ? <BarraProgreso pct={analisis.totalPct} sinPresupuesto={false} /> : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {!modoTodos && analisis.movSinPresupuesto?.length > 0 && (
            <SeccionSinPresupuesto movimientos={analisis.movSinPresupuesto} />
          )}
        </>
      )}
    </div>
  )
}

function GrupoRubroPeriodo({ grupo }) {
  const superado = grupo.subtotalPct > 100 && grupo.subtotalPres > 0
  return (
    <tr className={`border-b border-slate-100 transition-colors ${superado ? 'bg-red-50' : 'hover:bg-slate-50/60'}`}>
      <td className="px-5 py-3 text-xs">
        <div className="flex items-center gap-2">
          <PuntoSemaforo pct={grupo.subtotalPct} sinPresupuesto={grupo.sinPresupuesto} />
          <span className="font-semibold text-slate-800">{grupo.rubroNombre}</span>
        </div>
      </td>
      <td className="px-5 py-3 text-right tabular-nums text-slate-600 text-xs">{grupo.subtotalPres > 0 ? fmtARS(grupo.subtotalPres) : <span className="text-slate-300">—</span>}</td>
      <td className={`px-5 py-3 text-right tabular-nums text-xs font-medium ${superado ? 'text-red-700' : 'text-slate-600'}`}>{grupo.subtotalGast > 0 ? fmtARS(grupo.subtotalGast) : <span className="text-slate-300">—</span>}</td>
      <td className={`px-5 py-3 text-right tabular-nums text-xs ${grupo.sinPresupuesto ? 'text-slate-400' : grupo.subtotalDif >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{grupo.sinPresupuesto ? '—' : fmtARS(grupo.subtotalDif)}</td>
      <td className="px-5 py-3"><BarraProgreso pct={grupo.subtotalPct} sinPresupuesto={grupo.sinPresupuesto} /></td>
    </tr>
  )
}

function GrupoRubroTodos({ grupo, expandido, onToggle }) {
  const superado = grupo.subtotalPct > 100 && grupo.subtotalPres > 0
  return (
    <>
      <tr onClick={onToggle} className={`border-b border-slate-200 cursor-pointer select-none transition-colors ${superado ? 'bg-red-50 hover:bg-red-100' : 'bg-slate-50 hover:bg-slate-100'}`}>
        <td className="pl-4 pr-2 py-3.5 w-8">
          <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${expandido ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </td>
        <td className="px-3 py-3.5 text-sm font-bold text-slate-800">
          <div className="flex items-center gap-2"><PuntoSemaforo pct={grupo.subtotalPct} sinPresupuesto={grupo.sinPresupuesto} />{grupo.rubroNombre}</div>
        </td>
        <td className="px-5 py-3.5 text-right tabular-nums text-sm font-semibold text-slate-700">{grupo.subtotalPres > 0 ? fmtARS(grupo.subtotalPres) : <span className="text-slate-400 font-normal">—</span>}</td>
        <td className={`px-5 py-3.5 text-right tabular-nums text-sm font-semibold ${superado ? 'text-red-700' : 'text-slate-700'}`}>{grupo.subtotalGast > 0 ? fmtARS(grupo.subtotalGast) : <span className="text-slate-400 font-normal">—</span>}</td>
        <td className={`px-5 py-3.5 text-right tabular-nums text-sm font-semibold ${grupo.sinPresupuesto ? 'text-slate-400' : grupo.subtotalDif >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{grupo.sinPresupuesto ? '—' : fmtARS(grupo.subtotalDif)}</td>
        <td className="px-5 py-3.5"><BarraProgreso pct={grupo.subtotalPct} sinPresupuesto={grupo.sinPresupuesto} /></td>
      </tr>
      {expandido && grupo.filasPeriodo.map(fila => {
        const filaSuperada = fila.pct > 100 && !fila.sinPresupuesto
        return (
          <tr key={fila.periodo} className={`border-b border-slate-100 transition-colors ${filaSuperada ? 'bg-red-50' : 'bg-white hover:bg-slate-50/60'}`}>
            <td className="pl-4 pr-2 py-2.5"><div className="w-4 border-l-2 border-slate-200 h-4 ml-1" /></td>
            <td className="px-3 py-2.5 text-xs text-slate-600 pl-6">
              <div className="flex items-center gap-2"><PuntoSemaforo pct={fila.pct} sinPresupuesto={fila.sinPresupuesto} />{fila.label}</div>
            </td>
            <td className="px-5 py-2.5 text-right tabular-nums text-xs text-slate-600">{fila.pres > 0 ? fmtARS(fila.pres) : <span className="text-slate-300">—</span>}</td>
            <td className={`px-5 py-2.5 text-right tabular-nums text-xs ${filaSuperada ? 'text-red-700 font-medium' : 'text-slate-600'}`}>{fila.gasto > 0 ? fmtARS(fila.gasto) : <span className="text-slate-300">—</span>}</td>
            <td className={`px-5 py-2.5 text-right tabular-nums text-xs ${fila.sinPresupuesto ? 'text-slate-400' : fila.diferencia >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fila.sinPresupuesto ? '—' : fmtARS(fila.diferencia)}</td>
            <td className="px-5 py-2.5"><BarraProgreso pct={fila.pct} sinPresupuesto={fila.sinPresupuesto} /></td>
          </tr>
        )
      })}
    </>
  )
}

function SeccionSinPresupuesto({ movimientos }) {
  const total = movimientos.reduce((s, m) => s + Number(m.monto_bruto), 0)
  return (
    <div className="bg-white border border-orange-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-orange-100 bg-orange-50 flex items-center gap-3">
        <svg className="w-4 h-4 text-orange-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        <div>
          <p className="text-orange-800 font-bold text-sm">Facturas sin presupuesto asignado</p>
          <p className="text-orange-600 text-xs mt-0.5">Estas facturas tienen rubro pero no hay presupuesto cargado para ese rubro en este período.</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100 bg-slate-50/80"><Th>Proveedor</Th><Th>Rubro</Th><Th>Concepto</Th><Th align="right">Monto</Th></tr></thead>
          <tbody>
            {movimientos.map((m, i) => (
              <tr key={m.id ?? i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-5 py-3 text-slate-700 text-xs">{m.proveedor_cliente ?? '—'}</td>
                <td className="px-5 py-3 text-xs"><span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full text-xs font-semibold border border-orange-100">{m.rubroNombre}</span></td>
                <td className="px-5 py-3 text-slate-500 text-xs">{m.concepto ?? '—'}</td>
                <td className="px-5 py-3 text-right tabular-nums font-semibold text-red-600 text-xs">{fmtARS(m.monto_bruto)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t border-slate-100 bg-slate-50/80"><td colSpan={3} className="px-5 py-3 text-xs font-bold text-slate-700">Total sin presupuesto</td><td className="px-5 py-3 text-right tabular-nums font-bold text-red-700 text-xs">{fmtARS(total)}</td></tr></tfoot>
        </table>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// FilaProyeccionDirectorio: mismo control que en Finanzas —
// Mantener proyección / No se cumple / Reprogramar
// ══════════════════════════════════════════════════════════════
function FilaProyeccionDirectorio({ mov, nuevaFecha, guardando, error, onChangeFecha, onGuardar, onCancelar }) {
  const [modo, setModo] = useState(mov.estado_proyeccion === 'normal' ? '' : mov.estado_proyeccion)

  return (
    <tr style={{ backgroundColor: '#f5f3ff' }} className="border-b border-violet-100">
      <td className="px-4 py-3" colSpan={8}>
        <div className="flex flex-wrap items-start gap-4">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 mb-1">
              {mov.proveedor_cliente ?? mov.concepto ?? 'Movimiento'} — {fmtARS(mov.montoEfectivo)}
            </p>
            <p className="text-xs text-slate-400">
              Fecha actual: {fmtFecha(mov.fecha_pago)}
              {mov.fecha_pago_original && ` (original: ${fmtFecha(mov.fecha_pago_original)})`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setModo('normal')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors
                ${modo === 'normal' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              Mantener proyección
            </button>
            <button
              onClick={() => setModo('no_cumple')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors
                ${modo === 'no_cumple' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              No se cumple
            </button>
            <button
              onClick={() => setModo('reprogramado')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors
                ${modo === 'reprogramado' ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              Reprogramar
            </button>
          </div>

          {modo === 'reprogramado' && (
            <div>
              <label className="block text-[11px] font-semibold text-violet-700 mb-1">Nueva fecha estimada</label>
              <input
                type="date"
                value={nuevaFecha}
                onChange={e => onChangeFecha(e.target.value)}
                className="px-3 py-2 text-sm rounded-xl border border-violet-200 text-slate-900 bg-white
                          focus:outline-none focus:ring-2 focus:border-transparent"
                autoFocus
              />
            </div>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {error && <span className="text-xs text-red-600 font-medium">{error}</span>}
            <button
              onClick={onCancelar}
              disabled={guardando}
              className="px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700
                        transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={() => onGuardar(modo || 'normal')}
              disabled={guardando || !modo}
              className="px-4 py-2 text-sm font-semibold text-white rounded-xl transition-colors
                        disabled:opacity-50 disabled:cursor-not-allowed bg-violet-600 hover:bg-violet-700"
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          "No se cumple" deja el movimiento visible como pendiente pero no lo suma ni resta del saldo acumulado.
          "Reprogramar" mueve la fecha de pago y guarda la fecha original para no perder el historial. Nada se borra.
        </p>
      </td>
    </tr>
  )
}

// ── Helpers de UI compartidos por ambas pestañas ───────────────────────────────

function EstadoVacio({ titulo, descripcion }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-slate-100 shadow-sm">
      <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: '#e0f2fe', color: '#0e7490' }}>
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
        </svg>
      </div>
      <p className="text-slate-700 font-bold text-sm">{titulo}</p>
      <p className="text-slate-400 text-xs mt-1 max-w-sm">{descripcion}</p>
    </div>
  )
}

function Th({ children, align = 'left' }) {
  return <th className={`px-4 py-3.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</th>
}

const selCls = `w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200
  text-slate-900 bg-white transition-shadow focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:border-teal-400`
