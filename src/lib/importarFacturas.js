// src/lib/importarFacturas.js
//
// Importación masiva de facturas pegadas desde el Excel "PROYECCION DE PAGOS" (hoja "Facturas a pagar").
// Todo acá son funciones puras (sin pantalla ni base) para poder probarlas: leer lo pegado, normalizar
// cada fila al formato del Cash Flow, y compararla con lo que ya está cargado.
//
// Columnas de la hoja (A-O): FACTURA (proveedor) · Ingresó FC · NRO FC · RUBRO · Periodo Facturado · FF (fecha
// de la factura) · Importe · DIAS COMPROMISO · ESTADO PAGO · Forma de pago · Estado (aprobación) · F.COMP ·
// cash flow (fecha de pago) · OBRA · APROBADOR.
//
// Estados de cada fila al comparar:
//   nueva     (verde)  no hay coincidencia: se puede importar
//   cargada   (rojo)   ya está en el Cash Flow (o está repetida en lo pegado): no se importa
//   revisar   (ámbar)  hay dudas (posible duplicado, varias obras, fecha pasada...): no se importa salvo que se tilde
//   omitida   (gris)   no corresponde importarla acá (ya pagada en el Excel, sin estado de pago)
//   error     (gris)   falta un dato o es inválido (monto, rubro, obra, fecha de pago): no se puede importar

// ── Lectura de lo pegado (TSV de Excel) ─────────────────────────────────────

// Excel copia con tabuladores entre columnas y saltos de línea entre filas; las celdas con saltos de línea o
// comillas vienen entre comillas dobles.
export function parsearTSV(texto) {
  const filas = []
  let fila = [], celda = '', entreComillas = false
  const t = String(texto ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (entreComillas) {
      if (c === '"') { if (t[i + 1] === '"') { celda += '"'; i++ } else entreComillas = false }
      else celda += c
    } else if (c === '"' && celda === '') entreComillas = true
    else if (c === '\t') { fila.push(celda); celda = '' }
    else if (c === '\n') { fila.push(celda); filas.push(fila); fila = []; celda = '' }
    else celda += c
  }
  if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila) }
  return filas.filter(f => f.some(c => String(c).trim() !== ''))
}

export const CAMPOS = ['proveedor', 'ingreso', 'nro', 'rubro', 'periodo', 'fechaFactura', 'monto', 'plazo',
  'estadoPago', 'forma', 'aprobacion', 'fechaComp', 'fechaPago', 'obra', 'aprobador']

const sinAcentos = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
const clave = s => sinAcentos(s).toUpperCase().replace(/\s+/g, ' ').trim()

// Reconoce una celda de encabezado y devuelve el campo al que corresponde.
function campoDeEncabezado(celda) {
  const h = sinAcentos(celda).toLowerCase().replace(/\s+/g, ' ').trim()
  if (!h) return null
  if (h === 'factura' || h === 'proveedor') return 'proveedor'
  if (/^ingres/.test(h)) return 'ingreso'
  if (/^(nro|n°|numero|n\.)/.test(h)) return 'nro'
  if (/^rubro/.test(h)) return 'rubro'
  if (/^periodo/.test(h)) return 'periodo'
  if (h === 'ff' || /fecha.*fact/.test(h)) return 'fechaFactura'
  if (/^(importe|monto)/.test(h)) return 'monto'
  if (/^dias/.test(h)) return 'plazo'
  if (/^estado pago/.test(h)) return 'estadoPago'
  if (/^forma/.test(h)) return 'forma'
  if (h === 'estado') return 'aprobacion'
  if (/^f\.? ?comp/.test(h)) return 'fechaComp'
  if (/^cash ?flow/.test(h)) return 'fechaPago'
  if (/^obra/.test(h)) return 'obra'
  if (/^aprobador/.test(h)) return 'aprobador'
  return null
}

// Si la primera fila es un encabezado, arma el mapa campo→columna por nombre (sirve aunque falten o cambien de
// orden columnas). Si no hay encabezado, asume el orden de la hoja (A-O).
export function detectarColumnas(filas) {
  const primera = filas[0] ?? []
  const porNombre = {}
  primera.forEach((celda, i) => { const c = campoDeEncabezado(celda); if (c && !(c in porNombre)) porNombre[c] = i })
  if (Object.keys(porNombre).length >= 3) return { mapa: porNombre, conEncabezado: true, datos: filas.slice(1) }
  const posicional = {}
  CAMPOS.forEach((c, i) => { posicional[c] = i })
  return { mapa: posicional, conEncabezado: false, datos: filas }
}

