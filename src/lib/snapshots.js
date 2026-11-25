// src/lib/snapshots.js
//
// Historial de proyecciones ("fotos"). Cálculo puro, sin pantalla ni base de datos.
//
// Una foto congela cómo estaba la proyección de caja en un momento: números clave,
// ingresos y egresos por mes y por concepto, la curva de caja día por día y las líneas
// pendientes. Después se pueden comparar dos fotos (por ejemplo, las de hace 2 semanas
// contra las de hoy) y ver, en plata, qué cambió.
//
// Se arma a partir de lo que ya calcula el panel (`construirBase` + `simular`), así los
// números de la foto son exactamente los de las cards y el gráfico del Cash Flow.

export const VERSION_SNAPSHOT = 2 // 2: las ventas van en neto y se guarda el bruto y las retenciones estimadas

// Cada línea pendiente cae en un concepto. `tipo` es hacia dónde mueve la caja.
export const CONCEPTOS = {
  cobros_registrados:        { label: 'Cobros de facturas emitidas (neto)', tipo: 'ingreso' },
  ventas_proyectadas:        { label: 'Ventas proyectadas (neto)',       tipo: 'ingreso' },
  facturas_registradas:      { label: 'Facturas a pagar (registradas)',  tipo: 'egreso' },
  gasto_proyectado:          { label: 'Gasto proyectado sin facturar',   tipo: 'egreso' },
  impuestos_ventas:          { label: 'Impuestos por ventas (fotos viejas)', tipo: 'egreso' },
  sueldos:                   { label: 'Sueldos',                         tipo: 'egreso' },
  impuestos_registrados:     { label: 'Impuestos registrados',           tipo: 'egreso' },
  debitos_automaticos:       { label: 'Débitos automáticos',             tipo: 'egreso' },
  otros_egresos_registrados: { label: 'Otros egresos registrados',       tipo: 'egreso' },
  fima:                      { label: 'FIMA (traspasos)',                tipo: 'fima' },
}

export const ORDEN_CONCEPTOS = Object.keys(CONCEPTOS)

export const redondear = n => Math.round((Number(n) || 0) * 100) / 100

// Concepto de una línea del índice de `construirBase` ({ tipo, categoria, esFima, ... }).
export function conceptoDe(item) {
  if (item.esFima || item.categoria === 'fima') return 'fima'
  if (item.categoria === 'venta_proyectada') return 'ventas_proyectadas'
  if (item.categoria === 'gasto_proyectado') return 'gasto_proyectado'
  if (item.categoria === 'impuesto_venta_proyectado') return 'impuestos_ventas'
  if (item.tipo === 'ingreso') return 'cobros_registrados'
  if (item.categoria === 'factura') return 'facturas_registradas'
  if (item.categoria === 'sueldo') return 'sueldos'
  if (item.categoria === 'impuesto') return 'impuestos_registrados'
  if (item.categoria === 'debito_automatico') return 'debitos_automaticos'
  return 'otros_egresos_registrados'
}

const mesDe = fecha => String(fecha).slice(0, 7) // 'YYYY-MM'
const ddmmaaaa = iso => (iso ? String(iso).split('-').reverse().join('/') : '') // '2026-11-12' -> '12/11/2026'
const diasEntre = (d1, d2) => Math.round((new Date(d2 + 'T00:00:00') - new Date(d1 + 'T00:00:00')) / 86400000)

// Foto compacta de una línea pendiente.
function filaCompacta(item) {
  return {
    id: String(item.id),
    fecha: item.fecha,
    tipo: item.tipo,
    monto: redondear(item.monto),
    concepto: conceptoDe(item),
    etiqueta: item.etiqueta ?? '',
    obra: item.obra ?? '',
    rubro: item.rubro ?? '',
    periodo: item.periodo ?? null,
    factura: item.numeroFactura ?? '',
    virtual: !!item.virtual,
    // Solo en las ventas: el importe de la factura y lo que se estima que se retiene (el monto de arriba ya es el neto).
    ...(item.brutoFC != null ? { bruto: redondear(item.brutoFC), retenido: redondear(item.retenidoEst), banco: redondear(item.bancoEst) } : {}),
  }
}

function minimo(valores, fechas) {
  let iMin = 0
  valores.forEach((v, i) => { if (v < valores[iMin]) iMin = i })
  return { valor: redondear(valores[iMin]), fecha: fechas[iMin] }
}

