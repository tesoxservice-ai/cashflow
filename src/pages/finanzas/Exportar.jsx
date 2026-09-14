// pages/finanzas/Exportar.jsx
// Módulo de exportación a PDF para el rol 'finanzas'.
// Ruta: /finanzas/exportar  (ruta y card en App.jsx ya existen)
//
// Genera un PDF profesional A4 landscape con 4 páginas:
//   Pág 1 — Resumen Ejecutivo (KPIs + saldos por cuenta)
//   Pág 2 — Cash Flow (movimientos con saldo acumulado)
//   Pág 3 — Presupuesto vs. Real (análisis por obra/rubro)
//   Pág 4 — Obras en Riesgo (filas con ejecución ≥ 80%)
//
// Dependencias: jspdf + jspdf-autotable (npm install jspdf jspdf-autotable)

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../../supabaseClient'
import Navbar from '../../components/Navbar'

// ═══════════════════════════════════════════════════════════════
// PALETA CORPORATIVA
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
  grisFila:    [248, 250, 252],
  texto:       [15,  23,  42],
  blanco:      [255, 255, 255],
  grisTexto:   [100, 116, 139],
}

// ═══════════════════════════════════════════════════════════════
// UTILIDADES DE FORMATO
// ═══════════════════════════════════════════════════════════════

const fmtARS = n => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 2,
}).format(n ?? 0)

const fmtPct = n => `${Number(n).toFixed(1)}%`

const fmtFecha = str =>
  str ? new Date(str + 'T00:00:00').toLocaleDateString('es-AR') : ''

// Primer día del mes de una fecha ISO
const periodoDeStr = fechaStr => {
  if (!fechaStr) return null
  const d = new Date(fechaStr + 'T00:00:00')
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
}