// ── Normalización de valores ───────────────────────────────────────────────

// "$1.441.412,50" (AR) · "$1,441,412.50" (US) · "1441412.5" · "-$ 500" → número. Null si no se entiende.
export function parseMonto(valor) {
  let s = String(valor ?? '').replace(/[$\s ]/g, '')
  if (s === '' || /[a-zA-Z#]/.test(s)) return null
  let negativo = false
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1) }
  if (s.startsWith('-')) { negativo = !negativo; s = s.slice(1) }
  if (!/^[\d.,]+$/.test(s)) return null
  const ultimoPunto = s.lastIndexOf('.'), ultimaComa = s.lastIndexOf(',')
  let decimal = null
  if (ultimoPunto >= 0 && ultimaComa >= 0) decimal = ultimoPunto > ultimaComa ? '.' : ','
  else if (ultimaComa >= 0) decimal = (s.match(/,/g).length === 1 && s.length - ultimaComa - 1 !== 3) ? ',' : null
  else if (ultimoPunto >= 0) decimal = (s.match(/\./g).length === 1 && s.length - ultimoPunto - 1 !== 3) ? '.' : null
  let limpio = decimal ? s.split(decimal === '.' ? ',' : '.').join('') : s.replace(/[.,]/g, '')
  if (decimal === ',') limpio = limpio.replace(',', '.')
  const n = Number(limpio)
  if (!Number.isFinite(n)) return null
  return Math.round((negativo ? -n : n) * 100) / 100
}

const pad = n => String(n).padStart(2, '0')

// "21/10/26" · "21/10/2026" · "2026-10-21" → "2026-10-21" (ISO). Null si es "#####" o no se entiende.
export function parseFecha(valor) {
  const s = String(valor ?? '').trim()
  let m
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return valida(+m[1], +m[2], +m[3])
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) {
    const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return valida(anio, +m[2], +m[1])
  }
  return null
}
function valida(a, m, d) {
  const f = new Date(a, m - 1, d)
  return f.getFullYear() === a && f.getMonth() === m - 1 && f.getDate() === d ? `${a}-${pad(m)}-${pad(d)}` : null
}

const MESES = { ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6, JULIO: 7, AGOSTO: 8,
  SEPTIEMBRE: 9, SETIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12 }

// "SEPTIEMBRE" → "2026-09-01". El año se deduce de la fecha de la factura (o de la de pago): el período
// siempre es el mes de la factura o uno cercano. También acepta "2026-09", "09/2026" y "septiembre 2026".
export function parsePeriodo(valor, fechaRef) {
  const s = clave(valor)
  if (!s) return null
  let m
  if ((m = s.match(/^(\d{4})-(\d{1,2})(-\d{1,2})?$/))) return +m[2] >= 1 && +m[2] <= 12 ? `${m[1]}-${pad(m[2])}-01` : null
  if ((m = s.match(/^(\d{1,2})\/(\d{4})$/))) return +m[1] >= 1 && +m[1] <= 12 ? `${m[2]}-${pad(m[1])}-01` : null
  if ((m = s.match(/^([A-Z]+)\s*(?:DE\s*)?(\d{4})$/)) && MESES[m[1]]) return `${m[2]}-${pad(MESES[m[1]])}-01`
  const mes = MESES[s]
  if (!mes) return null
  if (!fechaRef) return null
  const [a, mf] = fechaRef.split('-').map(Number)
  let anio = a
  if (mes > mf + 6) anio = a - 1
  else if (mes < mf - 6) anio = a + 1
  return `${anio}-${pad(mes)}-01`
}

// Rubros del Excel → rubros del sistema. Es el mismo criterio con el que ya se cargaron las facturas anteriores.
export const MAPA_RUBROS = {
  'SUBCONTRATO': 'Subcontratos',
  'SUBCONTRATOS': 'Subcontratos',
  'MATERIALES': 'Materiales',
  'VEHICULOS': 'Vehículos',
  'GASTOS OPERATIVOS': 'Otros Gastos Operativos',
  'EPP': 'Otros Gastos Operativos',
  'ALQ SEG HYS OTROS GASTOS': 'Gastos Generales',
  'IMPUESTOS': 'Impuestos',
}

