// src/lib/proyeccionPresupuesto.js
//
// Convierte el presupuesto que carga Operaciones en una proyección de gasto
// futuro para el Cash Flow. Por cada Obra + Rubro + Período presupuestado, lo
// que todavía no se facturó (una factura real con esa misma Obra + Rubro +
// Período) se muestra como una fila virtual "Gasto proyectado" en el último
// día calendario del período — nunca se guarda en la base, así el presupuesto
// original nunca se toca y la proyección se recalcula sola apenas entra una
// factura real. El saldo proyectado nunca baja de $0 (si el gasto real supera
// el presupuesto, el excedente ya está reflejado por la factura real misma).
//
// Solo proyecta desde el mes que viene: el mes en curso se considera
// "ya sucediendo" y no genera proyección nueva.

export function ultimoDiaPeriodo(periodo) {
  const [anio, mes] = periodo.split('-').map(Number)
  const ultimo = new Date(anio, mes, 0) // día 0 del mes siguiente = último día de "mes"
  return `${ultimo.getFullYear()}-${String(ultimo.getMonth() + 1).padStart(2, '0')}-${String(ultimo.getDate()).padStart(2, '0')}`
}

function mesSiguienteA(fecha) {
  const d = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// presupuestos: [{ obra_id, rubro_id, periodo, monto }]
// movimientos:  [{ categoria, tipo, obra_id, rubro_id, periodo, monto_bruto, estado_proyeccion }]
// Devuelve: [{ obra_id, rubro_id, periodo, presupuestado, gastoReal, saldoProyectado, fechaPago }]
export function calcularGastosProyectados(presupuestos, movimientos, hoy = new Date()) {
  const desde = mesSiguienteA(hoy)

  const presPorClave = {}
  presupuestos.forEach(p => {
    if (!p.obra_id || !p.rubro_id || !p.periodo) return
    if (p.periodo < desde) return
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

  const resultado = []
  Object.entries(presPorClave).forEach(([k, presupuestado]) => {
    const gastoReal = gastoPorClave[k] ?? 0
    const saldoProyectado = Math.max(0, presupuestado - gastoReal)
    if (saldoProyectado <= 0) return
    const [obra_id, rubro_id, periodo] = k.split('|')
    resultado.push({ obra_id, rubro_id, periodo, presupuestado, gastoReal, saldoProyectado, fechaPago: ultimoDiaPeriodo(periodo) })
  })
  return resultado
}

// Arma un objeto con la misma forma que un movimiento real, para que fluya por
// los mismos cálculos de saldo/filtros/orden que ya existen en el Cash Flow.
// Se marca con _virtual para que la UI no ofrezca Editar/Ajustar/Proyección.
export function construirFilaVirtual(proyectado, obras, rubros) {
  const obra = obras.find(o => o.id === proyectado.obra_id)
  const rubro = rubros.find(r => r.id === proyectado.rubro_id)
  const key = `${proyectado.obra_id}|${proyectado.rubro_id}|${proyectado.periodo}`
  return {
    id: `virtual-${key}`,
    _virtual: true,
    _presupuestado: proyectado.presupuestado,
    _gastoReal: proyectado.gastoReal,
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

// Ventas proyectadas: Operaciones carga una venta esperada por Obra + Período
// (con un rubro propio de ventas, no el de gastos). Mientras Finanzas no la
// registre (ventas_proyectadas.registrado = false) se muestra como fila
// virtual "Venta proyectada" en el último día del período, con el monto
// presupuestado. No hay que "consumir" nada: apenas se registra queda un
// movimiento real (con su fecha y monto reales, que pueden diferir de lo
// proyectado) y la fila virtual deja de generarse sola, sin duplicar nada.
export function calcularVentasProyectadas(ventasProyectadas, hoy = new Date()) {
  const desde = mesSiguienteA(hoy)
  return (ventasProyectadas ?? [])
    .filter(v => !v.registrado && v.obra_id && v.periodo && v.periodo >= desde)
    .map(v => ({ id: v.id, obra_id: v.obra_id, periodo: v.periodo, monto: Number(v.monto), fechaPago: ultimoDiaPeriodo(v.periodo) }))
}

// Misma idea que construirFilaVirtual pero para una venta proyectada pendiente.
export function construirFilaVirtualVenta(proyectada, obras) {
  const obra = obras.find(o => o.id === proyectada.obra_id)
  return {
    id: `virtual-venta-${proyectada.id}`,
    _virtual: true,
    tipo: 'ingreso',
    categoria: 'venta_proyectada',
    proveedor_cliente: null,
    numero_factura: null,
    concepto: 'Venta proyectada — todavía sin registrar',
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
    monto_bruto: proyectada.monto,
    monto_neto: null,
    montoEfectivo: proyectada.monto,
  }
}

// Combina movimientos reales con las filas virtuales de proyección (gastos
// pendientes de facturar + ventas pendientes de registrar) y ordena por fecha
// de pago (a igualdad de fecha, los reales van antes que las proyecciones, y
// después se desempata por id para que el orden sea estable).
export function combinarConProyeccion(movimientos, presupuestos, ventasProyectadas, obras, rubros, hoy = new Date()) {
  const gastosProyectados = calcularGastosProyectados(presupuestos, movimientos, hoy)
  const ventasPendientes  = calcularVentasProyectadas(ventasProyectadas, hoy)
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
