// Retenciones a favor: cuánto hay acumulado, cuánto se va a sumar con los cobros proyectados y cuánto queda para pagar de impuestos.
//
// El saldo de hoy y lo que se debe de cada impuesto vienen del sistema contable y se cargan a mano (tabla retenciones_saldos).
// Lo que se va a sumar sale solo del Cash Flow: cada venta que todavía no se cobró trae su desglose estimado de retenciones
// (`_retenciones`, ver retencionesClientes.js). Todo es estimado: lo exacto está en los recibos y en las declaraciones juradas.

export const TIPOS = [
  { clave: 'iva', etiqueta: 'IVA', grupo: 'iva' },
  { clave: 'ganancias', etiqueta: 'Ganancias', grupo: 'ganancias' },
  { clave: 'iibb_sf', etiqueta: 'IIBB Santa Fe', grupo: 'iibb' },
  { clave: 'iibb_caba', etiqueta: 'IIBB Capital', grupo: 'iibb' },
  { clave: 'iibb_pba', etiqueta: 'IIBB Buenos Aires', grupo: 'iibb' },
  { clave: 'iibb_otras', etiqueta: 'IIBB otras jurisdicciones', grupo: 'iibb' },
  { clave: 'suss', etiqueta: 'SUSS', grupo: 'suss' },
  { clave: 'otras', etiqueta: 'Otras retenciones', grupo: 'otras' },
]
// Los impuestos que se pagan (una retención de IIBB de cualquier provincia se descuenta del mismo IIBB a pagar).
export const GRUPOS = [
  { clave: 'iva', etiqueta: 'IVA' },
  { clave: 'ganancias', etiqueta: 'Ganancias' },
  { clave: 'iibb', etiqueta: 'Ingresos Brutos (IIBB)' },
  { clave: 'suss', etiqueta: 'SUSS' },
  { clave: 'otras', etiqueta: 'Otras' },
]
export const grupoDeTipo = tipo => TIPOS.find(t => t.clave === tipo)?.grupo ?? 'otras'

// A qué tipo pertenece una retención de un cobro (por su clave, su nombre o su marca de IVA).
export function tipoDeRetencion(it) {
  const texto = `${it?.clave ?? ''} ${it?.etiqueta ?? ''}`.toLowerCase()
  if (it?.esIVA || /(^|[^a-z])iva([^a-z]|$)/.test(texto)) return 'iva'
  if (/ganancias/.test(texto)) return 'ganancias'
  if (/suss/.test(texto)) return 'suss'
  if (/iibb|ingresos brutos/.test(texto)) {
    if (/santa fe|sta fe|_sf|\bsf\b/.test(texto)) return 'iibb_sf'
    if (/capital|caba|cap fed/.test(texto)) return 'iibb_caba'
    if (/buenos aires|bs as|pba/.test(texto)) return 'iibb_pba'
    return 'iibb_otras'
  }
  return 'otras'
}

const sumar = (obj, clave, monto) => { obj[clave] = Math.round(((obj[clave] ?? 0) + monto) * 100) / 100 }

// Junta lo que van a retener las ventas todavía no cobradas, por mes de cobro, por tipo y por cliente.
// `filas` = lo que devuelve combinarConProyeccion (las ventas con retenciones traen `_retenciones`).
export function proyectarRetenciones(filas) {
  const meses = {}      // 'AAAA-MM' -> { tipo: monto }
  const porCliente = {} // cliente -> { total, iva, ventas }
  let ventas = 0
  ;(filas ?? []).forEach(m => {
    if (!m._retenciones || m.tipo !== 'ingreso' || !m.fecha_pago) return
    ventas += 1
    const mes = m.fecha_pago.slice(0, 7)
    const cli = (porCliente[m._retenciones.perfil] ??= { total: 0, iva: 0, ventas: 0 })
    cli.ventas += 1
    m._retenciones.retenciones.forEach(it => {
      const tipo = tipoDeRetencion(it)
      sumar((meses[mes] ??= {}), tipo, it.monto)
      cli.total = Math.round((cli.total + it.monto) * 100) / 100
      if (tipo === 'iva') cli.iva = Math.round((cli.iva + it.monto) * 100) / 100
    })
  })
  return { meses, porCliente, ventas }
}

// Fin de mes de 'AAAA-MM' como 'AAAA-MM' (sirve para comparar: lo proyectado hasta ese mes inclusive).
export const sumaHastaMes = (meses, hastaMes) => {
  const por = {}
  Object.entries(meses).forEach(([mes, tipos]) => {
    if (hastaMes && mes > hastaMes) return
    Object.entries(tipos).forEach(([tipo, monto]) => sumar(por, tipo, monto))
  })
  return por
}

// Cuadro por tipo: lo que hay hoy, lo que se suma hasta el mes elegido y lo que queda. `saldos` = { tipo: monto }.
export function resumenPorTipo(saldos, meses, hastaMes) {
  const suma = sumaHastaMes(meses, hastaMes)
  return TIPOS.map(t => {
    const hoy = Number(saldos?.[t.clave] ?? 0)
    const seSuma = suma[t.clave] ?? 0
    return { ...t, hoy, seSuma, proyectado: Math.round((hoy + seSuma) * 100) / 100 }
  })
}

// ¿Cuánto se va a pagar? Por tipo: lo que se debe menos las retenciones a favor DEL MISMO tipo (las de IIBB de una provincia solo se
// descuentan del IIBB de esa provincia; las de IVA, del IVA). Positivo = hay que pagar; negativo = sobra a favor.
// `pagar` = { tipo: monto } con lo que se debe hoy (lo carga Finanzas con el contador). No proyecta impuestos futuros.
export function resumenImpuestos(filasTipo, pagar) {
  return filasTipo.map(t => {
    const debes = Number(pagar?.[t.clave] ?? 0)
    const resultado = Math.round((debes - t.proyectado) * 100) / 100
    return { clave: t.clave, etiqueta: t.etiqueta, aFavor: t.proyectado, debes, resultado, estado: resultado > 0 ? 'pagar' : resultado < 0 ? 'a_favor' : 'parejo' }
  })
}

// Los saldos que vienen de la base (filas { clave, monto, fecha, nota }) separados en saldo por tipo y deuda por impuesto.
export function ordenarSaldos(filas) {
  const saldos = {}, pagar = {}, fechas = [], notas = {}
  ;(filas ?? []).forEach(f => {
    const [tipo, clave] = String(f.clave ?? '').split(':')
    if (!clave) return
    const monto = Number(f.monto)
    if (!Number.isFinite(monto)) return
    if (tipo === 'saldo') saldos[clave] = monto
    else if (tipo === 'pagar') pagar[clave] = monto
    else return
    if (f.fecha) fechas.push(f.fecha)
    if (f.nota) notas[f.clave] = f.nota
  })
  return { saldos, pagar, fechaDato: fechas.sort().slice(-1)[0] ?? null, notas }
}

// Los próximos `cantidad` meses ('AAAA-MM') desde el mes de `hoy` (inclusive), para elegir hasta cuándo proyectar.
export function proximosMeses(hoy = new Date(), cantidad = 12) {
  return Array.from({ length: cantidad }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}
