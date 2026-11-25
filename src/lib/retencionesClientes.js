// Retenciones estimadas por cliente (PILOTO). Para cada cobro de una factura de venta o venta proyectada se estima cuánto
// nos va a retener el cliente (IVA, Ganancias, IIBB, SUSS) y cuánto le saca el banco a lo que entra.
//
// De dónde salen las tasas: la tabla de retenciones de Finanzas (24/11/2026) contrastada con los 72 recibos de septiembre a
// noviembre de 2026 del sistema contable (nube.psdata.com.ar, Fondos > Recibo > "Cuentas Ingreso"). Todas las tasas son
// estimadas: la retención exacta aparece recién en el recibo, y cuando se cobra la fila estimada se reemplaza por lo real.
//   - El importe de una factura trae IVA 21%: sin IVA (neto) = total / 1,21.
//   - Ganancias, IIBB Capital / Buenos Aires / Misiones y SUSS se calculan sobre el importe SIN IVA.
//   - IIBB Santa Fe se calcula sobre el TOTAL con IVA (así sale en los recibos de ARSAT, Teledifusora y NEC), por la parte de la
//     obra que cae en Santa Fe: la tasa de abajo ya es la efectiva medida (NEC 3,1% del total, ARSAT 4,3%, Teledifusora 4,5%).
//   - La retención de IVA solo la hace NEC: el 80% del IVA. Es un adelanto de IVA: se recupera contra el IVA a pagar.
//   - Después de las retenciones, el banco le saca IIBB 3% + Ley 25413 0,6% a lo que acredita (medido en los extractos).
// Editable: Finanzas puede cambiar las alícuotas, agregar o sacar retenciones de UNA venta o de TODAS las ventas de un
// cliente (tabla retenciones_config, ver sql/retenciones_config.sql). Prioridad: ajuste de la venta > ajuste del cliente >
// valores estándar de este archivo.
// `activa: false` vuelve al cálculo anterior (filas grises con tasas generales sobre el total, y 22,2% para NEC).
export const RETENCIONES_POR_CLIENTE = { activa: true }

export const IVA_FACTURAS = 0.21
export const TASAS_BANCO = [
  { clave: 'iibb_banco', etiqueta: 'IIBB banco', base: 'acreditado', tasa: 0.03 },
  { clave: 'ley25413', etiqueta: 'Ley 25413', base: 'acreditado', tasa: 0.006 },
]
// Clientes sin perfil propio: las dos retenciones generales de siempre (Ganancias 2% y SUSS 2% del total).
export const PERFIL_GENERAL = { clave: 'general', nombre: 'Cliente sin perfil', patron: null, obras: [], retenciones: [
  { clave: 'ganancias', etiqueta: 'Retención Ganancias', base: 'total', tasa: 0.02 },
  { clave: 'suss', etiqueta: 'Retención SUSS', base: 'total', tasa: 0.02 },
] }
export const BASES_RETENCION = {
  neto: 'Importe sin IVA', iva: 'IVA de la factura', total: 'Total con IVA', monto: 'Monto fijo',
}

// base: 'neto' (sin IVA) | 'iva' (el IVA de la factura) | 'total' (con IVA)
const GAN = { clave: 'ganancias', etiqueta: 'Retención Ganancias', base: 'neto', tasa: 0.02 }
const CABA = { clave: 'iibb_caba', etiqueta: 'Retención IIBB Capital', base: 'neto', tasa: 0.01 }

