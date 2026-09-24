// pages/finanzas/Exportar.jsx
// Módulo de exportación para el rol 'finanzas'.
// Ruta: /finanzas/exportar
//
// Genera DOS archivos:
//   1. PDF — 4 páginas para presentar al Directorio (jsPDF + autotable)
//   2. Excel — 5 hojas con datos y formato visual (XML XLSX nativo)
//
// El Excel usa XML XLSX directo para tener control total sobre
// colores, estilos y formato sin depender de librerías externas.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../../supabaseClient'
import Navbar from '../../components/Navbar'

// ═══════════════════════════════════════════════════════════════
// PALETA PDF
// ═══════════════════════════════════════════════════════════════
const C = {
  azulOscuro:  [30,  64,  175],
  azulClaro:   [191, 219, 254],
  azulMuyClaro:[219, 234, 254],
  verde:       [5,   150, 105],
  verdePastel: [209, 250, 229],
  verdeRow:    [240, 253, 244],
  rojo:        [220, 38,  38],
  rojoPastel:  [254, 226, 226],
  rojoRow:     [255, 228, 228],
  naranja:     [217, 119, 6],
  naranjaPast: [254, 243, 199],
  grisOscuro:  [226, 232, 240],
  grisClaro:   [241, 245, 249],
  grisMuyClaro:[248, 250, 252],
  texto:       [15,  23,  42],
  blanco:      [255, 255, 255],
  grisTexto:   [100, 116, 139],
}

// ═══════════════════════════════════════════════════════════════
// UTILIDADES COMPARTIDAS
// ═══════════════════════════════════════════════════════════════

const fmtARS = n => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 2,
}).format(n ?? 0)

const fmtPct = n => `${Number(n).toFixed(1)}%`

const fmtFecha = str =>
  str ? new Date(str + 'T00:00:00').toLocaleDateString('es-AR') : ''

const periodoDeStr = fechaStr => {
  if (!fechaStr) return null
  const d = new Date(fechaStr + 'T00:00:00')
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
}

const labelPeriodo = iso => {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  const s = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const hoyISO = () => {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-${String(h.getDate()).padStart(2,'0')}`
}

const ahora = () => new Date().toLocaleDateString('es-AR', {
  day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit',
})

function generarPeriodos() {
  const lista = []
  const hoy   = new Date()
  for (let i = -24; i <= 12; i++) {
    const d     = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
    const label = d.toLocaleDateString('es-AR', { month:'long', year:'numeric' })
    lista.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return lista
}
const PERIODOS = generarPeriodos()

const periodoActual = () => {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-01`
}

// ═══════════════════════════════════════════════════════════════
// CARGA DE DATOS DESDE SUPABASE
// ═══════════════════════════════════════════════════════════════
async function cargarDatos(periodo) {
  const hoy = hoyISO()

  const [
    { data: movTodos,   error: e1 },
    { data: saldosData, error: e2 },
    { data: cuentas,    error: e3 },
    { data: notasData,  error: e4 },
    { data: presData,   error: e5 },
    { data: obrasData,  error: e6 },
    { data: rubrosData, error: e7 },
    { data: movPeriodo, error: e8 },
  ] = await Promise.all([
    supabase.from('movimientos')
      .select('id,tipo,categoria,proveedor_cliente,numero_factura,forma_pago,numero_op,monto_bruto,monto_neto,estado,periodo,fecha_pago,obra_id,rubro_id,cuenta_id,concepto,observaciones,created_at,estado_proyeccion,fecha_pago_original')
      .order('fecha_pago', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase.from('saldos_iniciales')
      .select('id,cuenta_id,monto,fecha,created_at')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('cuentas').select('id,nombre,tipo').eq('activa', true).order('nombre'),
    supabase.from('notas').select('movimiento_id,tipo_nota,monto'),
    supabase.from('presupuestos').select('id,obra_id,rubro_id,concepto,periodo,monto').eq('periodo', periodo),
    supabase.from('obras').select('id,codigo,nombre,cliente').eq('activa', true).order('codigo'),
    supabase.from('rubros').select('id,nombre,tipo'),
    supabase.from('movimientos')
      .select('id,tipo,categoria,monto_bruto,obra_id,rubro_id,concepto,proveedor_cliente')
      .eq('periodo', periodo).eq('categoria', 'factura').eq('tipo', 'egreso'),
  ])

  const errs = [e1,e2,e3,e4,e5,e6,e7,e8].filter(Boolean)
  if (errs.length) throw new Error('Error al cargar datos de Supabase.')

  const obraMap  = {}; (obrasData  ?? []).forEach(o => obraMap[o.id]  = o)
  const rubroMap = {}; (rubrosData ?? []).forEach(r => rubroMap[r.id] = r)

  const saldosPorCuenta = {}
  ;(saldosData ?? []).forEach(s => { if (!saldosPorCuenta[s.cuenta_id]) saldosPorCuenta[s.cuenta_id] = s })

  const notasPorMov = {}
  ;(notasData ?? []).forEach(n => {
    if (!notasPorMov[n.movimiento_id]) notasPorMov[n.movimiento_id] = []
    notasPorMov[n.movimiento_id].push(n)
  })

  const movEnriq = (movTodos ?? []).map(m => {
    const base  = m.estado === 'ejecutado' ? Number(m.monto_neto ?? m.monto_bruto ?? 0) : Number(m.monto_bruto ?? 0)
    const notas = notasPorMov[m.id] ?? []
    const deb   = notas.filter(n => n.tipo_nota === 'debito').reduce((s,n)  => s + Number(n.monto), 0)
    const cred  = notas.filter(n => n.tipo_nota === 'credito').reduce((s,n) => s + Number(n.monto), 0)
    return {
      ...m,
      montoEfectivo: m.categoria === 'factura' ? base + deb - cred : base,
      obraCodigo:    obraMap[m.obra_id]?.codigo   ?? '',
      obraNombre:    obraMap[m.obra_id]?.nombre   ?? '',
      rubroNombre:   rubroMap[m.rubro_id]?.nombre ?? '',
    }
  })

  const sumaSaldosBase = Object.values(saldosPorCuenta).reduce((acc,s) => acc + Number(s.monto ?? 0), 0)
  let saldo = sumaSaldosBase
  const movConSaldo = movEnriq.map(m => {
    if (m.estado_proyeccion !== 'no_cumple') {
      saldo += m.tipo === 'ingreso' ? m.montoEfectivo : -m.montoEfectivo
    }
    return { ...m, saldoAcumulado: saldo }
  })

  let saldoDisponible = sumaSaldosBase, ingresosProyect = 0, egresosProyect = 0
  movEnriq.forEach(m => {
    if (m.estado_proyeccion === 'no_cumple') return
    const fecha = m.fecha_pago ?? m.periodo
    if (m.estado === 'ejecutado' && (!fecha || fecha <= hoy)) {
      saldoDisponible += m.tipo === 'ingreso' ? m.montoEfectivo : -m.montoEfectivo
    }
    if (m.estado === 'proyectado' && (!fecha || fecha >= hoy)) {
      if (m.tipo === 'ingreso') ingresosProyect += m.montoEfectivo
      else                      egresosProyect  += m.montoEfectivo
    }
  })

  const presMap = {}, gastoMap = {}
  ;(presData ?? []).forEach(p => {
    const k = `${p.obra_id}|${p.rubro_id}|${p.concepto ?? ''}`
    presMap[k] = (presMap[k] ?? 0) + Number(p.monto)
  })
  ;(movPeriodo ?? []).forEach(m => {
    const k = `${m.obra_id}|${m.rubro_id}|${m.concepto ?? ''}`
    gastoMap[k] = (gastoMap[k] ?? 0) + Number(m.monto_bruto)
  })

  const todasClaves = new Set([...Object.keys(presMap), ...Object.keys(gastoMap)])
  const analisisPV = []
  todasClaves.forEach(k => {
    const [obraId, rubroId, concepto] = k.split('|')
    const presupuestado = presMap[k]  ?? 0
    const gastado       = gastoMap[k] ?? 0
    const diferencia    = presupuestado - gastado
    const pct           = presupuestado > 0 ? (gastado / presupuestado) * 100 : 0
    const semaforo      = presupuestado === 0 ? 'Sin presupuesto' : pct > 100 ? 'Superado' : pct >= 80 ? 'Atención' : 'OK'
    analisisPV.push({
      obraCodigo: obraMap[obraId]?.codigo ?? '', obraNombre: obraMap[obraId]?.nombre ?? '',
      rubroNombre: rubroMap[rubroId]?.nombre ?? '', concepto: concepto ?? '',
      presupuestado, gastado, diferencia, pct, semaforo,
    })
  })
  analisisPV.sort((a,b) => a.obraCodigo.localeCompare(b.obraCodigo) || a.rubroNombre.localeCompare(b.rubroNombre))
  const obrasEnRiesgo = [...analisisPV].filter(r => r.pct >= 80 || r.semaforo === 'Sin presupuesto').sort((a,b) => b.pct - a.pct)

  return {
    cuentas: cuentas ?? [], saldosPorCuenta, sumaSaldosBase,
    saldoDisponible, ingresosProyect, egresosProyect,
    posicionFutura: saldoDisponible + ingresosProyect - egresosProyect,
    movConSaldo, movEnriq, analisisPV, obrasEnRiesgo,
  }
}

// ═══════════════════════════════════════════════════════════════
// GENERADOR DE PDF (sin cambios respecto a la versión anterior)
// ═══════════════════════════════════════════════════════════════
const PW = 297, PH = 210, ML = 15, MR = 15, CW = PW - ML - MR

function dibujarCromo(doc, periodoLabel, paginaActual, totalPaginas, generadoEn) {
  doc.setFillColor(...C.azulOscuro); doc.rect(0, 0, PW, 10, 'F')
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.blanco)
  doc.text('Cash Flow Predictivo', ML, 6.5)
  doc.text(periodoLabel, PW / 2, 6.5, { align: 'center' })
  doc.text(`Página ${paginaActual} de ${totalPaginas}`, PW - MR, 6.5, { align: 'right' })
  doc.setDrawColor(...C.grisOscuro); doc.setLineWidth(0.3); doc.line(ML, PH - 8, PW - MR, PH - 8)
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.grisTexto)
  doc.text('Confidencial — uso interno', ML, PH - 4)
  doc.text(`Generado: ${generadoEn}`, PW - MR, PH - 4, { align: 'right' })
  doc.setTextColor(...C.texto)
}

