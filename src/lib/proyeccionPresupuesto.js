// src/lib/proyeccionPresupuesto.js
//
// Convierte el presupuesto y las ventas que carga Operaciones en una
// proyección de Cash Flow. Por cada Obra + Rubro + Período presupuestado, lo
// que todavía no se facturó (una factura real con esa misma Obra + Rubro +
// Período) se muestra como una fila virtual "Gasto proyectado" — nunca se
// guarda en la base, así el presupuesto original nunca se toca y la
// proyección se recalcula sola apenas entra una factura real. El saldo
// proyectado nunca baja de $0 (si el gasto real supera el presupuesto, el
// excedente ya está reflejado por la factura real misma).
//
// Misma lógica para las ventas proyectadas: por cada Obra + Período, lo que
// Operaciones estimó vender menos lo que ya entró como venta real (cualquier
// movimiento de Ventas con esa Obra + Período, se haya cargado con el botón
// "Registrar" o a mano) se muestra como "Venta proyectada". Así nunca queda
// duplicado un movimiento cargado a mano por fuera del botón Registrar.
//
// El gasto proyectado sigue proyectando recién desde el mes que viene (el mes
// en curso se considera "ya sucediendo" y no genera proyección nueva). La
// venta proyectada, en cambio, ya afecta el saldo desde el mes en curso.
//
// La fecha de estas filas grises arranca en el último día del período, pero
// Finanzas la puede pisar con una fecha estimada propia (ver
// gasto_proyectado_fecha_estimada y venta_proyectada_fecha_estimada) sin
// tocar el presupuesto/venta original de Operaciones.

export function ultimoDiaPeriodo(periodo) {
  const [anio, mes] = periodo.split('-').map(Number)
  const ultimo = new Date(anio, mes, 0) // día 0 del mes siguiente = último día de "mes"
  return `${ultimo.getFullYear()}-${String(ultimo.getMonth() + 1).padStart(2, '0')}-${String(ultimo.getDate()).padStart(2, '0')}`
}