export const PERFILES_RETENCION = [
  { clave: 'nec', nombre: 'NEC', patron: /NEC\s+ARGENTINA/i, obras: ['658', '659', '660', '661', '677', '678', '680'], retenciones: [
    { clave: 'iva', etiqueta: 'Retención IVA (adelanto de IVA)', base: 'iva', tasa: 0.8, esIVA: true },
    GAN, CABA,
    { clave: 'iibb_sf', etiqueta: 'Retención IIBB Santa Fe', base: 'total', tasa: 0.031 },
  ] },
  { clave: 'arsat', nombre: 'ARSAT', patron: /EMPRESA ARGENTINA DE S|ARSAT/i, obras: ['668', '669', '670', '671', '672', '673', '679'], retenciones: [
    GAN,
    { clave: 'iibb_sf', etiqueta: 'Retención IIBB Santa Fe', base: 'total', tasa: 0.043 },
    { clave: 'iibb_otras', etiqueta: 'Retención IIBB otras jurisdicciones', base: 'total', tasa: 0.003 },
  ] },
  { clave: 'teledifusora', nombre: 'Teledifusora', patron: /TELEDIFUSORA/i, obras: ['681'], retenciones: [
    GAN,
    { clave: 'iibb_sf', etiqueta: 'Retención IIBB Santa Fe', base: 'total', tasa: 0.045 },
  ] },
  { clave: 'ministerio', nombre: 'Ministerio de Salud', patron: /MINISTERIO DE SALUD/i, obras: ['649'], retenciones: [
    { ...GAN, base: 'total' }, // sus facturas no traen IVA: Ganancias da 2,0% del total en los recibos
    { clave: 'iibb_sf', etiqueta: 'Retención IIBB Santa Fe', base: 'total', tasa: 0.045 },
  ] },
  { clave: 'gigared', nombre: 'Gigared', patron: /GIGARED/i, obras: ['666'], retenciones: [
    GAN, CABA,
    { clave: 'iibb_misiones', etiqueta: 'Retención IIBB Misiones', base: 'neto', tasa: 0.0196 },
  ] },
  { clave: 'bgh', nombre: 'BGH', patron: /BGH/i, obras: [], retenciones: [
    GAN, CABA,
    { clave: 'iibb_pba', etiqueta: 'Retención IIBB Buenos Aires', base: 'neto', tasa: 0.013 },
  ] },
  { clave: 'silica', nombre: 'Silica', patron: /SILICA/i, obras: ['674'], retenciones: [GAN, CABA] },
  { clave: 'cps', nombre: 'CPS-Metrotel', patron: /CPS/i, obras: ['665'], retenciones: [GAN, CABA] },
  { clave: 'esinel', nombre: 'Esinel', patron: /ESINEL/i, obras: ['675'], retenciones: [
    { clave: 'suss', etiqueta: 'Retención SUSS', base: 'neto', tasa: 0.012 },
    { clave: 'iibb_pba', etiqueta: 'Retención IIBB Buenos Aires', base: 'neto', tasa: 0.013 },
    GAN,
  ] },
]

// Perfil de un cobro: primero por el nombre del cliente de la factura; si no, por la obra (las ventas proyectadas no
// traen cliente, solo obra). Devuelve null si no se sabe de quién es: ahí se usa el cálculo general de siempre.
export function perfilDeCobro(m) {
  const nombre = m.proveedor_cliente ?? ''
  const porNombre = nombre && PERFILES_RETENCION.find(p => p.patron.test(nombre))
  if (porNombre) return porNombre
  const codigo = m.obras?.codigo
  return (codigo && PERFILES_RETENCION.find(p => p.obras.includes(String(codigo)))) || null
}

const redondear = n => Math.round(n * 100) / 100
const textoBase = { neto: 'del importe sin IVA', iva: 'del IVA', total: 'del total con IVA', acreditado: 'de lo que acredita el banco' }
const pct = t => `${Math.round(t * 10000) / 100}%`.replace('.', ',')

// ─── Ajustes editables (tabla retenciones_config) ────────────────────────────────────────────
// Cada ajuste tiene una clave: 'cliente:<perfil>' (todas las ventas de ese cliente) o 'venta:<clave de la venta>' (una sola).
export const claveAjusteCliente = perfil => `cliente:${perfil.clave}`
// Una factura de venta real se identifica por su id; una venta proyectada, por obra + período (todas sus partes comparten).
export const claveAjusteVenta = m =>
  (m.categoria === 'venta_proyectada' && m._claveFecha) ? `venta:vp:${m._claveFecha.obra_id}|${m._claveFecha.periodo}` : `venta:fc:${m.id}`