function dibujarTituloSeccion(doc, titulo, y) {
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.azulOscuro)
  doc.text(titulo, ML, y)
  doc.setDrawColor(...C.azulOscuro); doc.setLineWidth(0.5); doc.line(ML, y + 1.5, ML + 60, y + 1.5)
  doc.setTextColor(...C.texto); return y + 7
}

function dibujarCard(doc, x, y, w, h, label, valor, colorValor) {
  doc.setFillColor(...C.blanco); doc.setDrawColor(...C.azulClaro); doc.setLineWidth(0.4)
  doc.roundedRect(x, y, w, h, 2, 2, 'FD')
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.grisTexto)
  doc.text(label, x + w / 2, y + 5.5, { align: 'center' })
  doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(...(colorValor ?? C.texto))
  doc.text(valor, x + w / 2, y + 12.5, { align: 'center' })
  doc.setTextColor(...C.texto)
}

async function generarPDF(periodo, datos) {
  const periodoLabel = labelPeriodo(periodo)
  const generadoEn  = ahora()
  const TOTAL_PAGS  = 4
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  // Página 1 — Resumen
  dibujarCromo(doc, periodoLabel, 1, TOTAL_PAGS, generadoEn)
  let y = 17
  y = dibujarTituloSeccion(doc, 'Resumen Ejecutivo', y)
  const kpis = [
    { label: 'Saldo disponible hoy',    valor: fmtARS(datos.saldoDisponible), color: null },
    { label: 'Ingresos proyectados',    valor: fmtARS(datos.ingresosProyect), color: C.verde },
    { label: 'Egresos proyectados',     valor: fmtARS(datos.egresosProyect),  color: C.rojo },
    { label: 'Posición futura estimada',valor: fmtARS(datos.posicionFutura),  color: datos.posicionFutura >= 0 ? C.verde : C.rojo },
  ]
  const cardW = (CW - 9) / 4, cardH = 17
  kpis.forEach((k, i) => dibujarCard(doc, ML + i * (cardW + 3), y, cardW, cardH, k.label, k.valor, k.color))
  y += cardH + 8
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.azulOscuro)
  doc.text('Saldos por cuenta', ML, y); y += 3
  const filasCtas = datos.cuentas.map(c => {
    const s = datos.saldosPorCuenta[c.id]
    return [c.nombre, c.tipo === 'banco' ? 'Banco' : 'Fondo inversión', fmtARS(s ? Number(s.monto) : 0), s ? fmtFecha(s.fecha) : 'Sin datos']
  })
  const totalSaldos = Object.values(datos.saldosPorCuenta).reduce((a,s) => a + Number(s.monto ?? 0), 0)
  autoTable(doc, {
    startY: y,
    head: [['Cuenta', 'Tipo', 'Saldo inicial', 'Fecha de corte']],
    body: [...filasCtas, [{ content: 'Total disponible', styles: { fontStyle: 'bold' } }, '', { content: fmtARS(totalSaldos), styles: { fontStyle: 'bold', halign: 'right' } }, '']],
    styles: { fontSize: 8.5, cellPadding: 2.5, textColor: C.texto },
    headStyles: { fillColor: C.azulClaro, textColor: C.azulOscuro, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: C.grisMuyClaro },
    columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 35, halign: 'center' }, 2: { cellWidth: 45, halign: 'right' }, 3: { cellWidth: 35, halign: 'center' } },
    margin: { left: ML, right: MR }, tableWidth: CW, didDrawPage: () => {},
  })

  // Página 2 — Cash Flow
  doc.addPage(); dibujarCromo(doc, periodoLabel, 2, TOTAL_PAGS, generadoEn)
  y = 17; y = dibujarTituloSeccion(doc, `Cash Flow — ${periodoLabel}`, y)
  const filasCF = []; let ultimoMes = null, totIng = 0, totEgr = 0
  datos.movConSaldo.forEach(m => {
    const mesMov = m.fecha_pago ? periodoDeStr(m.fecha_pago) : m.periodo
    if (mesMov !== ultimoMes) { filasCF.push({ _sep: true, label: mesMov ? labelPeriodo(mesMov) : 'Sin fecha' }); ultimoMes = mesMov }
    if (m.tipo === 'ingreso') totIng += m.montoEfectivo; else totEgr += m.montoEfectivo
    filasCF.push({ _sep: false, mov: m })
  })
  const rowsCF = filasCF.map(f => {
    if (f._sep) return [{ content: f.label, colSpan: 8, styles: { fillColor: C.azulOscuro, textColor: C.blanco, fontStyle: 'bold', halign: 'center', fontSize: 8.5 } }]
    const m = f.mov, neg = m.saldoAcumulado < 0, bg = neg ? C.rojoRow : m.estado === 'ejecutado' ? C.verdeRow : null
    const cb = (extra = {}) => ({ fillColor: bg ?? C.blanco, textColor: C.texto, fontSize: 7.5, ...extra })
    return [
      { content: fmtFecha(m.fecha_pago), styles: cb({ halign: 'center' }) },
      { content: m.estado === 'ejecutado' ? 'Ejecutado' : 'Proyectado', styles: cb({ halign: 'center' }) },
      { content: m.categoria ?? '', styles: cb() },
      { content: m.proveedor_cliente ?? m.concepto ?? '', styles: cb() },
      { content: m.obraCodigo, styles: cb({ halign: 'center' }) },
      { content: m.tipo === 'ingreso' ? fmtARS(m.montoEfectivo) : '', styles: cb({ halign: 'right', textColor: m.tipo === 'ingreso' ? C.verde : C.texto }) },
      { content: m.tipo === 'egreso'  ? fmtARS(m.montoEfectivo) : '', styles: cb({ halign: 'right', textColor: m.tipo === 'egreso'  ? C.rojo  : C.texto }) },
      { content: fmtARS(m.saldoAcumulado), styles: cb({ halign: 'right', textColor: neg ? C.rojo : C.texto, fontStyle: neg ? 'bold' : 'normal' }) },
    ]
  })
  rowsCF.push([
    { content: 'Totales del período', colSpan: 5, styles: { fontStyle: 'bold', fillColor: C.grisOscuro, textColor: C.texto, fontSize: 8 } },
    { content: fmtARS(totIng), styles: { halign: 'right', fontStyle: 'bold', fillColor: C.grisOscuro, textColor: C.verde, fontSize: 8 } },
    { content: fmtARS(totEgr), styles: { halign: 'right', fontStyle: 'bold', fillColor: C.grisOscuro, textColor: C.rojo,  fontSize: 8 } },
    { content: fmtARS(totIng - totEgr), styles: { halign: 'right', fontStyle: 'bold', fillColor: C.grisOscuro, textColor: totIng - totEgr >= 0 ? C.verde : C.rojo, fontSize: 8 } },
  ])
  autoTable(doc, {
    startY: y, head: [['Fecha', 'Estado', 'Categoría', 'Proveedor/Cliente', 'Obra', 'Ingreso', 'Egreso', 'Saldo acumulado']],
    body: rowsCF, styles: { fontSize: 7.5, cellPadding: 1.8, overflow: 'ellipsize' },
    headStyles: { fillColor: C.azulClaro, textColor: C.azulOscuro, fontStyle: 'bold', halign: 'center', fontSize: 8 },
    columnStyles: { 0: { cellWidth: 22, halign: 'center' }, 1: { cellWidth: 22, halign: 'center' }, 2: { cellWidth: 26 }, 3: { cellWidth: 52 }, 4: { cellWidth: 20, halign: 'center' }, 5: { cellWidth: 34, halign: 'right' }, 6: { cellWidth: 34, halign: 'right' }, 7: { cellWidth: 34, halign: 'right' } },
    margin: { left: ML, right: MR, top: 12 }, tableWidth: CW,
    didDrawPage: () => { const pg = doc.internal.getCurrentPageInfo().pageNumber; if (pg > 2) dibujarCromo(doc, periodoLabel, pg, TOTAL_PAGS, generadoEn) },
  })

  // Página 3 — Presupuesto vs Real
  doc.addPage(); dibujarCromo(doc, periodoLabel, doc.internal.getNumberOfPages(), TOTAL_PAGS, generadoEn)
  y = 17; y = dibujarTituloSeccion(doc, `Presupuesto vs. Real — ${periodoLabel}`, y)
  const totPres = datos.analisisPV.reduce((s,r) => s + r.presupuestado, 0)
  const totGast = datos.analisisPV.reduce((s,r) => s + r.gastado, 0)
  const totDif  = totPres - totGast
  const card3W  = (CW - 6) / 3
  ;[{ label: 'Total presupuestado', valor: fmtARS(totPres), color: null }, { label: 'Total gastado', valor: fmtARS(totGast), color: null }, { label: 'Diferencia', valor: fmtARS(totDif), color: totDif >= 0 ? C.verde : C.rojo }]
    .forEach((k, i) => dibujarCard(doc, ML + i * (card3W + 3), y, card3W, 17, k.label, k.valor, k.color))
  y += 24
  const colorSem = { 'OK': C.verdePastel, 'Atención': C.naranjaPast, 'Superado': C.rojoPastel, 'Sin presupuesto': C.grisClaro }
  const textSem  = { 'OK': C.verde, 'Atención': C.naranja, 'Superado': C.rojo, 'Sin presupuesto': C.grisTexto }
  const labelSem = { 'OK': '● OK', 'Atención': '● Atención', 'Superado': '● Superado', 'Sin presupuesto': '● Sin presupuesto' }
  const gruposPVR = {}
  datos.analisisPV.forEach(r => { if (!gruposPVR[r.rubroNombre]) gruposPVR[r.rubroNombre] = []; gruposPVR[r.rubroNombre].push(r) })
  const rowsPVR = []
  Object.entries(gruposPVR).forEach(([rubro, filas]) => {
    filas.forEach(r => {
      const bg = colorSem[r.semaforo] ?? C.blanco
      rowsPVR.push([
        { content: r.obraCodigo, styles: { fillColor: bg, fontSize: 7.5 } }, { content: r.obraNombre, styles: { fillColor: bg, fontSize: 7.5 } },
        { content: r.rubroNombre, styles: { fillColor: bg, fontSize: 7.5 } }, { content: r.concepto, styles: { fillColor: bg, fontSize: 7.5 } },
        { content: fmtARS(r.presupuestado), styles: { fillColor: bg, halign: 'right', fontSize: 7.5 } },
        { content: fmtARS(r.gastado), styles: { fillColor: bg, halign: 'right', fontSize: 7.5 } },
        { content: fmtARS(r.diferencia), styles: { fillColor: bg, halign: 'right', fontSize: 7.5, textColor: r.diferencia >= 0 ? C.verde : C.rojo } },
        { content: r.presupuestado > 0 ? fmtPct(r.pct) : '—', styles: { fillColor: bg, halign: 'right', fontSize: 7.5 } },
        { content: labelSem[r.semaforo] ?? r.semaforo, styles: { fillColor: bg, textColor: textSem[r.semaforo] ?? C.texto, fontStyle: 'bold', fontSize: 7.5 } },
      ])
    })
    const stPres = filas.reduce((s,r) => s + r.presupuestado, 0), stGast = filas.reduce((s,r) => s + r.gastado, 0), stDif = stPres - stGast
    rowsPVR.push([
      { content: `Subtotal ${rubro}`, colSpan: 4, styles: { fillColor: C.grisOscuro, fontStyle: 'bold', fontSize: 7.5 } },
      { content: fmtARS(stPres), styles: { fillColor: C.grisOscuro, halign: 'right', fontStyle: 'bold', fontSize: 7.5 } },
      { content: fmtARS(stGast), styles: { fillColor: C.grisOscuro, halign: 'right', fontStyle: 'bold', fontSize: 7.5 } },
      { content: fmtARS(stDif),  styles: { fillColor: C.grisOscuro, halign: 'right', fontStyle: 'bold', fontSize: 7.5, textColor: stDif >= 0 ? C.verde : C.rojo } },
      { content: stPres > 0 ? fmtPct(stGast/stPres*100) : '—', styles: { fillColor: C.grisOscuro, halign: 'right', fontStyle: 'bold', fontSize: 7.5 } },
      { content: '', styles: { fillColor: C.grisOscuro } },
    ])
  })
  rowsPVR.push([
    { content: 'TOTAL GENERAL', colSpan: 4, styles: { fillColor: C.azulMuyClaro, fontStyle: 'bold', textColor: C.azulOscuro, fontSize: 8 } },
    { content: fmtARS(totPres), styles: { fillColor: C.azulMuyClaro, halign: 'right', fontStyle: 'bold', textColor: C.azulOscuro, fontSize: 8 } },
    { content: fmtARS(totGast), styles: { fillColor: C.azulMuyClaro, halign: 'right', fontStyle: 'bold', textColor: C.azulOscuro, fontSize: 8 } },
    { content: fmtARS(totDif),  styles: { fillColor: C.azulMuyClaro, halign: 'right', fontStyle: 'bold', textColor: totDif >= 0 ? C.verde : C.rojo, fontSize: 8 } },
    { content: totPres > 0 ? fmtPct(totGast/totPres*100) : '—', styles: { fillColor: C.azulMuyClaro, halign: 'right', fontStyle: 'bold', textColor: C.azulOscuro, fontSize: 8 } },
    { content: '', styles: { fillColor: C.azulMuyClaro } },
  ])
  autoTable(doc, {
    startY: y, head: [['Cód.', 'Obra', 'Rubro', 'Concepto', 'Presupuestado', 'Gastado', 'Diferencia', '% Ejec.', 'Semáforo']],
    body: rowsPVR, styles: { fontSize: 7.5, cellPadding: 1.8, overflow: 'ellipsize' },
    headStyles: { fillColor: C.azulClaro, textColor: C.azulOscuro, fontStyle: 'bold', halign: 'center', fontSize: 8 },
    columnStyles: { 0: { cellWidth: 13, halign: 'center' }, 1: { cellWidth: 38 }, 2: { cellWidth: 32 }, 3: { cellWidth: 35 }, 4: { cellWidth: 32, halign: 'right' }, 5: { cellWidth: 30, halign: 'right' }, 6: { cellWidth: 30, halign: 'right' }, 7: { cellWidth: 20, halign: 'right' }, 8: { cellWidth: 27 } },
    margin: { left: ML, right: MR, top: 12 }, tableWidth: CW,
    didDrawPage: () => { dibujarCromo(doc, periodoLabel, doc.internal.getNumberOfPages(), TOTAL_PAGS, generadoEn) },
  })

  // Página 4 — Obras en riesgo
  doc.addPage(); dibujarCromo(doc, periodoLabel, doc.internal.getNumberOfPages(), TOTAL_PAGS, generadoEn)
  y = 17; y = dibujarTituloSeccion(doc, 'Obras en Riesgo', y)
  doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(...C.grisTexto)
  doc.text('Rubros con ejecución ≥ 80% o sin presupuesto asignado, ordenados de mayor a menor porcentaje ejecutado.', ML, y)
  y += 6; doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.texto)
  if (datos.obrasEnRiesgo.length === 0) {
    doc.setFillColor(...C.verdePastel); doc.setDrawColor(...C.verde); doc.setLineWidth(0.5)
    doc.roundedRect(ML, y, CW, 14, 2, 2, 'FD')
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.verde)
    doc.text('✓  No hay obras en riesgo para este período', PW / 2, y + 8.5, { align: 'center' })
  } else {
    const rowsR = datos.obrasEnRiesgo.map(r => {
      const bg = colorSem[r.semaforo] ?? C.blanco
      return [
        { content: r.obraCodigo, styles: { fillColor: bg, fontSize: 7.5 } }, { content: r.obraNombre, styles: { fillColor: bg, fontSize: 7.5 } },
        { content: r.rubroNombre, styles: { fillColor: bg, fontSize: 7.5 } }, { content: r.concepto, styles: { fillColor: bg, fontSize: 7.5 } },
        { content: fmtARS(r.presupuestado), styles: { fillColor: bg, halign: 'right', fontSize: 7.5 } },
        { content: fmtARS(r.gastado), styles: { fillColor: bg, halign: 'right', fontSize: 7.5 } },
        { content: fmtARS(r.diferencia), styles: { fillColor: bg, halign: 'right', fontSize: 7.5, textColor: r.diferencia >= 0 ? C.verde : C.rojo } },
        { content: r.presupuestado > 0 ? fmtPct(r.pct) : '—', styles: { fillColor: bg, halign: 'right', fontSize: 7.5 } },
        { content: labelSem[r.semaforo] ?? r.semaforo, styles: { fillColor: bg, textColor: textSem[r.semaforo] ?? C.texto, fontStyle: 'bold', fontSize: 7.5 } },
      ]
    })
    autoTable(doc, {
      startY: y, head: [['Cód.', 'Obra', 'Rubro', 'Concepto', 'Presupuestado', 'Gastado', 'Diferencia', '% Ejec.', 'Semáforo']],
      body: rowsR, styles: { fontSize: 7.5, cellPadding: 1.8, overflow: 'ellipsize' },
      headStyles: { fillColor: [254, 215, 170], textColor: [124, 45, 18], fontStyle: 'bold', halign: 'center', fontSize: 8 },
      columnStyles: { 0: { cellWidth: 13, halign: 'center' }, 1: { cellWidth: 38 }, 2: { cellWidth: 32 }, 3: { cellWidth: 35 }, 4: { cellWidth: 32, halign: 'right' }, 5: { cellWidth: 30, halign: 'right' }, 6: { cellWidth: 30, halign: 'right' }, 7: { cellWidth: 20, halign: 'right' }, 8: { cellWidth: 27 } },
      margin: { left: ML, right: MR, top: 12 }, tableWidth: CW,
      didDrawPage: () => { dibujarCromo(doc, periodoLabel, doc.internal.getNumberOfPages(), TOTAL_PAGS, generadoEn) },
    })
  }

  // Corregir numeración de páginas
  const totalReal = doc.internal.getNumberOfPages()
  if (totalReal !== TOTAL_PAGS) {
    for (let p = 1; p <= totalReal; p++) {
      doc.setPage(p); doc.setFillColor(...C.azulOscuro); doc.rect(PW - MR - 30, 0, 30, 10, 'F')
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.blanco)
      doc.text(`Página ${p} de ${totalReal}`, PW - MR, 6.5, { align: 'right' })
    }
  }

  const mes = new Date(periodo + 'T00:00:00').toLocaleDateString('es-AR', { month: 'long' })
  const mesLabel = mes.charAt(0).toUpperCase() + mes.slice(1)
  const anio = new Date(periodo + 'T00:00:00').getFullYear()
  doc.save(`CashFlow_${mesLabel}_${anio}.pdf`)
}