function inicioMesDe(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-01`
}

function mesSiguienteA(fecha) {
  const d = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// presupuestos: [{ obra_id, rubro_id, periodo, monto }]
// movimientos:  [{ categoria, tipo, obra_id, rubro_id, periodo, monto_bruto, estado_proyeccion }]
// fechasEstimadas: [{ obra_id, rubro_id, periodo, fecha_estimada }] (gasto_proyectado_fecha_estimada)
// obras:        [{ id, ... }] -- solo obras activas: una obra ya cerrada no
//   genera proyección nueva en el Cash Flow.
// Devuelve: [{ obra_id, rubro_id, periodo, presupuestado, gastoReal, saldoProyectado, fechaPago }]
export function calcularGastosProyectados(presupuestos, movimientos, fechasEstimadas = [], obras = [], hoy = new Date()) {
  const desde = mesSiguienteA(hoy)
  const obrasActivas = new Set(obras.map(o => o.id))

  const presPorClave = {}
  presupuestos.forEach(p => {
    if (!p.obra_id || !p.rubro_id || !p.periodo) return
    if (p.periodo < desde) return
    if (!obrasActivas.has(p.obra_id)) return
    const k = `${p.obra_id}|${p.rubro_id}|${p.periodo}`
    presPorClave[k] = (presPorClave[k] ?? 0) + Number(p.monto)
  })

  const gastoPorClave = {}
  movimientos.forEach(m => {
    if (m.categoria !== 'factura' || m.tipo !== 'egreso') return
    if (m.estado_proyeccion === 'no_cumple') return
    if (!m.obra_id || !m.rubro_id || !m.periodo) return
    const k = `${m.obra_id}|${m.rubro_id}|${m.periodo}`
    gastoPorClave[k] = (gastoPorClave[k] ?? 0) + Number(m.monto_bruto)
  })

  const fechaEstimadaPorClave = {}
  const cerradoPorClave = {}
  ;(fechasEstimadas ?? []).forEach(f => {
    const k = `${f.obra_id}|${f.rubro_id}|${f.periodo}`
    fechaEstimadaPorClave[k] = f.fecha_estimada
    cerradoPorClave[k] = f.cerrado
  })

  const resultado = []
  Object.entries(presPorClave).forEach(([k, presupuestado]) => {
    if (cerradoPorClave[k]) return // Finanzas revisó y cerró esta proyección a mano
    const gastoReal = gastoPorClave[k] ?? 0
    const saldoProyectado = Math.max(0, presupuestado - gastoReal)
    if (saldoProyectado <= 0) return
    const [obra_id, rubro_id, periodo] = k.split('|')
    const fechaPago = fechaEstimadaPorClave[k] ?? ultimoDiaPeriodo(periodo)
    resultado.push({ obra_id, rubro_id, periodo, presupuestado, gastoReal, saldoProyectado, fechaPago })
  })
  return resultado
}

// Arma un objeto con la misma forma que un movimiento real, para que fluya por
// los mismos cálculos de saldo/filtros/orden que ya existen en el Cash Flow.
// Se marca con _virtual para que la UI no ofrezca Editar/Ajustar/Proyección
// (solo un editor de fecha estimada, ver _claveFecha).
export function construirFilaVirtual(proyectado, obras, rubros) {
  const obra = obras.find(o => o.id === proyectado.obra_id)
  const rubro = rubros.find(r => r.id === proyectado.rubro_id)
  const key = `${proyectado.obra_id}|${proyectado.rubro_id}|${proyectado.periodo}`
  return {
    id: `virtual-${key}`,
    _virtual: true,
    _presupuestado: proyectado.presupuestado,
    _gastoReal: proyectado.gastoReal,
    _claveFecha: { obra_id: proyectado.obra_id, rubro_id: proyectado.rubro_id, periodo: proyectado.periodo },
    tipo: 'egreso',
    categoria: 'gasto_proyectado',
    proveedor_cliente: null,
    numero_factura: null,
    concepto: 'Saldo de presupuesto todavía sin facturar',
    observaciones: null,
    periodo: proyectado.periodo,
    fecha_pago: proyectado.fechaPago,
    fecha_pago_original: null,
    estado: 'proyectado',
    estado_proyeccion: 'normal',
    cuenta_id: null,
    obra_id: proyectado.obra_id,
    rubro_id: proyectado.rubro_id,
    obras: obra ? { id: obra.id, codigo: obra.codigo, nombre: obra.nombre } : null,
    rubros: rubro ? { id: rubro.id, nombre: rubro.nombre } : null,
    cuentas: null,
    monto_bruto: proyectado.saldoProyectado,
    monto_neto: null,
    montoEfectivo: proyectado.saldoProyectado,
  }
}

// ventasProyectadas: [{ obra_id, periodo, monto }]  (se suman TODAS, registradas
//   o no: si ya se registraron, su movimiento real ya las va a descontar solo)
// movimientos:        [{ categoria, tipo, obra_id, periodo, monto_bruto, estado_proyeccion }]
// fechasEstimadas:    [{ obra_id, periodo, fecha_estimada }] (venta_proyectada_fecha_estimada)
// obras:              [{ id, ... }] -- solo obras activas: una obra ya cerrada
//   no genera proyección nueva en el Cash Flow.
// Devuelve: [{ obra_id, periodo, presupuestado, ventaReal, saldoProyectado, fechaPago, afectaCashflow }]
//
// A diferencia del gasto proyectado, acá se muestra el saldo pendiente de
// TODOS los períodos (incluidos los anteriores al mes en curso), para que
// Finanzas siempre vea si quedó una venta proyectada vieja sin facturar. Pero
// solo las del mes en curso en adelante suman/restan en el saldo acumulado
// del Cash Flow -- las anteriores quedan como dato informativo
// (afectaCashflow: false), porque esos períodos ya pasaron del todo y no son
// una proyección real de caja futura.
export function calcularVentasProyectadas(ventasProyectadas, movimientos, fechasEstimadas = [], obras = [], hoy = new Date()) {
  const desde = inicioMesDe(hoy)
  const obrasActivas = new Set(obras.map(o => o.id))

  const presPorClave = {}
  ;(ventasProyectadas ?? []).forEach(v => {
    if (!v.obra_id || !v.periodo) return
    if (!obrasActivas.has(v.obra_id)) return
    const k = `${v.obra_id}|${v.periodo}`
    presPorClave[k] = (presPorClave[k] ?? 0) + Number(v.monto)
  })

  const ventaRealPorClave = {}
  movimientos.forEach(m => {
    if (m.categoria !== 'ingreso_cliente' || m.tipo !== 'ingreso') return
    if (m.estado_proyeccion === 'no_cumple') return
    if (!m.obra_id || !m.periodo) return
    const k = `${m.obra_id}|${m.periodo}`
    ventaRealPorClave[k] = (ventaRealPorClave[k] ?? 0) + Number(m.monto_bruto)
  })

  const fechaEstimadaPorClave = {}
  const cerradoPorClave = {}
  const conceptoPorClave = {}
  ;(fechasEstimadas ?? []).forEach(f => {
    const k = `${f.obra_id}|${f.periodo}`
    fechaEstimadaPorClave[k] = f.fecha_estimada
    cerradoPorClave[k] = f.cerrado
    conceptoPorClave[k] = f.concepto
  })

  const resultado = []
  Object.entries(presPorClave).forEach(([k, presupuestado]) => {
    if (cerradoPorClave[k]) return // Finanzas revisó y cerró esta proyección a mano
    const ventaReal = ventaRealPorClave[k] ?? 0
    const saldoProyectado = Math.max(0, presupuestado - ventaReal)
    if (saldoProyectado <= 0) return
    const [obra_id, periodo] = k.split('|')
    const fechaPago = fechaEstimadaPorClave[k] ?? ultimoDiaPeriodo(periodo)
    const concepto = conceptoPorClave[k] ?? null
    // Por default se mira el período: si es viejo, es solo informativo. Pero
    // si Finanzas pisó la fecha a mano con "Editar fecha" (fechaEstimadaPorClave),
    // es porque sabe cuándo se va a cobrar de verdad -- esa fecha manda, aunque
    // el período original ya haya pasado.
    const afectaCashflow = fechaPago >= desde
    resultado.push({ obra_id, periodo, presupuestado, ventaReal, saldoProyectado, fechaPago, concepto, afectaCashflow })
  })
  return resultado
}

// Cobertura de venta proyectada por Obra + Período: cuánto de lo proyectado
// por Operaciones ya está cubierto por ingresos reales de Ventas, sin
// importar qué fila puntual (rubro) lo originó ni cómo se cargó el ingreso
// real. Reemplaza al flag manual "registrado" (que solo se activaba si
// Finanzas usaba un botón dedicado, y quedaba desactualizado si el ingreso
// se cargaba directo en Movimientos como cualquier otro). Se usa tanto para
// bloquear la edición en Operaciones como para el estado de solo lectura
// que ve Finanzas.
// ventasProyectadas: [{ obra_id, periodo, monto }]
// movimientos:       [{ categoria, tipo, obra_id, periodo, monto_bruto, estado_proyeccion }]
// Devuelve: { 'obra_id|periodo': { proyectado, real, pendiente, cubierto } }
export function calcularCoberturaVentas(ventasProyectadas, movimientos) {
  const proyectadoPorClave = {}
  ;(ventasProyectadas ?? []).forEach(v => {
    if (!v.obra_id || !v.periodo) return
    const k = `${v.obra_id}|${v.periodo}`
    proyectadoPorClave[k] = (proyectadoPorClave[k] ?? 0) + Number(v.monto)
  })

  const realPorClave = {}
  ;(movimientos ?? []).forEach(m => {
    if (m.categoria !== 'ingreso_cliente' || m.tipo !== 'ingreso') return
    if (m.estado_proyeccion === 'no_cumple') return
    if (!m.obra_id || !m.periodo) return
    const k = `${m.obra_id}|${m.periodo}`
    realPorClave[k] = (realPorClave[k] ?? 0) + Number(m.monto_bruto)
  })

  const resultado = {}
  Object.keys(proyectadoPorClave).forEach(k => {
    const proyectado = proyectadoPorClave[k]
    const real = realPorClave[k] ?? 0
    const pendiente = Math.max(0, proyectado - real)
    resultado[k] = { proyectado, real, pendiente, cubierto: pendiente <= 0 }
  })
  return resultado
}

// Misma idea que construirFilaVirtual pero para el saldo de ventas proyectadas
// todavía sin facturar de una Obra + Período. Conserva el período original del
// presupuesto de ventas (proyectada.periodo) aunque la fecha se haya movido a
// otro mes con "Editar fecha" — así en el Cash Flow siempre se sabe de qué mes
// viene, y Finanzas puede anotar un concepto propio (proyectada.concepto).
export function construirFilaVirtualVenta(proyectada, obras) {
  const obra = obras.find(o => o.id === proyectada.obra_id)
  const key = `${proyectada.obra_id}|${proyectada.periodo}`
  return {
    id: `virtual-venta-${key}`,
    _virtual: true,
    _presupuestado: proyectada.presupuestado,
    _gastoReal: proyectada.ventaReal,
    _conceptoManual: proyectada.concepto ?? null,
    _afectaCashflow: proyectada.afectaCashflow !== false,
    _claveFecha: { obra_id: proyectada.obra_id, periodo: proyectada.periodo },
    tipo: 'ingreso',
    categoria: 'venta_proyectada',
    proveedor_cliente: null,
    numero_factura: null,
    concepto: 'Venta proyectada — saldo sin facturar',
    observaciones: null,
    periodo: proyectada.periodo,
    fecha_pago: proyectada.fechaPago,
    fecha_pago_original: null,
    estado: 'proyectado',
    estado_proyeccion: 'normal',
    cuenta_id: null,
    obra_id: proyectada.obra_id,
    rubro_id: null,
    obras: obra ? { id: obra.id, codigo: obra.codigo, nombre: obra.nombre } : null,
    rubros: null,
    cuentas: null,
    monto_bruto: proyectada.saldoProyectado,
    monto_neto: null,
    montoEfectivo: proyectada.saldoProyectado,
  }
}

// Combina movimientos reales con las filas virtuales de proyección (gastos
// pendientes de facturar + ventas pendientes de facturar) y ordena por fecha
// de pago (a igualdad de fecha, los reales van antes que las proyecciones, y
// después se desempata por id para que el orden sea estable).
export function combinarConProyeccion(movimientos, presupuestos, ventasProyectadas, fechasEstimadasGasto, fechasEstimadasVenta, obras, rubros, hoy = new Date()) {
  const gastosProyectados = calcularGastosProyectados(presupuestos, movimientos, fechasEstimadasGasto, obras, hoy)
  const ventasPendientes  = calcularVentasProyectadas(ventasProyectadas, movimientos, fechasEstimadasVenta, obras, hoy)
  const virtuales = [
    ...gastosProyectados.map(p => construirFilaVirtual(p, obras, rubros)),
    ...ventasPendientes.map(v => construirFilaVirtualVenta(v, obras)),
  ]
  return [...movimientos, ...virtuales].sort((a, b) => {
    const fa = a.fecha_pago ?? a.periodo ?? ''
    const fb = b.fecha_pago ?? b.periodo ?? ''
    if (fa !== fb) return fa < fb ? -1 : 1
    if (!!a._virtual !== !!b._virtual) return a._virtual ? 1 : -1
    return String(a.id).localeCompare(String(b.id))
  })
}