export const MAPA_FORMAS = {
  'TRF': 'transferencia', 'TRANSFERENCIA': 'transferencia',
  'E CHEQ': 'echeq', 'ECHEQ': 'echeq',
  'DEBITO AUTOMATICO': 'debito_automatico',
}

const norm = (s, i) => (i == null ? '' : String(s[i] ?? '').trim())

// Una fila pegada → una factura normalizada, con sus avisos (revisar) y errores (no importable).
// `hoyISO` se usa para detectar fechas de pago ya pasadas.
export function normalizarFila(celdas, mapa, hoyISO) {
  const v = campo => (campo in mapa ? String(celdas[mapa[campo]] ?? '').trim() : '')
  const errores = [], avisos = []

  // Proveedor (y notas entre paréntesis)
  let proveedor = v('proveedor').replace(/\s+/g, ' ')
  let observaciones = null
  const nc = proveedor.match(/\(\s*SE APLICA LA NC\s*([\d-]+)\s*\)/i)
  if (nc) { observaciones = `Se aplica la NC ${nc[1]}`; proveedor = proveedor.replace(nc[0], '').trim() }
  // "SWISS MEDICAL MENOS NC 1020-918052": la nota de crédito no es parte del nombre del proveedor
  const menosNC = proveedor.match(/\s*[-–]?\s*MENOS\s+NC\s*([\d-]+)/i)
  if (menosNC) {
    observaciones = [observaciones, `Menos NC ${menosNC[1]}`].filter(Boolean).join(' · ')
    proveedor = proveedor.replace(menosNC[0], '').trim()
  }
  const prorrateo = /\(.*\d+\s*%.*\)/.test(proveedor) || /\d+\s*%/.test(proveedor)
  if (prorrateo) avisos.push('El proveedor indica un prorrateo entre obras (porcentajes): cargarla a mano repartida.')
  if (!proveedor) errores.push('Falta el proveedor.')

  const nro = v('nro') || null

  const monto = parseMonto(v('monto'))
  if (monto == null || monto <= 0) errores.push('El importe no es un monto válido.')

  const fechaFactura = parseFecha(v('fechaFactura'))
  let fechaPago = parseFecha(v('fechaPago'))
  if (!fechaPago) fechaPago = parseFecha(v('fechaComp'))
  if (!fechaPago) errores.push('Falta la fecha de pago (columna "cash flow").')
  else if (hoyISO && fechaPago < hoyISO) avisos.push('La fecha de pago ya pasó: probablemente ya está paga.')

  // Rubro
  const rubroExcel = clave(v('rubro'))
  const rubro = MAPA_RUBROS[rubroExcel] ?? null
  if (!rubroExcel) errores.push('Falta el rubro.')
  else if (!rubro) errores.push(`Rubro no reconocido: "${v('rubro')}".`)

  // Período
  let periodo = null
  if (clave(v('periodo'))) {
    periodo = parsePeriodo(v('periodo'), fechaFactura ?? fechaPago)
    if (!periodo) errores.push(`Período no reconocido: "${v('periodo')}".`)
  } else if (fechaFactura) {
    periodo = `${fechaFactura.slice(0, 7)}-01`
    avisos.push(`Sin período: se usaría el mes de la factura (${periodo.slice(0, 7)}).`)
  } else errores.push('Falta el período.')

  // Obra: un código ("678", "2026-1") o varias obras ("648/2026", "varias")
  let obra = clave(v('obra')).replace(/\s/g, '')
  let obraMultiple = false
  if (!obra) errores.push('Falta la obra.')
  else if (/[/,]|VARIAS|^SIN/.test(obra) || /^\d+-\d+\/|\/\d/.test(obra)) { obraMultiple = true; avisos.push(`Obra "${v('obra')}": varias obras o sin asignar, no se puede asignar sola.`) }

  // Forma de pago
  const formaExcel = clave(v('forma'))
  const forma = formaExcel ? (MAPA_FORMAS[formaExcel] ?? null) : 'transferencia'
  if (formaExcel && !forma) avisos.push(`Forma de pago no reconocida: "${v('forma')}" (se carga como transferencia).`)

  // Estado de pago y aprobación
  const ep = clave(v('estadoPago'))
  const estadoPago = ep === 'PENDIENTE' ? 'pendiente' : ep === 'OK' ? 'pagada' : ep === '' ? 'sin_estado' : 'otro'
  const aprobacion = v('aprobacion')
  const apr = clave(aprobacion)
  if (/OP DIRECTA|DESAPROBADA|SIN OBRA|SIN CARGAR/.test(apr)) avisos.push(`Estado "${aprobacion}": no es una factura aprobada normal.`)
  if (!nro && !/OP DIRECTA/.test(apr)) avisos.push('Sin número de factura.')

  return {
    proveedor, nro, rubroExcel: v('rubro'), rubro, periodo, fechaFactura, fechaPago, monto,
    obraExcel: v('obra'), obra: obraMultiple ? null : obra, obraMultiple,
    forma: forma ?? 'transferencia', estadoPago, aprobacion, plazo: v('plazo'), observaciones, prorrateo,
    errores, avisos,
  }
}