function primerNegativo(valores, fechas) {
  const i = valores.findIndex(v => v < -0.005)
  return i >= 0 ? fechas[i] : null
}

// Arma el contenido de la foto.
//   base:      resultado de construirBase (fechas, banco, fondos, indice)
//   resultado: simular(base, null)  → { banco, fima, total, ... }
//   hoy:       'YYYY-MM-DD' (día de corte)
export function armarSnapshot({ base, resultado, hoy }) {
  const { fechas } = base
  const items = [...base.indice.values()]

  const porConcepto = {}
  ORDEN_CONCEPTOS.forEach(c => { porConcepto[c] = 0 })
  const mensual = {}
  let ingresos = 0, egresos = 0, fimaNeto = 0
  let ventasBruto = 0, retenciones = 0, impuestosBanco = 0 // de las ventas pendientes (el cobro ya va en neto)

  for (const it of items) {
    const c = conceptoDe(it)
    const monto = Number(it.monto) || 0
    const signo = it.tipo === 'ingreso' ? 1 : -1
    if (c === 'fima') {
      fimaNeto += signo * monto
      porConcepto.fima += signo * monto
    } else {
      porConcepto[c] += monto
      if (CONCEPTOS[c].tipo === 'ingreso') ingresos += monto; else egresos += monto
    }
    if (it.brutoFC != null) {
      ventasBruto += Number(it.brutoFC) || 0
      retenciones += Number(it.retenidoEst) || 0
      impuestosBanco += Number(it.bancoEst) || 0
    }
    const m = (mensual[mesDe(it.fecha)] ??= {})
    m[c] = (m[c] ?? 0) + (c === 'fima' ? signo * monto : monto)
  }
  Object.values(mensual).forEach(m => Object.keys(m).forEach(k => { m[k] = redondear(m[k]) }))
  ORDEN_CONCEPTOS.forEach(c => { porConcepto[c] = redondear(porConcepto[c]) })

  const banco = resultado.banco.map(redondear)
  const total = resultado.total.map(redondear)
  const n = fechas.length

  const resumen = {
    caja_hoy: banco[0],
    total_hoy: total[0],
    caja_final: banco[n - 1],
    total_final: total[n - 1],
    fecha_final: fechas[n - 1],
    caja_minima: minimo(banco, fechas),
    total_minimo: minimo(total, fechas),
    primer_dia_caja_negativa: primerNegativo(banco, fechas),
    ingresos_pendientes: redondear(ingresos),
    egresos_pendientes: redondear(egresos),
    fima_neto: redondear(fimaNeto),
    ventas_bruto_pendientes: redondear(ventasBruto),
    retenciones_pendientes: redondear(retenciones),
    impuestos_banco_pendientes: redondear(impuestosBanco),
    por_concepto: porConcepto,
    cantidad_lineas: items.length,
  }

  return {
    version: VERSION_SNAPSHOT,
    fecha_corte: hoy,
    resumen,
    mensual,
    serie: { desde: fechas[0], banco, total },
    filas: items.map(filaCompacta).sort((x, y) => x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : x.id < y.id ? -1 : 1),
  }
}

// ─── Comparación ──────────────────────────────────────────────────────────────

const clave = f => `${f.concepto}|${f.obra}|${f.rubro}|${f.periodo ?? ''}`

// Suma de egresos (o ingresos) de las líneas con fecha en [desde, hasta) — sin FIMA.
function sumaVentana(filas, tipo, desde, hasta) {
  let s = 0
  for (const f of filas) {
    if (f.concepto === 'fima' || f.tipo !== tipo) continue
    if (f.fecha >= desde && f.fecha < hasta) s += f.monto
  }
  return redondear(s)
}

// Qué pasó con el total pendiente entre la foto A (anterior) y la B (nueva):
//   inicial − les_toco (ya vencieron entre ambas fotos) + ajustes = final
// `ajustes` es todo lo que se agregó, subió, bajó o se movió de fecha.
function explicarTotal(a, b, tipo) {
  const campo = tipo === 'egreso' ? 'egresos_pendientes' : 'ingresos_pendientes'
  const inicial = a.resumen[campo]
  const final = b.resumen[campo]
  const lesToco = sumaVentana(a.filas, tipo, a.fecha_corte, b.fecha_corte)
  const ajustes = redondear(final - (inicial - lesToco))
  return { inicial, lesToco, ajustes, final }
}