// "Septiembre 2026" a partir de "2026-09-01"
const labelPeriodo = iso => {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  const s = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Hoy como "YYYY-MM-DD"
const hoyISO = () => {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-${String(h.getDate()).padStart(2,'0')}`
}

// Fecha y hora completa para el pie de página
const ahora = () => new Date().toLocaleDateString('es-AR', {
  day:'2-digit', month:'long', year:'numeric',
  hour:'2-digit', minute:'2-digit',
})

// Genera opciones de período: 24 meses atrás + 12 adelante
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
    // Todos los movimientos para saldo acumulado (orden fecha_pago ASC)
    supabase.from('movimientos')
      .select('id,tipo,categoria,proveedor_cliente,numero_factura,monto_bruto,monto_neto,estado,periodo,fecha_pago,obra_id,rubro_id,cuenta_id,concepto,observaciones,created_at')
      .order('fecha_pago', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    // Saldos iniciales (más reciente por cuenta)
    supabase.from('saldos_iniciales')
      .select('id,cuenta_id,monto,fecha,created_at')
      .order('fecha',      { ascending: false })
      .order('created_at', { ascending: false }),
    // Cuentas activas
    supabase.from('cuentas').select('id,nombre,tipo').eq('activa', true).order('nombre'),
    // Notas (para ajuste de facturas)
    supabase.from('notas').select('movimiento_id,tipo_nota,monto'),
    // Presupuestos del período
    supabase.from('presupuestos').select('id,obra_id,rubro_id,concepto,periodo,monto').eq('periodo', periodo),
    // Obras activas
    supabase.from('obras').select('id,codigo,nombre,cliente').eq('activa', true).order('codigo'),
    // Rubros
    supabase.from('rubros').select('id,nombre,tipo'),
    // Movimientos del período (para Pres vs Real)
    supabase.from('movimientos')
      .select('id,tipo,categoria,monto_bruto,obra_id,rubro_id,concepto,proveedor_cliente')
      .eq('periodo', periodo)
      .eq('categoria', 'factura')
      .eq('tipo', 'egreso'),
  ])

  const errs = [e1,e2,e3,e4,e5,e6,e7,e8].filter(Boolean)
  if (errs.length) throw new Error('Error al cargar datos de Supabase.')

  // ── Mapas de lookup ──────────────────────────────────────────
  const obraMap  = {}; (obrasData  ?? []).forEach(o => obraMap[o.id]  = o)
  const rubroMap = {}; (rubrosData ?? []).forEach(r => rubroMap[r.id] = r)

  // ── Saldos: uno por cuenta (el más reciente) ─────────────────
  const saldosPorCuenta = {}
  ;(saldosData ?? []).forEach(s => {
    if (!saldosPorCuenta[s.cuenta_id]) saldosPorCuenta[s.cuenta_id] = s
  })

  // ── Notas agrupadas por movimiento ────────────────────────────
  const notasPorMov = {}
  ;(notasData ?? []).forEach(n => {
    if (!notasPorMov[n.movimiento_id]) notasPorMov[n.movimiento_id] = []
    notasPorMov[n.movimiento_id].push(n)
  })

  // ── Enriquecer movimientos con montoEfectivo ─────────────────
  const movEnriq = (movTodos ?? []).map(m => {
    const base = m.estado === 'ejecutado'
      ? Number(m.monto_neto ?? m.monto_bruto ?? 0)
      : Number(m.monto_bruto ?? 0)
    const notas  = notasPorMov[m.id] ?? []
    const deb    = notas.filter(n => n.tipo_nota === 'debito').reduce((s,n) => s+Number(n.monto), 0)
    const cred   = notas.filter(n => n.tipo_nota === 'credito').reduce((s,n) => s+Number(n.monto), 0)
    return {
      ...m,
      montoEfectivo: m.categoria === 'factura' ? base + deb - cred : base,
      obraCodigo:    obraMap[m.obra_id]?.codigo   ?? '',
      obraNombre:    obraMap[m.obra_id]?.nombre   ?? '',
      rubroNombre:   rubroMap[m.rubro_id]?.nombre ?? '',
    }
  })

  // ── Saldo acumulado progresivo ────────────────────────────────
  const sumaSaldosBase = Object.values(saldosPorCuenta)
    .reduce((acc, s) => acc + Number(s.monto ?? 0), 0)

  let saldo = sumaSaldosBase
  const movConSaldo = movEnriq.map(m => {
    saldo += m.tipo === 'ingreso' ? m.montoEfectivo : -m.montoEfectivo
    return { ...m, saldoAcumulado: saldo }
  })

  // ── Resumen financiero ────────────────────────────────────────
  let saldoDisponible  = sumaSaldosBase
  let ingresosProyect  = 0
  let egresosProyect   = 0

  movEnriq.forEach(m => {
    const fecha = m.fecha_pago ?? m.periodo
    if (m.estado === 'ejecutado' && (!fecha || fecha <= hoy)) {
      saldoDisponible += m.tipo === 'ingreso' ? m.montoEfectivo : -m.montoEfectivo
    }
    if (m.estado === 'proyectado' && (!fecha || fecha >= hoy)) {
      if (m.tipo === 'ingreso') ingresosProyect += m.montoEfectivo
      else                      egresosProyect  += m.montoEfectivo
    }
  })

  // ── Presupuesto vs Real ───────────────────────────────────────
  const presMap  = {}
  const gastoMap = {}

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
    const semaforo      = presupuestado === 0 ? 'Sin presupuesto'
      : pct > 100 ? 'Superado'
      : pct >= 80 ? 'Atención'
      : 'OK'

    analisisPV.push({
      obraCodigo:  obraMap[obraId]?.codigo   ?? '',
      obraNombre:  obraMap[obraId]?.nombre   ?? '',
      rubroNombre: rubroMap[rubroId]?.nombre  ?? '',
      concepto:    concepto ?? '',
      presupuestado, gastado, diferencia, pct, semaforo,
    })
  })

  analisisPV.sort((a,b) =>
    a.obraCodigo.localeCompare(b.obraCodigo) ||
    a.rubroNombre.localeCompare(b.rubroNombre)
  )

  const obrasEnRiesgo = [...analisisPV]
    .filter(r => r.pct >= 80 || r.semaforo === 'Sin presupuesto')
    .sort((a,b) => b.pct - a.pct)

  return {
    cuentas:          cuentas ?? [],
    saldosPorCuenta,
    sumaSaldosBase,
    saldoDisponible,
    ingresosProyect,
    egresosProyect,
    posicionFutura:   saldoDisponible + ingresosProyect - egresosProyect,
    movConSaldo,
    analisisPV,
    obrasEnRiesgo,
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPERS DE DIBUJO DEL PDF
// ═══════════════════════════════════════════════════════════════

// Dimensiones A4 landscape
const PW = 297  // page width mm
const PH = 210  // page height mm
const ML = 15   // margin left
const MR = 15   // margin right
const CW = PW - ML - MR  // content width

// Dibuja el encabezado y pie en la página actual
function dibujarCromo(doc, periodoLabel, paginaActual, totalPaginas, generadoEn) {
  // ── Encabezado ───────────────────────────────────────────────
  doc.setFillColor(...C.azulOscuro)
  doc.rect(0, 0, PW, 10, 'F')
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.blanco)
  doc.text('Cash Flow Predictivo', ML, 6.5)
  doc.text(periodoLabel, PW / 2, 6.5, { align: 'center' })
  doc.text(`Página ${paginaActual} de ${totalPaginas}`, PW - MR, 6.5, { align: 'right' })

  // ── Pie ───────────────────────────────────────────────────────
  doc.setDrawColor(...C.grisOscuro)
  doc.setLineWidth(0.3)
  doc.line(ML, PH - 8, PW - MR, PH - 8)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.grisTexto)
  doc.text('Confidencial — uso interno', ML, PH - 4)
  doc.text(`Generado: ${generadoEn}`, PW - MR, PH - 4, { align: 'right' })

  // Reset
  doc.setTextColor(...C.texto)
}

// Dibuja un título de sección
function dibujarTituloSeccion(doc, titulo, y) {
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.azulOscuro)
  doc.text(titulo, ML, y)
  // Línea decorativa bajo el título
  doc.setDrawColor(...C.azulOscuro)
  doc.setLineWidth(0.5)
  doc.line(ML, y + 1.5, ML + 60, y + 1.5)
  doc.setTextColor(...C.texto)
  return y + 7
}

// Dibuja una card de KPI (rectángulo con etiqueta y valor)
function dibujarCard(doc, x, y, w, h, label, valor, colorValor) {
  // Fondo blanco con borde gris suave
  doc.setFillColor(...C.blanco)
  doc.setDrawColor(...C.azulClaro)
  doc.setLineWidth(0.4)
  doc.roundedRect(x, y, w, h, 2, 2, 'FD')

  // Etiqueta pequeña arriba
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.grisTexto)
  doc.text(label, x + w / 2, y + 5.5, { align: 'center' })

  // Valor grande abajo
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...(colorValor ?? C.texto))
  doc.text(valor, x + w / 2, y + 12.5, { align: 'center' })

  doc.setTextColor(...C.texto)
}

// ═══════════════════════════════════════════════════════════════
// GENERADOR DEL PDF
// ═══════════════════════════════════════════════════════════════
async function generarPDF(periodo) {
  const datos       = await cargarDatos(periodo)
  const periodoLabel = labelPeriodo(periodo)
  const generadoEn  = ahora()
  const TOTAL_PAGS  = 4

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  // ─────────────────────────────────────────────────────────────
  // PÁGINA 1 — RESUMEN EJECUTIVO
  // ─────────────────────────────────────────────────────────────
  dibujarCromo(doc, periodoLabel, 1, TOTAL_PAGS, generadoEn)

  let y = 17
  y = dibujarTituloSeccion(doc, 'Resumen Ejecutivo', y)

  // ── 4 cards de KPIs ──────────────────────────────────────────
  const kpis = [
    { label: 'Saldo disponible hoy',    valor: fmtARS(datos.saldoDisponible),  color: null },
    { label: 'Ingresos proyectados',     valor: fmtARS(datos.ingresosProyect),  color: C.verde },
    { label: 'Egresos proyectados',      valor: fmtARS(datos.egresosProyect),   color: C.rojo  },
    { label: 'Posición futura estimada', valor: fmtARS(datos.posicionFutura),
      color: datos.posicionFutura >= 0 ? C.verde : C.rojo },
  ]

  const cardW = (CW - 9) / 4   // 4 cards con 3 gaps de 3mm
  const cardH = 17
  kpis.forEach((k, i) => {
    dibujarCard(doc, ML + i * (cardW + 3), y, cardW, cardH, k.label, k.valor, k.color)
  })
  y += cardH + 8

  // ── Tabla saldos por cuenta ───────────────────────────────────
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.azulOscuro)
  doc.text('Saldos por cuenta', ML, y)
  y += 3

  const filasCtas = datos.cuentas.map(c => {
    const s = datos.saldosPorCuenta[c.id]
    return [
      c.nombre,
      c.tipo === 'banco' ? 'Banco' : 'Fondo inversión',
      fmtARS(s ? Number(s.monto) : 0),
      s ? fmtFecha(s.fecha) : 'Sin datos',
    ]
  })
  const totalSaldos = Object.values(datos.saldosPorCuenta)
    .reduce((a, s) => a + Number(s.monto ?? 0), 0)

  autoTable(doc, {
    startY: y,
    head: [['Cuenta', 'Tipo', 'Saldo inicial', 'Fecha de corte']],
    body: [
      ...filasCtas,
      [{ content: 'Total disponible', styles: { fontStyle: 'bold' } },
       '', { content: fmtARS(totalSaldos), styles: { fontStyle: 'bold', halign: 'right' } }, ''],
    ],
    styles:           { fontSize: 8.5, cellPadding: 2.5, textColor: C.texto },
    headStyles:       { fillColor: C.azulClaro, textColor: C.azulOscuro, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: C.grisMuyClaro },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 35, halign: 'center' },
      2: { cellWidth: 45, halign: 'right' },
      3: { cellWidth: 35, halign: 'center' },
    },
    margin:  { left: ML, right: MR },
    tableWidth: CW,
    didDrawPage: () => {},   // sin re-draw en esta tabla simple
  })

  // ─────────────────────────────────────────────────────────────
  // PÁGINA 2 — CASH FLOW
  // ─────────────────────────────────────────────────────────────
  doc.addPage()
  dibujarCromo(doc, periodoLabel, 2, TOTAL_PAGS, generadoEn)

  y = 17
  y = dibujarTituloSeccion(doc, `Cash Flow — ${periodoLabel}`, y)

  // Construimos las filas con separadores de mes
  const filasCF  = []
  let ultimoMes  = null
  let totIng     = 0
  let totEgr     = 0

  datos.movConSaldo.forEach(m => {
    const mesMov = m.fecha_pago ? periodoDeStr(m.fecha_pago) : m.periodo

    if (mesMov !== ultimoMes) {
      // Fila separadora de mes
      filasCF.push({
        _separador: true,
        label: mesMov ? labelPeriodo(mesMov) : 'Sin fecha',
      })
      ultimoMes = mesMov
    }

    if (m.tipo === 'ingreso') totIng += m.montoEfectivo
    else                      totEgr += m.montoEfectivo

    filasCF.push({ _separador: false, mov: m })
  })

  // Transformamos a rows para autoTable
  const rowsCF = filasCF.map(f => {
    if (f._separador) {
      return [{
        content: f.label,
        colSpan: 8,
        styles: {
          fillColor: C.azulOscuro,
          textColor: C.blanco,
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 8.5,
        },
      }]
    }
    const m   = f.mov
    const neg = m.saldoAcumulado < 0
    const bg  = neg ? C.rojoRow : m.estado === 'ejecutado' ? C.verdeRow : null

    // Función de estilo base por fila
    const celdaBg = (extra = {}) => ({
      fillColor: bg ?? C.blanco,
      textColor: C.texto,
      fontSize: 7.5,
      ...extra,
    })

    return [
      { content: fmtFecha(m.fecha_pago),    styles: celdaBg({ halign: 'center' }) },
      { content: m.estado === 'ejecutado' ? 'Ejecutado' : 'Proyectado',
        styles: celdaBg({ halign: 'center' }) },
      { content: m.categoria ?? '',          styles: celdaBg() },
      { content: m.proveedor_cliente ?? m.concepto ?? '', styles: celdaBg() },
      { content: m.obraCodigo,               styles: celdaBg({ halign: 'center' }) },
      // Ingreso
      { content: m.tipo === 'ingreso' ? fmtARS(m.montoEfectivo) : '',
        styles: celdaBg({ halign: 'right', textColor: m.tipo === 'ingreso' ? C.verde : C.texto }) },
      // Egreso
      { content: m.tipo === 'egreso' ? fmtARS(m.montoEfectivo) : '',
        styles: celdaBg({ halign: 'right', textColor: m.tipo === 'egreso' ? C.rojo : C.texto }) },
      // Saldo acumulado
      { content: fmtARS(m.saldoAcumulado),
        styles: celdaBg({ halign: 'right',
          textColor: neg ? C.rojo : C.texto,
          fontStyle: neg ? 'bold' : 'normal' }) },
    ]
  })

  // Fila de totales al pie
  rowsCF.push([
    { content: 'Totales del período', colSpan: 5,
      styles: { fontStyle: 'bold', fillColor: C.grisOscuro, textColor: C.texto, fontSize: 8 } },
    { content: fmtARS(totIng), styles: { halign: 'right', fontStyle: 'bold', fillColor: C.grisOscuro, textColor: C.verde, fontSize: 8 } },
    { content: fmtARS(totEgr), styles: { halign: 'right', fontStyle: 'bold', fillColor: C.grisOscuro, textColor: C.rojo,  fontSize: 8 } },
    { content: fmtARS(totIng - totEgr),
      styles: { halign: 'right', fontStyle: 'bold', fillColor: C.grisOscuro,
        textColor: totIng - totEgr >= 0 ? C.verde : C.rojo, fontSize: 8 } },
  ])

  autoTable(doc, {
    startY: y,
    head: [['Fecha', 'Estado', 'Categoría', 'Proveedor/Cliente', 'Obra', 'Ingreso', 'Egreso', 'Saldo acumulado']],
    body: rowsCF,
    styles:     { fontSize: 7.5, cellPadding: 1.8, overflow: 'ellipsize' },
    headStyles: { fillColor: C.azulClaro, textColor: C.azulOscuro, fontStyle: 'bold', halign: 'center', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 26 },
      3: { cellWidth: 52 },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 34, halign: 'right' },
      6: { cellWidth: 34, halign: 'right' },
      7: { cellWidth: 34, halign: 'right' },
    },
    margin: { left: ML, right: MR, top: 12 },
    tableWidth: CW,
    didDrawPage: (data) => {
      // Re-dibujamos cromo en cada página nueva que genere autoTable
      const pg = doc.internal.getCurrentPageInfo().pageNumber
      if (pg > 2) {
        dibujarCromo(doc, periodoLabel, pg, TOTAL_PAGS, generadoEn)
      }
    },
  })

  // ─────────────────────────────────────────────────────────────
  // PÁGINA 3 — PRESUPUESTO VS REAL
  // ─────────────────────────────────────────────────────────────
  // Nos aseguramos de agregar la página 3 después del posible
  // multi-página del Cash Flow
  const paginaAntesPVR = doc.internal.getNumberOfPages()
  // Si autoTable ya agregó páginas extras, usamos la última;
  // sino agregamos una nueva
  if (paginaAntesPVR < 3) doc.addPage()
  else doc.setPage(doc.internal.getNumberOfPages())
  doc.addPage()

  dibujarCromo(doc, periodoLabel, doc.internal.getNumberOfPages(), TOTAL_PAGS, generadoEn)

  y = 17
  y = dibujarTituloSeccion(doc, `Presupuesto vs. Real — ${periodoLabel}`, y)

  // ── 3 cards de resumen ────────────────────────────────────────
  const totPres = datos.analisisPV.reduce((s,r) => s + r.presupuestado, 0)
  const totGast = datos.analisisPV.reduce((s,r) => s + r.gastado, 0)
  const totDif  = totPres - totGast

  const cardsPVR = [
    { label: 'Total presupuestado', valor: fmtARS(totPres), color: null    },
    { label: 'Total gastado',       valor: fmtARS(totGast), color: null    },
    { label: 'Diferencia',          valor: fmtARS(totDif),  color: totDif >= 0 ? C.verde : C.rojo },
  ]
  const card3W = (CW - 6) / 3
  cardsPVR.forEach((k, i) => {
    dibujarCard(doc, ML + i * (card3W + 3), y, card3W, 17, k.label, k.valor, k.color)
  })
  y += 24

  // ── Tabla Presupuesto vs Real ─────────────────────────────────
  const colorSem = {
    'OK':              C.verdePastel,
    'Atención':        C.naranjaPast,
    'Superado':        C.rojoPastel,
    'Sin presupuesto': C.grisClaro,
  }
  const textSem = {
    'OK':              C.verde,
    'Atención':        C.naranja,
    'Superado':        C.rojo,
    'Sin presupuesto': C.grisTexto,
  }
  const labelSem = { 'OK': '● OK', 'Atención': '● Atención', 'Superado': '● Superado', 'Sin presupuesto': '● Sin presupuesto' }

  // Agrupamos por rubro para subtotales
  const gruposPVR = {}
  datos.analisisPV.forEach(r => {
    if (!gruposPVR[r.rubroNombre]) gruposPVR[r.rubroNombre] = []
    gruposPVR[r.rubroNombre].push(r)
  })

  const rowsPVR = []
  Object.entries(gruposPVR).forEach(([rubro, filas]) => {
    filas.forEach(r => {
      const bg = colorSem[r.semaforo] ?? C.blanco
      rowsPVR.push([
        { content: r.obraCodigo,  styles: { fillColor: bg, fontSize: 7.5 } },
        { content: r.obraNombre,  styles: { fillColor: bg, fontSize: 7.5 } },
        { content: r.rubroNombre, styles: { fillColor: bg, fontSize: 7.5 } },
        { content: r.concepto,    styles: { fillColor: bg, fontSize: 7.5 } },
        { content: fmtARS(r.presupuestado), styles: { fillColor: bg, halign: 'right', fontSize: 7.5 } },
        { content: fmtARS(r.gastado),       styles: { fillColor: bg, halign: 'right', fontSize: 7.5 } },
        { content: fmtARS(r.diferencia),    styles: { fillColor: bg, halign: 'right', fontSize: 7.5,
            textColor: r.diferencia >= 0 ? C.verde : C.rojo } },
        { content: r.presupuestado > 0 ? fmtPct(r.pct) : '—',
          styles: { fillColor: bg, halign: 'right', fontSize: 7.5 } },
        { content: labelSem[r.semaforo] ?? r.semaforo,
          styles: { fillColor: bg, textColor: textSem[r.semaforo] ?? C.texto,
            fontStyle: 'bold', fontSize: 7.5 } },
      ])
    })
    // Subtotal por rubro
    const stPres = filas.reduce((s,r) => s + r.presupuestado, 0)
    const stGast = filas.reduce((s,r) => s + r.gastado, 0)
    const stDif  = stPres - stGast
    rowsPVR.push([
      { content: `Subtotal ${rubro}`, colSpan: 4,
        styles: { fillColor: C.grisOscuro, fontStyle: 'bold', fontSize: 7.5 } },
      { content: fmtARS(stPres), styles: { fillColor: C.grisOscuro, halign: 'right', fontStyle: 'bold', fontSize: 7.5 } },
      { content: fmtARS(stGast), styles: { fillColor: C.grisOscuro, halign: 'right', fontStyle: 'bold', fontSize: 7.5 } },
      { content: fmtARS(stDif),  styles: { fillColor: C.grisOscuro, halign: 'right', fontStyle: 'bold', fontSize: 7.5,
          textColor: stDif >= 0 ? C.verde : C.rojo } },
      { content: stPres > 0 ? fmtPct(stGast/stPres*100) : '—',
        styles: { fillColor: C.grisOscuro, halign: 'right', fontStyle: 'bold', fontSize: 7.5 } },
      { content: '', styles: { fillColor: C.grisOscuro } },
    ])
  })

  // Total general
  rowsPVR.push([
    { content: 'TOTAL GENERAL', colSpan: 4,
      styles: { fillColor: C.azulMuyClaro, fontStyle: 'bold', textColor: C.azulOscuro, fontSize: 8 } },
    { content: fmtARS(totPres), styles: { fillColor: C.azulMuyClaro, halign: 'right', fontStyle: 'bold', textColor: C.azulOscuro, fontSize: 8 } },
    { content: fmtARS(totGast), styles: { fillColor: C.azulMuyClaro, halign: 'right', fontStyle: 'bold', textColor: C.azulOscuro, fontSize: 8 } },
    { content: fmtARS(totDif),  styles: { fillColor: C.azulMuyClaro, halign: 'right', fontStyle: 'bold',
        textColor: totDif >= 0 ? C.verde : C.rojo, fontSize: 8 } },
    { content: totPres > 0 ? fmtPct(totGast/totPres*100) : '—',
      styles: { fillColor: C.azulMuyClaro, halign: 'right', fontStyle: 'bold', textColor: C.azulOscuro, fontSize: 8 } },
    { content: '', styles: { fillColor: C.azulMuyClaro } },
  ])

  autoTable(doc, {
    startY: y,
    head: [['Cód.', 'Obra', 'Rubro', 'Concepto', 'Presupuestado', 'Gastado', 'Diferencia', '% Ejec.', 'Semáforo']],
    body: rowsPVR,
    styles:     { fontSize: 7.5, cellPadding: 1.8, overflow: 'ellipsize' },
    headStyles: { fillColor: C.azulClaro, textColor: C.azulOscuro, fontStyle: 'bold', halign: 'center', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 13, halign: 'center' },
      1: { cellWidth: 38 },
      2: { cellWidth: 32 },
      3: { cellWidth: 35 },
      4: { cellWidth: 32, halign: 'right' },
      5: { cellWidth: 30, halign: 'right' },
      6: { cellWidth: 30, halign: 'right' },
      7: { cellWidth: 20, halign: 'right' },
      8: { cellWidth: 27 },
    },
    margin: { left: ML, right: MR, top: 12 },
    tableWidth: CW,
    didDrawPage: () => {
      const pg = doc.internal.getNumberOfPages()
      dibujarCromo(doc, periodoLabel, pg, TOTAL_PAGS, generadoEn)
    },
  })

  // ─────────────────────────────────────────────────────────────
  // PÁGINA 4 — OBRAS EN RIESGO
  // ─────────────────────────────────────────────────────────────
  doc.addPage()
  dibujarCromo(doc, periodoLabel, doc.internal.getNumberOfPages(), TOTAL_PAGS, generadoEn)

  y = 17
  y = dibujarTituloSeccion(doc, 'Obras en Riesgo', y)

  // Subtítulo explicativo
  doc.setFontSize(8)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(...C.grisTexto)
  doc.text(
    'Rubros con ejecución ≥ 80% o sin presupuesto asignado, ordenados de mayor a menor porcentaje ejecutado.',
    ML, y
  )
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.texto)

  if (datos.obrasEnRiesgo.length === 0) {
    // Rectángulo verde de "sin riesgo"
    doc.setFillColor(...C.verdePastel)
    doc.setDrawColor(...C.verde)
    doc.setLineWidth(0.5)
    doc.roundedRect(ML, y, CW, 14, 2, 2, 'FD')
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.verde)
    doc.text('✓  No hay obras en riesgo para este período', PW / 2, y + 8.5, { align: 'center' })
  } else {
    const rowsRiesgo = datos.obrasEnRiesgo.map(r => {
      const bg = colorSem[r.semaforo] ?? C.blanco
      return [
        { content: r.obraCodigo,  styles: { fillColor: bg, fontSize: 7.5 } },
        { content: r.obraNombre,  styles: { fillColor: bg, fontSize: 7.5 } },
        { content: r.rubroNombre, styles: { fillColor: bg, fontSize: 7.5 } },
        { content: r.concepto,    styles: { fillColor: bg, fontSize: 7.5 } },
        { content: fmtARS(r.presupuestado), styles: { fillColor: bg, halign: 'right', fontSize: 7.5 } },
        { content: fmtARS(r.gastado),       styles: { fillColor: bg, halign: 'right', fontSize: 7.5 } },
        { content: fmtARS(r.diferencia),    styles: { fillColor: bg, halign: 'right', fontSize: 7.5,
            textColor: r.diferencia >= 0 ? C.verde : C.rojo } },
        { content: r.presupuestado > 0 ? fmtPct(r.pct) : '—',
          styles: { fillColor: bg, halign: 'right', fontSize: 7.5 } },
        { content: labelSem[r.semaforo] ?? r.semaforo,
          styles: { fillColor: bg, textColor: textSem[r.semaforo] ?? C.texto,
            fontStyle: 'bold', fontSize: 7.5 } },
      ]
    })

    autoTable(doc, {
      startY: y,
      head: [['Cód.', 'Obra', 'Rubro', 'Concepto', 'Presupuestado', 'Gastado', 'Diferencia', '% Ejec.', 'Semáforo']],
      body: rowsRiesgo,
      styles:     { fontSize: 7.5, cellPadding: 1.8, overflow: 'ellipsize' },
      headStyles: { fillColor: [254, 215, 170], textColor: [124, 45, 18], fontStyle: 'bold', halign: 'center', fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 13, halign: 'center' },
        1: { cellWidth: 38 },
        2: { cellWidth: 32 },
        3: { cellWidth: 35 },
        4: { cellWidth: 32, halign: 'right' },
        5: { cellWidth: 30, halign: 'right' },
        6: { cellWidth: 30, halign: 'right' },
        7: { cellWidth: 20, halign: 'right' },
        8: { cellWidth: 27 },
      },
      margin: { left: ML, right: MR, top: 12 },
      tableWidth: CW,
      didDrawPage: () => {
        const pg = doc.internal.getNumberOfPages()
        dibujarCromo(doc, periodoLabel, pg, TOTAL_PAGS, generadoEn)
      },
    })
  }

  // ── Actualizar los encabezados de páginas extras de autoTable ──
  // El "Página X de 4" requiere el total real de páginas al final
  const totalReal = doc.internal.getNumberOfPages()
  if (totalReal !== TOTAL_PAGS) {
    // Re-escribir solo el número de página en el encabezado de cada pág
    for (let p = 1; p <= totalReal; p++) {
      doc.setPage(p)
      // Sobreescribimos la zona del número de página con el fondo azul
      doc.setFillColor(...C.azulOscuro)
      doc.rect(PW - MR - 30, 0, 30, 10, 'F')
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...C.blanco)
      doc.text(`Página ${p} de ${totalReal}`, PW - MR, 6.5, { align: 'right' })
    }
  }

  // ── Descarga ──────────────────────────────────────────────────
  const mes = new Date(periodo + 'T00:00:00')
    .toLocaleDateString('es-AR', { month: 'long' })
  const mesLabel = mes.charAt(0).toUpperCase() + mes.slice(1)
  const anio     = new Date(periodo + 'T00:00:00').getFullYear()
  doc.save(`CashFlow_${mesLabel}_${anio}.pdf`)
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE REACT
// ═══════════════════════════════════════════════════════════════
export default function Exportar() {
  const navigate = useNavigate()

  const [periodo,   setPeriodo]   = useState(periodoActual())
  const [estado,    setEstado]    = useState('idle') // idle | cargando | ok | error
  const [mensError, setMensError] = useState('')

  async function handleExportar() {
    setEstado('cargando')
    setMensError('')
    try {
      await generarPDF(periodo)
      setEstado('ok')
      setTimeout(() => setEstado('idle'), 4000)
    } catch (err) {
      console.error('[Exportar PDF]', err)
      setMensError(err.message ?? 'Error inesperado al generar el PDF.')
      setEstado('error')
    }
  }

  const periodoLabel = PERIODOS.find(p => p.value === periodo)?.label ?? periodo
  const mesAnio      = periodoLabel.replace(' ', '_')

  const secciones = [
    { num: '1', titulo: 'Resumen Ejecutivo',     desc: 'KPIs financieros y saldos por cuenta' },
    { num: '2', titulo: 'Cash Flow',             desc: 'Movimientos con saldo acumulado y alertas de liquidez' },
    { num: '3', titulo: 'Presupuesto vs. Real',  desc: 'Análisis por obra, rubro y concepto con semáforo' },
    { num: '4', titulo: 'Obras en Riesgo',       desc: 'Rubros con ejecución ≥ 80% o sin presupuesto' },
  ]

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      <Navbar titulo="Cash Flow" accentColor="text-blue-400" />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">

        {/* Breadcrumb */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/finanzas')}
            className="text-blue-600 text-sm hover:text-blue-800 transition-colors
                       flex items-center gap-1.5 mb-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                 strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Panel de Finanzas
          </button>
          <h1 className="text-slate-900 text-2xl font-semibold tracking-tight">
            Exportar a PDF
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Reporte mensual para el Directorio
          </p>
        </div>

        {/* Card central */}
        <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-lg mx-auto mt-6">

          {/* Ícono */}
          <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-xl
                          flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24"
                 strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125
                   1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75
                   12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125
                   1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0
                   1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>

          <h2 className="text-slate-900 font-semibold text-lg text-center mb-1">
            Reporte para el Directorio
          </h2>
          <p className="text-slate-500 text-sm text-center mb-6">
            El archivo PDF incluye 4 páginas con toda la
            información del período seleccionado, listo para
            presentar al Directorio.
          </p>

          {/* Lista de secciones */}
          <ul className="space-y-2.5 mb-7">
            {secciones.map(s => (
              <li key={s.num} className="flex items-start gap-3">
                <span className="w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full
                                 text-xs font-bold flex items-center justify-center
                                 shrink-0 mt-0.5">
                  {s.num}
                </span>
                <div>
                  <span className="text-slate-700 text-sm font-medium">{s.titulo}</span>
                  <span className="text-slate-400 text-xs block">{s.desc}</span>
                </div>
              </li>
            ))}
          </ul>

          {/* Selector de período */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Período a exportar
            </label>
            <select
              value={periodo}
              onChange={e => { setPeriodo(e.target.value); setEstado('idle') }}
              disabled={estado === 'cargando'}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200
                         text-slate-900 bg-white focus:outline-none focus:ring-2
                         focus:ring-emerald-500 focus:border-transparent
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {PERIODOS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Botón de exportación */}
          <button
            onClick={handleExportar}
            disabled={estado === 'cargando'}
            className="w-full inline-flex items-center justify-center gap-3
                       bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800
                       disabled:opacity-60 disabled:cursor-not-allowed
                       text-white font-semibold text-sm
                       px-6 py-3.5 rounded-xl transition-colors duration-150"
          >
            {estado === 'cargando' ? (
              <>
                <span className="w-5 h-5 border-2 border-white/30 border-t-white
                                 rounded-full animate-spin" />
                Generando PDF…
              </>
            ) : estado === 'ok' ? (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24"
                     strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                PDF generado correctamente
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24"
                     strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021
                       18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Generar y descargar PDF
              </>
            )}
          </button>

          {/* Feedback de éxito */}
          {estado === 'ok' && (
            <div className="mt-4 flex items-center gap-2.5 bg-emerald-50 border
                            border-emerald-100 rounded-lg px-4 py-3">
              <svg className="w-4 h-4 text-emerald-600 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0
                     00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06
                     1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd" />
              </svg>
              <p className="text-emerald-700 text-sm">
                <strong>CashFlow_{mesAnio}.pdf</strong> descargado correctamente.
              </p>
            </div>
          )}

          {/* Feedback de error */}
          {estado === 'error' && (
            <div className="mt-4 flex items-start gap-2.5 bg-red-50 border
                            border-red-100 rounded-lg px-4 py-3">
              <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0
                     00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10
                     11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75
                     0 00-1.06-1.06L10 8.94 8.28 7.22z"
                  clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-red-700 text-sm font-medium">Error al generar el PDF</p>
                <p className="text-red-600 text-xs mt-0.5">{mensError}</p>
                <button onClick={() => setEstado('idle')}
                  className="text-red-500 text-xs underline mt-1 hover:text-red-700">
                  Intentar de nuevo
                </button>
              </div>
            </div>
          )}

          {/* Nombre del archivo a generar */}
          {estado === 'idle' && (
            <p className="text-slate-400 text-xs text-center mt-4">
              Se descargará como{' '}
              <span className="font-medium text-slate-500">
                CashFlow_{mesAnio}.pdf
              </span>
            </p>
          )}

        </div>
      </main>
    </div>
  )
}