// ═══════════════════════════════════════════════════════════════
// GENERADOR DE EXCEL (XML XLSX nativo — sin librerías)
// ═══════════════════════════════════════════════════════════════

// Convierte RGB [r,g,b] a hex ARGB para Excel: "FF1E40AF"
const toARGB = ([r,g,b]) => `FF${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`.toUpperCase()

// Colores Excel (ARGB)
const XL = {
  azulOscuro:   'FF1E40AF',
  azulClaro:    'FFBFDBFE',
  azulMuyClaro: 'FFDBEAFE',
  verde:        'FF059669',
  verdePastel:  'FFD1FAE5',
  verdeClaro:   'FFF0FFF4',
  rojo:         'FFDC2626',
  rojoPastel:   'FFFEE4E6',
  rojoClaro:    'FFFFE4E4',
  naranjaPast:  'FFFEF3C7',
  grisOscuro:   'FFE2E8F0',
  grisClaro:    'FFF1F5F9',
  grisMuyClaro: 'FFF8FAFC',
  blanco:       'FFFFFFFF',
  texto:        'FF0F172A',
  grisTexto:    'FF64748B',
  amarillo:     'FFFBBF24',
}

// Escapa caracteres XML
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

// Genera una celda XML
// t: tipo ('s'=string, 'n'=número, vacío=string inline)
// v: valor
// si: índice de shared string (si t='s')
// styleId: índice de estilo
function xlCell(col, row, value, styleId = 0, isNum = false) {
  const ref = `${col}${row}`
  if (value === null || value === undefined || value === '') {
    return `<c r="${ref}" s="${styleId}"><v>0</v></c>`
  }
  if (isNum) {
    return `<c r="${ref}" t="n" s="${styleId}"><v>${value}</v></c>`
  }
  return `<c r="${ref}" t="inlineStr" s="${styleId}"><is><t>${esc(value)}</t></is></c>`
}

