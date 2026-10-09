// src/lib/useCajaBase.js
//
// Carga (solo lectura) lo necesario para dibujar la evolución de la caja y arma la
// serie diaria: caja de los bancos y saldo de cada fondo FIMA, de hoy a un año.
// Es el mismo cálculo que usa el Cash Flow (movimientos reales + gasto y venta
// proyectados, con las facturas descontando lo proyectado), así los números
// coinciden con las cards del Cash Flow y del Directorio.

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { combinarConProyeccion } from './proyeccionPresupuesto'
import { useFimaDatos, construirBase, simular } from '../pages/directorio/escenarios'

function hoyISO() {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`
}

export default function useCajaBase() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const fima = useFimaDatos()

  useEffect(() => {
    let vivo = true
    async function cargar() {
      const [
        { data: movData, error: e1 }, { data: notasData }, { data: saldosCuenta },
        { data: obras }, { data: rubros }, { data: presupuestos }, { data: ventas },
        { data: fechasGasto }, { data: fechasVenta },
      ] = await Promise.all([
        supabase.from('movimientos').select(`
          id, tipo, categoria, proveedor_cliente, numero_factura, monto_bruto, monto_neto, concepto,
          periodo, fecha_pago, estado, cuenta_id, obra_id, rubro_id, created_at,
          estado_proyeccion, fecha_pago_original, fondo_id,
          obras ( id, codigo, nombre ), rubros ( id, nombre ), cuentas ( id, nombre )
        `)
          .order('fecha_pago', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true })
          .order('id', { ascending: true }),
        supabase.from('notas').select('movimiento_id, tipo_nota, monto'),
        supabase.from('saldos_iniciales').select('id, cuenta_id, monto, fecha, created_at')
          .order('fecha', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('obras').select('id, codigo, nombre, activa').eq('activa', true).order('codigo'),
        supabase.from('rubros').select('id, nombre, tipo, activo').eq('activo', true).order('nombre'),
        supabase.from('presupuestos').select('id, obra_id, rubro_id, periodo, monto'),
        supabase.from('ventas_proyectadas').select('id, obra_id, periodo, monto, registrado'),
        supabase.from('gasto_proyectado_fecha_estimada').select('obra_id, rubro_id, periodo, fecha_estimada, cerrado'),
        supabase.from('venta_proyectada_fecha_estimada').select('obra_id, periodo, fecha_estimada, cerrado, concepto'),
      ])
      if (!vivo) return
      if (e1) { setError('No se pudo cargar la caja.'); return }

      const notasPorMov = {}
      ;(notasData ?? []).forEach(nt => { (notasPorMov[nt.movimiento_id] ??= []).push(nt) })
      const movimientos = (movData ?? []).map(m => {
        const base = m.estado === 'ejecutado' ? Number(m.monto_neto ?? m.monto_bruto ?? 0) : Number(m.monto_bruto ?? 0)
        const notas = notasPorMov[m.id] ?? []
        const deb = notas.filter(x => x.tipo_nota === 'debito').reduce((s, x) => s + Number(x.monto), 0)
        const cred = notas.filter(x => x.tipo_nota === 'credito').reduce((s, x) => s + Number(x.monto), 0)
        return { ...m, montoEfectivo: m.categoria === 'factura' ? base + deb - cred : base }
      })
      const ultimoPorCuenta = {}
      ;(saldosCuenta ?? []).forEach(s => { if (!ultimoPorCuenta[s.cuenta_id]) ultimoPorCuenta[s.cuenta_id] = s })

      setDatos({
        movimientos, saldosBase: Object.values(ultimoPorCuenta),
        obras: obras ?? [], rubros: rubros ?? [], presupuestos: presupuestos ?? [], ventas: ventas ?? [],
        fechasGasto: fechasGasto ?? [], fechasVenta: fechasVenta ?? [],
      })
    }
    cargar()
    return () => { vivo = false }
  }, [])

  const base = useMemo(() => {
    if (!datos || !fima.cargado) return null
    const hoy = hoyISO()
    const combinados = combinarConProyeccion(datos.movimientos, datos.presupuestos, datos.ventas, datos.fechasGasto, datos.fechasVenta, datos.obras, datos.rubros)
    const sumaBase = datos.saldosBase.reduce((a, s) => a + Number(s.monto ?? 0), 0)
    let saldo = sumaBase
    const conSaldo = combinados.map(m => {
      if (m.estado_proyeccion !== 'no_cumple' && m._afectaCashflow !== false) {
        saldo += m.tipo === 'ingreso' ? m.montoEfectivo : -m.montoEfectivo
      }
      return { ...m, saldoAcumulado: saldo }
    })
    return construirBase({ hoy, movimientos: conSaldo, sumaBase, fondos: fima.fondos, saldosFima: fima.saldos, rendimientos: fima.rendimientos })
  }, [datos, fima])

  const resultado = useMemo(() => (base ? simular(base, null) : null), [base])

  return { base, resultado, cargando: !base && !error, error }
}