const BASES_VALIDAS = new Set(['neto', 'iva', 'total', 'monto', 'acreditado'])
// Limpia una lista de retenciones que viene de la base o de la pantalla: descarta lo mal formado, nunca rompe el cálculo.
export function normalizarItems(items, baseFija = null) {
  if (!Array.isArray(items)) return null
  return items.map((it, i) => {
    const base = baseFija ?? it?.base
    const tasa = Number(it?.tasa), monto = Number(it?.monto)
    const etiqueta = String(it?.etiqueta ?? '').trim()
    if (!BASES_VALIDAS.has(base) || !etiqueta) return null
    if (base === 'monto' ? !(monto >= 0) : !(tasa >= 0 && tasa <= 1)) return null
    return { clave: String(it?.clave || `extra_${i}`), etiqueta, base, tasa: base === 'monto' ? 0 : tasa, monto: base === 'monto' ? monto : 0, esIVA: !!it?.esIVA }
  }).filter(Boolean)
}

// De dónde salen las retenciones de una venta: ajuste de la venta, si no ajuste del cliente, si no los valores estándar.
// `config` = Map clave -> { retenciones, banco } (ver mapaDeAjustes). Devuelve { retenciones, banco, fuente }.
export function resolverRetenciones(m, perfil, config) {
  const venta = config?.get(claveAjusteVenta(m))
  const cliente = perfil.clave !== 'general' ? config?.get(claveAjusteCliente(perfil)) : null
  const ajuste = venta ?? cliente ?? null
  const fuente = venta ? 'venta' : cliente ? 'cliente' : 'estandar'
  // Una lista vacía es válida (se sacaron todas las retenciones); una lista con datos rotos se ignora: nunca desaparece plata por un dato mal guardado.
  const valida = (lista, base) => { const n = normalizarItems(lista, base); return n && (n.length > 0 || lista.length === 0) ? n : null }
  const retenciones = valida(ajuste?.retenciones, null) ?? perfil.retenciones
  const banco = valida(ajuste?.banco, 'acreditado') ?? TASAS_BANCO
  return { retenciones, banco, fuente }
}

// Filas de la tabla retenciones_config -> Map clave -> { retenciones, banco }.
export const mapaDeAjustes = filas => new Map((filas ?? []).filter(f => f?.clave).map(f => [f.clave, { retenciones: f.retenciones ?? null, banco: f.banco ?? null }]))

// Perfil de un cobro: el de su cliente, o el general si no se sabe de quién es.
export const perfilOGeneral = m => perfilDeCobro(m) ?? PERFIL_GENERAL

// Desglose estimado de un cobro (importe CON IVA). `fuente` = { retenciones, banco? } (un perfil sirve: tiene `retenciones`).
//   { neto, iva, retenciones: [{ clave, etiqueta, tipo: 'retencion', esIVA, tasa, base, monto, detalle }], banco: [...tipo 'banco'],
//     totalRetenido, alBanco, bancoImpuestos, disponible }
export function desgloseDeCobro(bruto, fuente) {
  const neto = redondear(bruto / (1 + IVA_FACTURAS))
  const iva = redondear(bruto - neto)
  const baseDe = b => (b === 'neto' ? neto : b === 'iva' ? iva : bruto)
  const retItems = normalizarItems(fuente?.retenciones) ?? []
  const retenciones = retItems.map(r => ({
    clave: r.clave, etiqueta: r.etiqueta, tipo: 'retencion', esIVA: r.esIVA, tasa: r.tasa, base: r.base,
    monto: r.base === 'monto' ? redondear(r.monto) : redondear(baseDe(r.base) * r.tasa),
    detalle: r.base === 'monto' ? 'monto fijo' : `${pct(r.tasa)} ${textoBase[r.base]}`,
  }))
  const totalRetenido = redondear(retenciones.reduce((s, r) => s + r.monto, 0))
  const alBanco = redondear(bruto - totalRetenido)
  const bancoItems = normalizarItems(fuente?.banco, 'acreditado') ?? TASAS_BANCO
  const banco = bancoItems.map(t => ({
    clave: t.clave, etiqueta: t.etiqueta, tipo: 'banco', esIVA: false, tasa: t.tasa, base: 'acreditado',
    monto: redondear(alBanco * t.tasa), detalle: `${pct(t.tasa)} de lo que acredita el banco`,
  }))
  const bancoImpuestos = redondear(banco.reduce((s, r) => s + r.monto, 0))
  return { neto, iva, retenciones, banco, totalRetenido, alBanco, bancoImpuestos, disponible: redondear(alBanco - bancoImpuestos) }
}