// ── Comparación con lo ya cargado ──────────────────────────────────────────

const MES_ABREV = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 }

// Compara números de factura tolerando lo que Excel hace con "7-3909" (lo convierte en la fecha "jul-09").
export function normalizarNro(s) {
  if (s == null || String(s).trim() === '') return null
  s = String(s).trim().toLowerCase().replace(/\s/g, '')
  let m
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${Number(m[2])}|${m[1].slice(-2)}`
  if ((m = s.match(/^([a-z]{3})-(\d+)$/)) && MES_ABREV[m[1]]) return `${MES_ABREV[m[1]]}|${m[2].slice(-2)}`
  if ((m = s.match(/^(\d+)-([a-z]{3})$/)) && MES_ABREV[m[2]]) return `${Number(m[1])}|${pad(MES_ABREV[m[2]])}`
  if ((m = s.match(/^(\d+)-(\d+)$/))) return `${Number(m[1])}|${m[2].slice(-2)}`
  return s
}
export function mismoNro(a, b) {
  const x = normalizarNro(a), y = normalizarNro(b)
  if (x == null || y == null) return null
  return x === y
}

// Palabras "importantes" del nombre (3+ letras), para decidir si dos proveedores son el mismo aunque estén
// escritos distinto ("DANIEL FEITO" / "FEITO DANIEL", "DOS.H SRL" / "DOS HS SRL").
const tokens = s => sinAcentos(s).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length >= 3)
export function mismoProveedor(a, b) {
  const ta = tokens(a), tb = tokens(b)
  if (!ta.length || !tb.length) return false
  const [chico, grande] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  return chico.every(t => grande.some(u => u.startsWith(t) || t.startsWith(u)))
}

const mismoMonto = (a, b) => Math.abs(Number(a) - Number(b)) < 0.006

// existentes: facturas ya cargadas en el Cash Flow:
//   { id, proveedor_cliente, numero_factura, monto_bruto, estado, fecha_pago, periodo, obraCodigo }
// Devuelve { estado, motivos[], coincidencias[] } para una fila ya normalizada.
export function clasificarFila(fila, existentes) {
  const motivos = [...fila.avisos]
  const coincidencias = []

  if (fila.errores.length) return { estado: 'error', motivos: fila.errores, coincidencias }
  if (fila.estadoPago === 'pagada') return { estado: 'omitida', motivos: ['Marcada como pagada (OK) en el Excel: no es una factura a pagar.'], coincidencias }
  if (fila.estadoPago !== 'pendiente') {
    return { estado: 'omitida', motivos: [fila.estadoPago === 'sin_estado' ? 'Sin estado de pago en el Excel (no figura como PENDIENTE).' : 'Estado de pago no reconocido.'], coincidencias }
  }

  const mismos = existentes.filter(e => mismoProveedor(e.proveedor_cliente, fila.proveedor))
  const detalle0 = e => `${e.proveedor_cliente} · ${e.numero_factura ?? 'sin nº'} · ${Number(e.monto_bruto).toLocaleString('es-AR', { minimumFractionDigits: 2 })} · obra ${e.obraCodigo ?? '—'} · ${e.estado} · pago ${e.fecha_pago ?? '—'}`
  const detalle = e => `${e.proveedor_cliente} · ${e.numero_factura ?? 'sin nº'} · ${Number(e.monto_bruto).toLocaleString('es-AR', { minimumFractionDigits: 2 })} · obra ${e.obraCodigo ?? '—'} · ${e.estado} · pago ${e.fecha_pago ?? '—'}`

  // 0. Mismo número, importe y obra: es la misma factura aunque el proveedor esté escrito distinto (error de tipeo)
  if (fila.nro && !fila.obraMultiple) {
    const fuertes = existentes.filter(e => mismoNro(e.numero_factura, fila.nro) === true && mismoMonto(e.monto_bruto, fila.monto) && e.obraCodigo === fila.obra)
    if (fuertes.length) return { estado: 'cargada', motivos: ['Ya cargada: mismo número, importe y obra (el proveedor está escrito distinto).'], coincidencias: fuertes.map(detalle0) }
  }

  // 1. Mismo número de factura
  const conNro = fila.nro ? mismos.filter(e => mismoNro(e.numero_factura, fila.nro) === true) : []
  if (conNro.length) {
    const exacta = conNro.filter(e => mismoMonto(e.monto_bruto, fila.monto) && !fila.obraMultiple && e.obraCodigo === fila.obra)
    if (exacta.length) return { estado: 'cargada', motivos: ['Ya cargada: mismo proveedor, número, obra e importe.'], coincidencias: exacta.map(detalle) }
    // Factura prorrateada en varias obras: lo cargado con ese número suma el importe de la factura.
    const suma = conNro.reduce((s, e) => s + Number(e.monto_bruto), 0)
    if (conNro.length > 1 && Math.abs(suma - fila.monto) < 0.05)
      return { estado: 'cargada', motivos: [`Ya cargada, repartida en ${conNro.length} obras.`], coincidencias: conNro.map(detalle) }
    const mismoMontoOtraObra = conNro.filter(e => mismoMonto(e.monto_bruto, fila.monto))
    if (mismoMontoOtraObra.length) motivos.push('Mismo número e importe ya cargados, pero con otra obra: revisar.')
    else motivos.push('Mismo proveedor y número ya cargados con otro importe: puede ser una corrección o un prorrateo.')
    return { estado: 'revisar', motivos, coincidencias: conNro.map(detalle) }
  }

  // 2. Mismo proveedor, obra e importe, pero sin número para comparar (en lo cargado o en lo pegado)
  const mismoImporte = mismos.filter(e => !fila.obraMultiple && e.obraCodigo === fila.obra && mismoMonto(e.monto_bruto, fila.monto))
  const sinComparar = mismoImporte.filter(e => mismoNro(e.numero_factura, fila.nro) === null)
  if (sinComparar.length) {
    const igual = sinComparar.filter(e => e.estado === 'proyectado' && e.fecha_pago === fila.fechaPago)
    if (igual.length) return { estado: 'cargada', motivos: ['Ya cargada: mismo proveedor, obra, importe y fecha de pago (sin número para comparar).'], coincidencias: igual.map(detalle) }
    // Si ya estaba paga antes de que existiera esta factura, es otra distinta.
    const posibles = sinComparar.filter(e => !(fila.fechaFactura && e.fecha_pago && e.fecha_pago < fila.fechaFactura))
    if (posibles.length) {
      motivos.push('Hay una factura del mismo proveedor, obra e importe sin número para comparar: confirmar que no sea la misma.')
      return { estado: 'revisar', motivos, coincidencias: posibles.map(detalle) }
    }
  }

  // 3. Mismo proveedor, obra e importe pero con otro número: es otra factura (el proveedor repite importes)
  const otras = mismoImporte.filter(e => mismoNro(e.numero_factura, fila.nro) === false)
  if (otras.length) { motivos.push('Hay otra factura del mismo proveedor, obra e importe pero con distinto número.'); coincidencias.push(...otras.map(detalle)) }

  // Cualquier aviso (varias obras, prorrateo, fecha ya pasada, sin número, estado raro...) pide revisión manual.
  if (fila.avisos.length) return { estado: 'revisar', motivos, coincidencias }
  return { estado: 'nueva', motivos, coincidencias }
}

// Clasifica todas las filas, incluidas las repetidas dentro de lo pegado (la segunda queda en rojo).
export function analizarPegado(texto, existentes, { hoyISO, obrasPorCodigo = {}, rubrosPorNombre = {} } = {}) {
  const filasTSV = parsearTSV(texto)
  const { mapa, conEncabezado, datos } = detectarColumnas(filasTSV)
  const faltan = ['proveedor', 'monto', 'obra', 'rubro', 'fechaPago'].filter(c => !(c in mapa))
  const vistas = new Map()
  const filas = datos.map((celdas, i) => {
    const f = normalizarFila(celdas, mapa, hoyISO)
    // La obra y el rubro tienen que existir en el sistema
    if (!f.errores.length) {
      if (f.obra && !obrasPorCodigo[f.obra]) f.errores.push(`La obra "${f.obraExcel}" no existe o no está activa en el sistema.`)
      if (f.rubro && !rubrosPorNombre[f.rubro]) f.errores.push(`El rubro "${f.rubro}" no existe como rubro de obra activo.`)
    }
    let res = clasificarFila(f, existentes)
    if (res.estado === 'nueva' || res.estado === 'revisar') {
      const k = [f.proveedor.toUpperCase().slice(0, 8), normalizarNro(f.nro) ?? '', f.monto, f.obra ?? f.obraExcel].join('|')
      if (vistas.has(k)) res = { estado: 'cargada', motivos: [`Repetida en lo pegado (misma que la fila ${vistas.get(k)}).`], coincidencias: [] }
      else vistas.set(k, i + 1 + (conEncabezado ? 1 : 0))
    }
    return { n: i + 1 + (conEncabezado ? 1 : 0), ...f, ...res }
  })
  return { filas, mapa, conEncabezado, faltan }
}

// Resumen para las tarjetas de la pantalla
export function resumir(filas) {
  const r = { total: filas.length, nueva: 0, cargada: 0, revisar: 0, omitida: 0, error: 0, montoNuevas: 0 }
  filas.forEach(f => { r[f.estado]++; if (f.estado === 'nueva') r.montoNuevas += f.monto })
  r.montoNuevas = Math.round(r.montoNuevas * 100) / 100
  return r
}

// Aviso (no bloquea) igual al del formulario: la factura hace pasar al gasto real del presupuesto de la
// obra/rubro/período. presupuestos: [{obra_id, rubro_id, periodo, monto}], facturasReales: [{obra_id, rubro_id, periodo, monto_bruto}]
export function avisoPresupuesto(fila, obraId, rubroId, presupuestos, facturasReales, yaSumadoEnLote = 0) {
  if (!obraId || !rubroId || !fila.periodo) return null
  const pres = presupuestos.filter(p => p.obra_id === obraId && p.rubro_id === rubroId && p.periodo === fila.periodo).reduce((s, p) => s + Number(p.monto), 0)
  if (pres <= 0) return null
  const gastado = facturasReales.filter(m => m.obra_id === obraId && m.rubro_id === rubroId && m.periodo === fila.periodo).reduce((s, m) => s + Number(m.monto_bruto), 0)
  const total = gastado + yaSumadoEnLote + fila.monto
  return total > pres ? { presupuestado: pres, gastado: gastado + yaSumadoEnLote, nuevo: fila.monto } : null
}

// Arma el registro con los mismos campos que guarda el formulario "Nuevo movimiento" para una factura.
export function construirMovimiento(fila, { obraId, rubroId, cuentaId, userId }) {
  return {
    tipo: 'egreso',
    categoria: 'factura',
    periodo: fila.periodo,
    cuenta_id: cuentaId,
    monto_bruto: fila.monto,
    estado: 'proyectado',
    created_by: userId,
    proveedor_cliente: fila.proveedor,
    numero_factura: fila.nro,
    fecha_factura: fila.fechaFactura,
    obra_id: obraId,
    rubro_id: rubroId,
    concepto: null,
    forma_pago: fila.forma,
    numero_op: null,
    fecha_pago: fila.fechaPago,
    observaciones: fila.observaciones,
  }
}