// Diferencias por mes y concepto: [{ mes, concepto, a, b, dif }], ordenado por mes.
function diferenciasMensuales(a, b) {
  const meses = [...new Set([...Object.keys(a.mensual), ...Object.keys(b.mensual)])].sort()
  const filas = []
  for (const mes of meses) {
    for (const c of ORDEN_CONCEPTOS) {
      const va = a.mensual[mes]?.[c] ?? 0
      const vb = b.mensual[mes]?.[c] ?? 0
      if (va === 0 && vb === 0) continue
      filas.push({ mes, concepto: c, a: va, b: vb, dif: redondear(vb - va) })
    }
  }
  return filas
}

// Egresos e ingresos pendientes por obra: [{ obra, egresoA, egresoB, ingresoA, ingresoB }].
function diferenciasPorObra(a, b) {
  const mapa = new Map()
  const acumular = (filas, lado) => {
    for (const f of filas) {
      if (f.concepto === 'fima') continue
      const o = f.obra || '(sin obra)'
      const r = mapa.get(o) ?? { obra: o, egresoA: 0, egresoB: 0, ingresoA: 0, ingresoB: 0 }
      r[(f.tipo === 'egreso' ? 'egreso' : 'ingreso') + lado] += f.monto
      mapa.set(o, r)
    }
  }
  acumular(a.filas, 'A'); acumular(b.filas, 'B')
  return [...mapa.values()].map(r => ({
    ...r,
    egresoA: redondear(r.egresoA), egresoB: redondear(r.egresoB),
    ingresoA: redondear(r.ingresoA), ingresoB: redondear(r.ingresoB),
  }))
}