// Convierte número de columna a letra(s): 1=A, 26=Z, 27=AA
function colLetter(n) {
  let s = ''
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
  return s
}

// Genera una fila completa de celdas a partir de un array de {value, styleId, isNum}
function xlRow(rowNum, cells) {
  const celdas = cells.map((c, i) => xlCell(colLetter(i + 1), rowNum, c.v, c.s ?? 0, c.n ?? false))
  return `<row r="${rowNum}">${celdas.join('')}</row>`
}

async function generarExcel(periodo, datos, periodoLabel) {
  // ── Definición de estilos ──────────────────────────────────
  // Los estilos en XLSX se definen como índices en styles.xml
  // Índices: 0=normal, 1=cabecera azul, 2=número normal, 3=número verde,
  //          4=número rojo, 5=separador mes, 6=fila verde, 7=fila roja,
  //          8=subtotal, 9=total general, 10=título KPI, 11=valor KPI normal,
  //          12=valor KPI verde, 13=valor KPI rojo, 14=naranja, 15=cabecera naranja
  //          16=número naranja, 17=bold normal

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="6">
    <font><sz val="10"/><color rgb="${XL.texto}"/><name val="Calibri"/></font>
    <font><sz val="10"/><b/><color rgb="${XL.blanco}"/><name val="Calibri"/></font>
    <font><sz val="10"/><b/><color rgb="${XL.azulOscuro}"/><name val="Calibri"/></font>
    <font><sz val="10"/><color rgb="${XL.verde}"/><name val="Calibri"/></font>
    <font><sz val="10"/><color rgb="${XL.rojo}"/><name val="Calibri"/></font>
    <font><sz val="12"/><b/><color rgb="${XL.texto}"/><name val="Calibri"/></font>
  </fonts>
  <fills count="18">
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
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF3CD"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFE0B2"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE3F2FD"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFBBDEFB"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right><top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="22">
    <xf numFmtId="0"   fontId="0" fillId="0"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment wrapText="1"/></xf>
    <xf numFmtId="0"   fontId="1" fillId="2"  borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="4"   fontId="0" fillId="0"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="4"   fontId="3" fillId="0"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="4"   fontId="4" fillId="0"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="0"   fontId="1" fillId="2"  borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="4"   fontId="3" fillId="10" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="4"   fontId="4" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="4"   fontId="0" fillId="6"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="4"   fontId="2" fillId="7"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="0"   fontId="2" fillId="7"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0"   fontId="5" fillId="0"  borderId="0" xfId="0" applyFont="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="4"   fontId="5" fillId="0"  borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="4"   fontId="5" fillId="4"  borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="4"   fontId="4" fillId="5"  borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0"   fontId="1" fillId="15" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="4"   fontId="0" fillId="9"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="0"   fontId="0" fillId="4"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment wrapText="1"/></xf>
    <xf numFmtId="0"   fontId="0" fillId="5"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment wrapText="1"/></xf>
    <xf numFmtId="0"   fontId="0" fillId="9"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment wrapText="1"/></xf>
    <xf numFmtId="0"   fontId="0" fillId="12" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment wrapText="1"/></xf>
    <xf numFmtId="9"   fontId="0" fillId="0"  borderId="1" xfId="0" applyFont="1" applyBorder="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
  </cellXfs>
</styleSheet>`

  // S = índices de estilo para referencia rápida
  const S = { normal:0, cab:1, num:2, numVerde:3, numRojo:4, sep:5, numVerdeRow:6, numRojoRow:7,
              subtotal:8, total:9, totalTxt:10, kpiLabel:11, kpiNum:12, kpiVerde:13, kpiRojo:14,
              cabNaranja:15, numNaranja:16, rowVerde:17, rowRojo:18, rowNaranja:19, rowGris:20, pct:21 }

  // ── HOJA 1: Resumen ───────────────────────────────────────
  const hoja1Rows = []
  let r = 1

  // Título
  hoja1Rows.push(`<row r="${r}"><c r="A${r}" t="inlineStr" s="${S.cab}"><is><t>CASH FLOW PREDICTIVO — ${esc(periodoLabel.toUpperCase())}</t></is></c></row>`); r++
  hoja1Rows.push(`<row r="${r}"><c r="A${r}" t="inlineStr" s="${S.normal}"><is><t>Generado: ${esc(ahora())}</t></is></c></row>`); r++
  r++

  // KPIs — etiquetas
  hoja1Rows.push(xlRow(r, [
    { v: 'Saldo disponible hoy', s: S.kpiLabel }, { v: '', s: S.kpiLabel },
    { v: 'Ingresos proyectados', s: S.kpiLabel }, { v: '', s: S.kpiLabel },
    { v: 'Egresos proyectados',  s: S.kpiLabel }, { v: '', s: S.kpiLabel },
    { v: 'Posición futura est.', s: S.kpiLabel },
  ])); r++

  // KPIs — valores
  const posFutura = datos.posicionFutura
  hoja1Rows.push(xlRow(r, [
    { v: datos.saldoDisponible, s: S.kpiNum,   n: true }, { v: '', s: 0 },
    { v: datos.ingresosProyect, s: S.kpiVerde, n: true }, { v: '', s: 0 },
    { v: datos.egresosProyect,  s: S.kpiRojo,  n: true }, { v: '', s: 0 },
    { v: posFutura, s: posFutura >= 0 ? S.kpiVerde : S.kpiRojo, n: true },
  ])); r++
  r++

  // Saldos por cuenta — cabecera
  hoja1Rows.push(xlRow(r, [
    { v: 'Cuenta', s: S.cab }, { v: 'Tipo', s: S.cab },
    { v: 'Saldo inicial', s: S.cab }, { v: 'Fecha de corte', s: S.cab },
  ])); r++

  let totalSaldos = 0
  datos.cuentas.forEach(c => {
    const s = datos.saldosPorCuenta[c.id]
    const monto = s ? Number(s.monto) : 0
    totalSaldos += monto
    hoja1Rows.push(xlRow(r, [
      { v: c.nombre, s: S.normal },
      { v: c.tipo === 'banco' ? 'Banco' : 'Fondo inversión', s: S.normal },
      { v: monto, s: S.num, n: true },
      { v: s ? fmtFecha(s.fecha) : 'Sin datos', s: S.normal },
    ])); r++
  })
  // Total
  hoja1Rows.push(xlRow(r, [
    { v: 'TOTAL DISPONIBLE', s: S.totalTxt },
    { v: '', s: S.total },
    { v: totalSaldos, s: S.total, n: true },
    { v: '', s: S.total },
  ])); r++

  const sheet1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetFormatPr defaultRowHeight="18" customHeight="1"/>
  <cols>
    <col min="1" max="1" width="35" customWidth="1"/>
    <col min="2" max="2" width="20" customWidth="1"/>
    <col min="3" max="3" width="22" customWidth="1"/>
    <col min="4" max="4" width="18" customWidth="1"/>
    <col min="5" max="5" width="22" customWidth="1"/>
    <col min="6" max="6" width="5"  customWidth="1"/>
    <col min="7" max="7" width="22" customWidth="1"/>
  </cols>
  <sheetData>${hoja1Rows.join('')}</sheetData>
</worksheet>`

  // ── HOJA 2: Cash Flow ─────────────────────────────────────
  const hoja2Rows = []
  r = 1

  // Cabecera
  hoja2Rows.push(xlRow(r, [
    { v: 'Fecha pago', s: S.cab }, { v: 'Estado', s: S.cab }, { v: 'Categoría', s: S.cab },
    { v: 'Proveedor / Cliente', s: S.cab }, { v: 'Obra', s: S.cab },
    { v: 'Ingreso', s: S.cab }, { v: 'Egreso', s: S.cab }, { v: 'Saldo acumulado', s: S.cab },
  ])); r++

  let ultimoMes2 = null, totIng2 = 0, totEgr2 = 0
  datos.movConSaldo.forEach(m => {
    const mesMov = m.fecha_pago ? periodoDeStr(m.fecha_pago) : m.periodo
    if (mesMov !== ultimoMes2) {
      // Separador de mes
      hoja2Rows.push(`<row r="${r}">` +
        `<c r="A${r}" t="inlineStr" s="${S.sep}"><is><t>${esc(mesMov ? labelPeriodo(mesMov) : 'Sin fecha')}</t></is></c>` +
        `<c r="B${r}" s="${S.sep}"/><c r="C${r}" s="${S.sep}"/><c r="D${r}" s="${S.sep}"/>` +
        `<c r="E${r}" s="${S.sep}"/><c r="F${r}" s="${S.sep}"/><c r="G${r}" s="${S.sep}"/>` +
        `<c r="H${r}" s="${S.sep}"/></row>`); r++
      ultimoMes2 = mesMov
    }

    const neg = m.saldoAcumulado < 0
    const exec = m.estado === 'ejecutado'
    const sNum  = neg ? S.numRojoRow : exec ? S.numVerdeRow : S.num
    const sTxt  = neg ? S.rowRojo    : exec ? S.rowVerde    : S.normal

    if (m.tipo === 'ingreso') totIng2 += m.montoEfectivo
    else                      totEgr2 += m.montoEfectivo

    hoja2Rows.push(xlRow(r, [
      { v: fmtFecha(m.fecha_pago), s: sTxt },
      { v: exec ? 'Ejecutado' : 'Proyectado', s: sTxt },
      { v: m.categoria ?? '', s: sTxt },
      { v: m.proveedor_cliente ?? m.concepto ?? '', s: sTxt },
      { v: m.obraCodigo, s: sTxt },
      { v: m.tipo === 'ingreso' ? m.montoEfectivo : null, s: m.tipo === 'ingreso' ? (exec ? S.numVerdeRow : S.numVerde) : S.normal, n: m.tipo === 'ingreso' },
      { v: m.tipo === 'egreso'  ? m.montoEfectivo : null, s: m.tipo === 'egreso'  ? (exec ? S.numRojoRow  : S.numRojo)  : S.normal, n: m.tipo === 'egreso' },
      { v: m.saldoAcumulado, s: neg ? S.numRojoRow : S.num, n: true },
    ])); r++
  })

  // Totales
  hoja2Rows.push(xlRow(r, [
    { v: 'TOTALES DEL PERÍODO', s: S.totalTxt }, { v: '', s: S.total }, { v: '', s: S.total },
    { v: '', s: S.total }, { v: '', s: S.total },
    { v: totIng2, s: S.total, n: true },
    { v: totEgr2, s: S.total, n: true },
    { v: totIng2 - totEgr2, s: totIng2 - totEgr2 >= 0 ? S.numVerdeRow : S.numRojoRow, n: true },
  ])); r++

  const sheet2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetFormatPr defaultRowHeight="16"/>
  <cols>
    <col min="1" max="1" width="14" customWidth="1"/>
    <col min="2" max="2" width="14" customWidth="1"/>
    <col min="3" max="3" width="18" customWidth="1"/>
    <col min="4" max="4" width="35" customWidth="1"/>
    <col min="5" max="5" width="10" customWidth="1"/>
    <col min="6" max="6" width="20" customWidth="1"/>
    <col min="7" max="7" width="20" customWidth="1"/>
    <col min="8" max="8" width="22" customWidth="1"/>
  </cols>
  <sheetData>${hoja2Rows.join('')}</sheetData>
  <autoFilter ref="A1:H1"/>
</worksheet>`

  // ── HOJA 3: Movimientos (datos planos para pivotear) ──────
  const hoja3Rows = []
  r = 1
  hoja3Rows.push(xlRow(r, [
    { v: 'Fecha pago', s: S.cab }, { v: 'Período', s: S.cab }, { v: 'Tipo', s: S.cab },
    { v: 'Categoría', s: S.cab }, { v: 'Estado', s: S.cab }, { v: 'Proveedor / Cliente', s: S.cab },
    { v: 'Nº Factura', s: S.cab }, { v: 'Obra código', s: S.cab }, { v: 'Obra nombre', s: S.cab },
    { v: 'Rubro', s: S.cab }, { v: 'Forma de pago', s: S.cab }, { v: 'Nº OP', s: S.cab },
    { v: 'Monto bruto', s: S.cab }, { v: 'Monto neto', s: S.cab }, { v: 'Concepto', s: S.cab },
    { v: 'Observaciones', s: S.cab },
  ])); r++

  datos.movEnriq.forEach(m => {
    hoja3Rows.push(xlRow(r, [
      { v: fmtFecha(m.fecha_pago), s: S.normal },
      { v: m.periodo ? labelPeriodo(m.periodo) : '', s: S.normal },
      { v: m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso', s: S.normal },
      { v: m.categoria ?? '', s: S.normal },
      { v: m.estado === 'ejecutado' ? 'Ejecutado' : 'Proyectado', s: S.normal },
      { v: m.proveedor_cliente ?? '', s: S.normal },
      { v: m.numero_factura ?? '', s: S.normal },
      { v: m.obraCodigo, s: S.normal },
      { v: m.obraNombre, s: S.normal },
      { v: m.rubroNombre, s: S.normal },
      { v: m.forma_pago ?? '', s: S.normal },
      { v: m.numero_op ?? '', s: S.normal },
      { v: m.monto_bruto ?? 0, s: S.num, n: true },
      { v: m.monto_neto ?? 0, s: S.num, n: true },
      { v: m.concepto ?? '', s: S.normal },
      { v: m.observaciones ?? '', s: S.normal },
    ])); r++
  })

  const sheet3 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetFormatPr defaultRowHeight="16"/>
  <cols>
    <col min="1" max="1" width="14" customWidth="1"/>
    <col min="2" max="2" width="18" customWidth="1"/>
    <col min="3" max="3" width="10" customWidth="1"/>
    <col min="4" max="4" width="18" customWidth="1"/>
    <col min="5" max="5" width="12" customWidth="1"/>
    <col min="6" max="6" width="30" customWidth="1"/>
    <col min="7" max="7" width="14" customWidth="1"/>
    <col min="8" max="8" width="12" customWidth="1"/>
    <col min="9" max="9" width="28" customWidth="1"/>
    <col min="10" max="10" width="20" customWidth="1"/>
    <col min="11" max="11" width="16" customWidth="1"/>
    <col min="12" max="12" width="12" customWidth="1"/>
    <col min="13" max="13" width="18" customWidth="1"/>
    <col min="14" max="14" width="18" customWidth="1"/>
    <col min="15" max="15" width="25" customWidth="1"/>
    <col min="16" max="16" width="25" customWidth="1"/>
  </cols>
  <sheetData>${hoja3Rows.join('')}</sheetData>
  <autoFilter ref="A1:P1"/>
</worksheet>`

  // ── HOJA 4: Presupuesto vs Real ───────────────────────────
  const colorSemXL = { 'OK': S.rowVerde, 'Atención': S.rowNaranja, 'Superado': S.rowRojo, 'Sin presupuesto': S.rowGris }
  const numSemXL   = { 'OK': S.numVerde, 'Atención': S.numNaranja, 'Superado': S.numRojo, 'Sin presupuesto': S.num }

  const hoja4Rows = []
  r = 1
  hoja4Rows.push(xlRow(r, [
    { v: 'Cód.', s: S.cab }, { v: 'Obra', s: S.cab }, { v: 'Rubro', s: S.cab },
    { v: 'Concepto', s: S.cab }, { v: 'Presupuestado', s: S.cab }, { v: 'Gastado', s: S.cab },
    { v: 'Diferencia', s: S.cab }, { v: '% Ejecutado', s: S.cab }, { v: 'Semáforo', s: S.cab },
  ])); r++

  // Agrupamos por rubro para subtotales
  const gruposXL = {}
  datos.analisisPV.forEach(row => {
    if (!gruposXL[row.rubroNombre]) gruposXL[row.rubroNombre] = []
    gruposXL[row.rubroNombre].push(row)
  })

  let totPresXL = 0, totGastXL = 0
  Object.entries(gruposXL).forEach(([rubro, filas]) => {
    filas.forEach(row => {
      const sTxt = colorSemXL[row.semaforo] ?? S.normal
      const sNum = numSemXL[row.semaforo]   ?? S.num
      totPresXL += row.presupuestado; totGastXL += row.gastado
      hoja4Rows.push(xlRow(r, [
        { v: row.obraCodigo,  s: sTxt }, { v: row.obraNombre, s: sTxt },
        { v: row.rubroNombre, s: sTxt }, { v: row.concepto,   s: sTxt },
        { v: row.presupuestado, s: sNum, n: true },
        { v: row.gastado,       s: sNum, n: true },
        { v: row.diferencia,    s: row.diferencia >= 0 ? S.numVerde : S.numRojo, n: true },
        { v: row.presupuestado > 0 ? row.pct / 100 : 0, s: S.pct, n: true },
        { v: row.semaforo, s: sTxt },
      ])); r++
    })
    const stP = filas.reduce((s,x) => s + x.presupuestado, 0)
    const stG = filas.reduce((s,x) => s + x.gastado, 0)
    hoja4Rows.push(xlRow(r, [
      { v: `Subtotal ${rubro}`, s: S.totalTxt }, { v: '', s: S.subtotal }, { v: '', s: S.subtotal }, { v: '', s: S.subtotal },
      { v: stP, s: S.subtotal, n: true }, { v: stG, s: S.subtotal, n: true },
      { v: stP - stG, s: stP - stG >= 0 ? S.numVerde : S.numRojo, n: true },
      { v: stP > 0 ? stG/stP : 0, s: S.pct, n: true },
      { v: '', s: S.subtotal },
    ])); r++
  })

  const totDifXL = totPresXL - totGastXL
  hoja4Rows.push(xlRow(r, [
    { v: 'TOTAL GENERAL', s: S.totalTxt }, { v: '', s: S.total }, { v: '', s: S.total }, { v: '', s: S.total },
    { v: totPresXL, s: S.total, n: true }, { v: totGastXL, s: S.total, n: true },
    { v: totDifXL, s: totDifXL >= 0 ? S.numVerdeRow : S.numRojoRow, n: true },
    { v: totPresXL > 0 ? totGastXL/totPresXL : 0, s: S.pct, n: true },
    { v: '', s: S.total },
  ])); r++

  const sheet4 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetFormatPr defaultRowHeight="16"/>
  <cols>
    <col min="1" max="1" width="10" customWidth="1"/>
    <col min="2" max="2" width="28" customWidth="1"/>
    <col min="3" max="3" width="22" customWidth="1"/>
    <col min="4" max="4" width="25" customWidth="1"/>
    <col min="5" max="5" width="20" customWidth="1"/>
    <col min="6" max="6" width="20" customWidth="1"/>
    <col min="7" max="7" width="20" customWidth="1"/>
    <col min="8" max="8" width="14" customWidth="1"/>
    <col min="9" max="9" width="18" customWidth="1"/>
  </cols>
  <sheetData>${hoja4Rows.join('')}</sheetData>
  <autoFilter ref="A1:I1"/>
</worksheet>`

  // ── HOJA 5: Obras en Riesgo ───────────────────────────────
  const hoja5Rows = []
  r = 1
  hoja5Rows.push(xlRow(r, [
    { v: 'Cód.', s: S.cabNaranja }, { v: 'Obra', s: S.cabNaranja }, { v: 'Rubro', s: S.cabNaranja },
    { v: 'Concepto', s: S.cabNaranja }, { v: 'Presupuestado', s: S.cabNaranja }, { v: 'Gastado', s: S.cabNaranja },
    { v: 'Diferencia', s: S.cabNaranja }, { v: '% Ejecutado', s: S.cabNaranja }, { v: 'Semáforo', s: S.cabNaranja },
  ])); r++

  if (datos.obrasEnRiesgo.length === 0) {
    hoja5Rows.push(`<row r="${r}"><c r="A${r}" t="inlineStr" s="${S.rowVerde}"><is><t>✓ No hay obras en riesgo para este período</t></is></c></row>`); r++
  } else {
    datos.obrasEnRiesgo.forEach(row => {
      const sTxt = colorSemXL[row.semaforo] ?? S.normal
      const sNum = numSemXL[row.semaforo]   ?? S.num
      hoja5Rows.push(xlRow(r, [
        { v: row.obraCodigo,  s: sTxt }, { v: row.obraNombre, s: sTxt },
        { v: row.rubroNombre, s: sTxt }, { v: row.concepto,   s: sTxt },
        { v: row.presupuestado, s: sNum, n: true }, { v: row.gastado, s: sNum, n: true },
        { v: row.diferencia, s: row.diferencia >= 0 ? S.numVerde : S.numRojo, n: true },
        { v: row.presupuestado > 0 ? row.pct / 100 : 0, s: S.pct, n: true },
        { v: row.semaforo, s: sTxt },
      ])); r++
    })
  }

  const sheet5 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetFormatPr defaultRowHeight="16"/>
  <cols>
    <col min="1" max="1" width="10" customWidth="1"/>
    <col min="2" max="2" width="28" customWidth="1"/>
    <col min="3" max="3" width="22" customWidth="1"/>
    <col min="4" max="4" width="25" customWidth="1"/>
    <col min="5" max="5" width="20" customWidth="1"/>
    <col min="6" max="6" width="20" customWidth="1"/>
    <col min="7" max="7" width="20" customWidth="1"/>
    <col min="8" max="8" width="14" customWidth="1"/>
    <col min="9" max="9" width="18" customWidth="1"/>
  </cols>
  <sheetData>${hoja5Rows.join('')}</sheetData>
  <autoFilter ref="A1:I1"/>
</worksheet>`

  // ── Ensamblar el archivo XLSX ─────────────────────────────
  // XLSX es un ZIP con archivos XML adentro
  // Usamos una implementación mínima de ZIP en JS puro

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
    const nameBytes    = encoder.encode(name)
    const contentBytes = encoder.encode(content)
    const crc          = crc32(contentBytes)
    const local = [
      0x50, 0x4B, 0x03, 0x04,  // local file header signature
      0x14, 0x00,                // version needed: 2.0
      0x00, 0x00,                // general purpose bit flag
      0x00, 0x00,                // compression: store
      0x00, 0x00, 0x00, 0x00,  // last mod time/date
      ...u32le(crc),
      ...u32le(contentBytes.length),
      ...u32le(contentBytes.length),
      ...u16le(nameBytes.length),
      0x00, 0x00,                // extra field length
      ...nameBytes,
      ...contentBytes,
    ]
    return { local: new Uint8Array(local), name: nameBytes, crc, size: contentBytes.length }
  }

  const files = [
    { name: '[Content_Types].xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet5.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: '_rels/.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Resumen" sheetId="1" r:id="rId1"/><sheet name="Cash Flow" sheetId="2" r:id="rId2"/><sheet name="Movimientos" sheetId="3" r:id="rId3"/><sheet name="Presupuesto vs Real" sheetId="4" r:id="rId4"/><sheet name="Obras en Riesgo" sheetId="5" r:id="rId5"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet5.xml"/><Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml',            content: stylesXml },
    { name: 'xl/worksheets/sheet1.xml', content: sheet1 },
    { name: 'xl/worksheets/sheet2.xml', content: sheet2 },
    { name: 'xl/worksheets/sheet3.xml', content: sheet3 },
    { name: 'xl/worksheets/sheet4.xml', content: sheet4 },
    { name: 'xl/worksheets/sheet5.xml', content: sheet5 },
  ]

  // Construir el ZIP
  const parts    = []
  const central  = []
  let offset     = 0

  files.forEach(f => {
    const e = zipEntry(f.name, f.content)
    parts.push(e.local)

    // Central directory entry
    const nameBytes = encoder.encode(f.name)
    const cd = new Uint8Array([
      0x50, 0x4B, 0x01, 0x02,
      0x14, 0x00, 0x14, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      ...u32le(e.crc),
      ...u32le(e.size),
      ...u32le(e.size),
      ...u16le(nameBytes.length),
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      ...u32le(offset),
      ...nameBytes,
    ])
    central.push(cd)
    offset += e.local.length
  })

  const centralBuf   = central.reduce((acc, c) => { const b = new Uint8Array(acc.length + c.length); b.set(acc); b.set(c, acc.length); return b }, new Uint8Array(0))
  const eocd = new Uint8Array([
    0x50, 0x4B, 0x05, 0x06,
    0x00, 0x00, 0x00, 0x00,
    ...u16le(files.length),
    ...u16le(files.length),
    ...u32le(centralBuf.length),
    ...u32le(offset),
    0x00, 0x00,
  ])

  const totalSize = parts.reduce((s, p) => s + p.length, 0) + centralBuf.length + eocd.length
  const zipBuf    = new Uint8Array(totalSize)
  let pos = 0
  parts.forEach(p => { zipBuf.set(p, pos); pos += p.length })
  zipBuf.set(centralBuf, pos); pos += centralBuf.length
  zipBuf.set(eocd, pos)

  // Descargar
  const blob = new Blob([zipBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  const mes  = new Date(periodo + 'T00:00:00').toLocaleDateString('es-AR', { month: 'long' })
  const anio = new Date(periodo + 'T00:00:00').getFullYear()
  a.href     = url
  a.download = `CashFlow_${mes.charAt(0).toUpperCase() + mes.slice(1)}_${anio}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE REACT
// ═══════════════════════════════════════════════════════════════
export default function Exportar() {
  const navigate = useNavigate()

  const [periodo,    setPeriodo]    = useState(periodoActual())
  const [estadoPDF,  setEstadoPDF]  = useState('idle')
  const [estadoXLS,  setEstadoXLS]  = useState('idle')
  const [mensError,  setMensError]  = useState('')

  async function handleExportarPDF() {
    setEstadoPDF('cargando'); setMensError('')
    try {
      const datos = await cargarDatos(periodo)
      await generarPDF(periodo, datos)
      setEstadoPDF('ok'); setTimeout(() => setEstadoPDF('idle'), 4000)
    } catch (err) {
      console.error('[PDF]', err)
      setMensError(err.message ?? 'Error al generar el PDF.')
      setEstadoPDF('error')
    }
  }

  async function handleExportarExcel() {
    setEstadoXLS('cargando'); setMensError('')
    try {
      const datos = await cargarDatos(periodo)
      const periodoLabel = PERIODOS.find(p => p.value === periodo)?.label ?? periodo
      await generarExcel(periodo, datos, periodoLabel)
      setEstadoXLS('ok'); setTimeout(() => setEstadoXLS('idle'), 4000)
    } catch (err) {
      console.error('[Excel]', err)
      setMensError(err.message ?? 'Error al generar el Excel.')
      setEstadoXLS('error')
    }
  }

  const periodoLabel = PERIODOS.find(p => p.value === periodo)?.label ?? periodo
  const mesAnio      = periodoLabel.replace(' ', '_')
  const cargando     = estadoPDF === 'cargando' || estadoXLS === 'cargando'

  const secciones = [
    { num: '1', titulo: 'Resumen Ejecutivo',    desc: 'KPIs financieros y saldos por cuenta' },
    { num: '2', titulo: 'Cash Flow',            desc: 'Movimientos con saldo acumulado y alertas de liquidez' },
    { num: '3', titulo: 'Movimientos',          desc: 'Datos planos listos para tabla dinámica en Excel' },
    { num: '4', titulo: 'Presupuesto vs Real',  desc: 'Análisis por obra, rubro y concepto con semáforo' },
    { num: '5', titulo: 'Obras en Riesgo',      desc: 'Rubros con ejecución ≥ 80% o sin presupuesto' },
  ]

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar titulo="Cash Flow" accentColor="text-blue-400" />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        <div className="mb-8">
          <button onClick={() => navigate('/finanzas')}
            className="text-blue-600 text-sm hover:text-blue-800 transition-colors flex items-center gap-1.5 mb-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Panel de Finanzas
          </button>
          <h1 className="text-slate-900 text-2xl font-semibold tracking-tight">Exportar reportes</h1>
          <p className="text-slate-500 text-sm mt-0.5">Generá el reporte para el Directorio en PDF o Excel</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-xl mx-auto mt-4">

          {/* Ícono */}
          <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>

          <h2 className="text-slate-900 font-semibold text-lg text-center mb-1">Reporte para el Directorio</h2>
          <p className="text-slate-500 text-sm text-center mb-6">El reporte incluye 5 secciones con toda la información del período.</p>

          {/* Secciones */}
          <ul className="space-y-2 mb-7">
            {secciones.map(s => (
              <li key={s.num} className="flex items-start gap-3">
                <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{s.num}</span>
                <div>
                  <span className="text-slate-700 text-sm font-medium">{s.titulo}</span>
                  <span className="text-slate-400 text-xs block">{s.desc}</span>
                </div>
              </li>
            ))}
          </ul>

          {/* Selector de período */}
          <div className="mb-6">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Período a exportar</label>
            <select
              value={periodo}
              onChange={e => { setPeriodo(e.target.value); setEstadoPDF('idle'); setEstadoXLS('idle') }}
              disabled={cargando}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            >
              {PERIODOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          {/* Dos botones */}
          <div className="grid grid-cols-2 gap-3 mb-4">

            {/* PDF */}
            <button onClick={handleExportarPDF} disabled={cargando}
              className="inline-flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm px-4 py-3 rounded-xl transition-colors">
              {estadoPDF === 'cargando' ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Generando…</>
              ) : estadoPDF === 'ok' ? (
                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg> PDF listo</>
              ) : (
                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg> Descargar PDF</>
              )}
            </button>

            {/* Excel */}
            <button onClick={handleExportarExcel} disabled={cargando}
              className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm px-4 py-3 rounded-xl transition-colors">
              {estadoXLS === 'cargando' ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Generando…</>
              ) : estadoXLS === 'ok' ? (
                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg> Excel listo</>
              ) : (
                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg> Descargar Excel</>
              )}
            </button>
          </div>

          {/* Nombres de archivo */}
          {!cargando && estadoPDF === 'idle' && estadoXLS === 'idle' && (
            <p className="text-slate-400 text-xs text-center">
              PDF: <span className="font-medium text-slate-500">CashFlow_{mesAnio}.pdf</span>
              {' · '}
              Excel: <span className="font-medium text-slate-500">CashFlow_{mesAnio}.xlsx</span>
            </p>
          )}

          {/* Error */}
          {(estadoPDF === 'error' || estadoXLS === 'error') && (
            <div className="mt-4 flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
              <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd"/>
              </svg>
              <div>
                <p className="text-red-700 text-sm font-medium">Error al generar el archivo</p>
                <p className="text-red-600 text-xs mt-0.5">{mensError}</p>
                <button onClick={() => { setEstadoPDF('idle'); setEstadoXLS('idle') }}
                  className="text-red-500 text-xs underline mt-1 hover:text-red-700">Intentar de nuevo</button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}