// Cambios línea por línea. Las líneas registradas se comparan una a una (por id); las proyectadas
// (virtuales) se juntan por concepto + obra + rubro + período, porque su reparto en fechas cambia solo: mover un gasto
// proyectado de un día a otro NO es un cambio, solo lo es que cambie el total de su grupo.
// Devuelve [{ clave, clase, tipo, concepto, etiqueta, obra, rubro, a, b, dif, fechaA, fechaB, motivo }]
//   clase: 'nueva' | 'sacada' | 'monto' | 'fecha' | 'proyeccion'
//   clave: identificador estable del cambio (sirve para guardar una nota a mano sobre él)
//   motivo: el posible porqué, en una frase, deducido de las dos fotos (no es seguro: la nota a mano lo puede aclarar)
// Una línea registrada que estaba en A con fecha anterior al corte de B y ya no está se considera
// "ya les tocó" (se pagó o cobró): no se lista como cambio (ver seguimientoDeLoEsperado para saber qué pasó con ella).
export function cambiosDeLineas(a, b) {
  const cambios = []
  const reales = f => !f.virtual
  const idsB = new Map(b.filas.filter(reales).map(f => [f.id, f]))
  const idsA = new Map(a.filas.filter(reales).map(f => [f.id, f]))

  // Qué había proyectado en A (para saber si una factura nueva lo reemplaza).
  const proyGastoA = new Set(a.filas.filter(f => f.virtual && f.concepto === 'gasto_proyectado').map(f => `${f.obra}|${f.rubro}|${f.periodo ?? ''}`))
  const proyVentaA = new Set(a.filas.filter(f => f.virtual && f.concepto === 'ventas_proyectadas').map(f => `${f.obra}|${f.periodo ?? ''}`))
  const base = (f, extra) => ({ tipo: f.tipo, concepto: f.concepto, etiqueta: f.etiqueta, factura: f.factura, obra: f.obra, rubro: f.rubro, ...extra })

  for (const [id, fb] of idsB) {
    const fa = idsA.get(id)
    if (!fa) {
      let motivo
      if (fb.concepto === 'facturas_registradas') {
        motivo = proyGastoA.has(`${fb.obra}|${fb.rubro}|${fb.periodo ?? ''}`)
          ? 'Se facturó: esta factura reemplaza gasto que estaba proyectado.'
          : 'Gasto nuevo que no estaba proyectado ni cargado en la foto anterior.'
      } else if (fb.concepto === 'cobros_registrados') {
        motivo = proyVentaA.has(`${fb.obra}|${fb.periodo ?? ''}`)
          ? 'Se facturó la venta que estaba proyectada.'
          : 'Cobro nuevo que no estaba en la foto anterior.'
      } else motivo = 'Línea nueva que no estaba en la foto anterior.'
      cambios.push(base(fb, { clave: `linea:${id}`, clase: 'nueva', a: 0, b: fb.monto, dif: fb.monto, fechaA: null, fechaB: fb.fecha, motivo }))
      continue
    }
    if (fa.monto !== fb.monto) {
      cambios.push(base(fb, { clave: `linea:${id}`, clase: 'monto', a: fa.monto, b: fb.monto, dif: redondear(fb.monto - fa.monto), fechaA: fa.fecha, fechaB: fb.fecha,
        motivo: fb.tipo === 'ingreso' ? 'Cambió el importe a cobrar (otro importe de la factura o otras retenciones estimadas).' : 'Cambió el importe de la factura.' }))
    } else if (fa.fecha !== fb.fecha) {
      const atraso = fb.fecha > fa.fecha
      cambios.push(base(fb, { clave: `linea:${id}`, clase: 'fecha', a: fa.monto, b: fb.monto, dif: 0, fechaA: fa.fecha, fechaB: fb.fecha,
        motivo: atraso ? `Se corrió ${diasEntre(fa.fecha, fb.fecha)} días más tarde.` : `Se adelantó ${diasEntre(fb.fecha, fa.fecha)} días.` }))
    }
  }
  for (const [id, fa] of idsA) {
    if (idsB.has(id)) continue
    if (fa.fecha < b.fecha_corte) continue // ya les tocó
    cambios.push(base(fa, { clave: `linea:${id}`, clase: 'sacada', a: fa.monto, b: 0, dif: -fa.monto, fechaA: fa.fecha, fechaB: null,
      motivo: 'Ya no está: se borró, se cerró o se marcó como "no se cumple".' }))
  }

  // Proyectadas: se comparan sumadas por grupo, solo la parte que NO ya les tocó en A.
  const grupos = new Map()
  const sumar = (filas, lado, desde) => {
    for (const f of filas) {
      if (!f.virtual) continue
      if (desde && f.fecha < desde) continue
      const k = clave(f)
      const g = grupos.get(k) ?? { clave: k, concepto: f.concepto, tipo: f.tipo, obra: f.obra, rubro: f.rubro, periodo: f.periodo, etiqueta: f.etiqueta, a: 0, b: 0 }
      g[lado] += f.monto
      grupos.set(k, g)
    }
  }
  sumar(a.filas, 'a', b.fecha_corte)
  sumar(b.filas, 'b')
  // Facturas nuevas de B por obra + rubro + período (para decir "se facturó").
  const nuevasB = [...idsB].filter(([id]) => !idsA.has(id)).map(([, f]) => f)
  const facturasNuevasB = new Set(nuevasB.filter(f => f.concepto === 'facturas_registradas').map(f => `${f.obra}|${f.rubro}|${f.periodo ?? ''}`))
  const cobrosNuevosB = new Set(nuevasB.filter(f => f.concepto === 'cobros_registrados').map(f => `${f.obra}|${f.periodo ?? ''}`))
  for (const g of grupos.values()) {
    const dif = redondear(g.b - g.a)
    if (Math.abs(dif) < 0.005) continue
    let motivo
    if (g.concepto === 'gasto_proyectado') {
      if (dif < 0) motivo = facturasNuevasB.has(`${g.obra}|${g.rubro}|${g.periodo ?? ''}`)
        ? 'Baja lo proyectado porque se cargaron facturas de esta obra, rubro y período.'
        : 'Baja el gasto proyectado: se bajó el presupuesto o se cerró la proyección.'
      else motivo = 'Sube el gasto proyectado: presupuesto nuevo o más alto.'
    } else if (g.concepto === 'ventas_proyectadas') {
      if (dif < 0) motivo = cobrosNuevosB.has(`${g.obra}|${g.periodo ?? ''}`)
        ? 'Baja la venta proyectada porque se facturó.'
        : 'Baja la venta proyectada: se redujo o se cerró.'
      else motivo = 'Sube la venta proyectada.'
    } else motivo = dif < 0 ? 'Baja lo proyectado.' : 'Sube lo proyectado.'
    cambios.push({ clave: `grupo:${g.clave}`, clase: 'proyeccion', tipo: g.tipo, concepto: g.concepto, etiqueta: g.etiqueta, factura: '', obra: g.obra, rubro: g.rubro, periodo: g.periodo, a: redondear(g.a), b: redondear(g.b), dif, fechaA: null, fechaB: null, motivo })
  }

  return cambios.sort((x, y) => Math.abs(y.dif) - Math.abs(x.dif))
}

// ─── Qué pasó con lo que se esperaba entre las dos fotos ──────────────────────────────────────────
// De la foto A, las líneas REGISTRADAS (facturas y cobros reales) con fecha entre el corte de A y el de B: era lo que se esperaba que
// pasara en ese tiempo. Para cada una se mira cómo está hoy y se dice si se cumplió.
//   idsParaConsultar(a, b): las que ya no figuran en B (si siguen en B es que solo se corrieron de fecha): hay que ver cómo están en la base.
//   estados: Map id -> { estado, estado_proyeccion, fecha_pago, monto } según la base de hoy (monto = lo realmente movido).
// resultado: 'cumplido' | 'cumplido_distinto' | 'no_cumplido' | 'reprogramado' | 'no_cumple' | 'sin_dato'
const tolerancia = esperado => Math.max(1000, Math.abs(esperado) * 0.01) // hasta $ 1.000 o 1% de diferencia se considera igual

const candidatasDeA = (a, b) => a.filas.filter(f => !f.virtual && f.concepto !== 'fima' && f.fecha >= a.fecha_corte && f.fecha < b.fecha_corte)

export function idsParaConsultar(a, b) {
  const idsB = new Set(b.filas.filter(f => !f.virtual).map(f => f.id))
  return candidatasDeA(a, b).filter(f => !idsB.has(f.id)).map(f => f.id)
}

export function seguimientoDeLoEsperado(a, b, estados = new Map()) {
  const filasB = new Map(b.filas.filter(f => !f.virtual).map(f => [f.id, f]))
  const verbo = f => (f.tipo === 'ingreso' ? 'cobró' : 'pagó')
  const lineas = candidatasDeA(a, b).map(f => {
    const base = { clave: `linea:${f.id}`, id: f.id, tipo: f.tipo, concepto: f.concepto, etiqueta: f.etiqueta, factura: f.factura, obra: f.obra, rubro: f.rubro, fechaEsperada: f.fecha, esperado: f.monto, real: null, fechaReal: null, dif: 0 }
    const enB = filasB.get(f.id)
    if (enB) return { ...base, resultado: 'reprogramado', fechaReal: enB.fecha, motivo: `Se esperaba ${f.tipo === 'ingreso' ? 'cobrar' : 'pagar'} el ${ddmmaaaa(f.fecha)} y se corrió al ${ddmmaaaa(enB.fecha)}.` }
    const e = estados.get(f.id)
    if (!e) return { ...base, resultado: 'sin_dato', motivo: 'No se pudo ver cómo quedó (no se consultó o ya no existe).' }
    if (e.estado === 'ejecutado') {
      const real = redondear(e.monto)
      const dif = redondear(real - f.monto)
      if (Math.abs(dif) <= tolerancia(f.monto)) return { ...base, resultado: 'cumplido', real, fechaReal: e.fecha_pago ?? null, motivo: `Se ${verbo(f)} como se esperaba.` }
      return { ...base, resultado: 'cumplido_distinto', real, dif, fechaReal: e.fecha_pago ?? null,
        motivo: `Se ${verbo(f)}, pero por ${dif < 0 ? 'menos' : 'más'} de lo esperado${f.tipo === 'ingreso' ? ' (otras retenciones u otro importe)' : ''}.` }
    }
    if (e.estado_proyeccion === 'no_cumple') return { ...base, resultado: 'no_cumple', motivo: 'Se marcó como que no se cumple.' }
    if (e.fecha_pago && e.fecha_pago >= b.fecha_corte) return { ...base, resultado: 'reprogramado', fechaReal: e.fecha_pago, motivo: `Se esperaba ${f.tipo === 'ingreso' ? 'cobrar' : 'pagar'} el ${ddmmaaaa(f.fecha)} y se corrió al ${ddmmaaaa(e.fecha_pago)}.` }
    return { ...base, resultado: 'no_cumplido', motivo: `Venció el ${ddmmaaaa(f.fecha)} y todavía no se ${verbo(f)}.`, diasAtraso: diasEntre(f.fecha, b.fecha_corte) }
  })
  const totales = {}
  for (const l of lineas) {
    const t = (totales[l.resultado] ??= { cantidad: 0, esperado: 0, real: 0 })
    t.cantidad += 1; t.esperado = redondear(t.esperado + l.esperado); t.real = redondear(t.real + (l.real ?? 0))
  }
  return { lineas, totales, cantidad: lineas.length }
}

// Indicadores clave lado a lado: [{ clave, label, a, b, dif, esFecha? }]
function indicadores(a, b) {
  const ra = a.resumen, rb = b.resumen
  const num = (clave, label, va, vb) => ({ clave, label, a: va, b: vb, dif: redondear(vb - va) })
  return [
    num('caja_hoy', 'Caja del día de la foto', ra.caja_hoy, rb.caja_hoy),
    num('egresos_pendientes', 'Egresos pendientes (todo el horizonte)', ra.egresos_pendientes, rb.egresos_pendientes),
    num('ingresos_pendientes', 'Ingresos pendientes (todo el horizonte)', ra.ingresos_pendientes, rb.ingresos_pendientes),
    num('caja_minima', 'Caja más baja proyectada', ra.caja_minima.valor, rb.caja_minima.valor),
    num('caja_final', 'Caja al final del horizonte', ra.caja_final, rb.caja_final),
    num('total_final', 'Total (caja + FIMA) al final del horizonte', ra.total_final, rb.total_final),
    ...ORDEN_CONCEPTOS.filter(c => ra.por_concepto[c] || rb.por_concepto[c])
      .map(c => num(`concepto_${c}`, CONCEPTOS[c].label, ra.por_concepto[c] ?? 0, rb.por_concepto[c] ?? 0)),
  ]
}

// Compara dos fotos. `a` es la anterior y `b` la más nueva (se ordenan solas por fecha de corte y creación).
export function compararSnapshots(x, y) {
  const [a, b] = ordenar(x, y)
  return {
    a, b,
    diasEntreFotos: Math.round((new Date(b.fecha_corte + 'T00:00:00') - new Date(a.fecha_corte + 'T00:00:00')) / 86400000),
    indicadores: indicadores(a, b),
    egresos: explicarTotal(a, b, 'egreso'),
    ingresos: explicarTotal(a, b, 'ingreso'),
    ventasEnNeto: ventasEnNeto(a, b),
    mensual: diferenciasMensuales(a, b),
    porObra: diferenciasPorObra(a, b),
    cambios: cambiosDeLineas(a, b),
  }
}

// Ventas pendientes en bruto, retenciones e impuestos del banco de cada foto. Las fotos viejas (versión 1) no traen este dato:
// ahí devuelve null y la pantalla no lo muestra.
function ventasEnNeto(a, b) {
  const de = f => (f.resumen.retenciones_pendientes == null ? null : {
    bruto: f.resumen.ventas_bruto_pendientes, retenciones: f.resumen.retenciones_pendientes, banco: f.resumen.impuestos_banco_pendientes,
    neto: redondear(f.resumen.ventas_bruto_pendientes - f.resumen.retenciones_pendientes - f.resumen.impuestos_banco_pendientes),
  })
  const A = de(a), B = de(b)
  return A && B ? { a: A, b: B } : null
}

function ordenar(x, y) {
  const kx = `${x.fecha_corte}|${x.created_at ?? ''}`, ky = `${y.fecha_corte}|${y.created_at ?? ''}`
  return kx <= ky ? [x, y] : [y, x]
}

// Curvas de caja de dos fotos alineadas por fecha, para superponerlas en el gráfico.
// Devuelve { fechas, a, b } desde el día de la foto más nueva hasta el último día que tienen en común.
export function alinearSeries(a, b, cual = 'banco') {
  const sumarDias = (iso, n) => {
    const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const diasEntre = (d1, d2) => Math.round((new Date(d2 + 'T00:00:00') - new Date(d1 + 'T00:00:00')) / 86400000)
  const desde = a.serie.desde >= b.serie.desde ? a.serie.desde : b.serie.desde
  const finA = sumarDias(a.serie.desde, a.serie[cual].length - 1)
  const finB = sumarDias(b.serie.desde, b.serie[cual].length - 1)
  const hasta = finA <= finB ? finA : finB
  const n = diasEntre(desde, hasta) + 1
  if (n < 2) return { fechas: [], a: [], b: [] }
  const fechas = [], va = [], vb = []
  for (let i = 0; i < n; i++) {
    fechas.push(sumarDias(desde, i))
    va.push(a.serie[cual][diasEntre(a.serie.desde, desde) + i])
    vb.push(b.serie[cual][diasEntre(b.serie.desde, desde) + i])
  }
  return { fechas, a: va, b: vb }
}
